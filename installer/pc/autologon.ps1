# Starlight Streams - automatisk Windows-login (bruges af install-pc.ps1 og uninstall-pc.ps1)
# The password is stored as the LSA secret "DefaultPassword", like Sysinternals Autologon,
# so it is never written in plain text to the registry.

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class StarlightLsa {
    [StructLayout(LayoutKind.Sequential)]
    struct LSA_UNICODE_STRING {
        public ushort Length;
        public ushort MaximumLength;
        public IntPtr Buffer;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct LSA_OBJECT_ATTRIBUTES {
        public int Length;
        public IntPtr RootDirectory;
        public IntPtr ObjectName;
        public uint Attributes;
        public IntPtr SecurityDescriptor;
        public IntPtr SecurityQualityOfService;
    }

    [DllImport("advapi32.dll")]
    static extern uint LsaOpenPolicy(IntPtr systemName, ref LSA_OBJECT_ATTRIBUTES attributes, uint access, out IntPtr policy);
    [DllImport("advapi32.dll")]
    static extern uint LsaStorePrivateData(IntPtr policy, ref LSA_UNICODE_STRING key, IntPtr data);
    [DllImport("advapi32.dll")]
    static extern uint LsaClose(IntPtr policy);
    [DllImport("advapi32.dll")]
    static extern int LsaNtStatusToWinError(uint status);

    const uint POLICY_CREATE_SECRET = 0x20;

    static LSA_UNICODE_STRING ToLsa(string value) {
        LSA_UNICODE_STRING result = new LSA_UNICODE_STRING();
        result.Buffer = Marshal.StringToHGlobalUni(value);
        result.Length = (ushort)(value.Length * 2);
        result.MaximumLength = (ushort)(value.Length * 2 + 2);
        return result;
    }

    // Stores the secret, or deletes it when value is null
    public static void Store(string key, string value) {
        LSA_OBJECT_ATTRIBUTES attributes = new LSA_OBJECT_ATTRIBUTES();
        attributes.Length = Marshal.SizeOf(attributes);

        IntPtr policy;
        uint status = LsaOpenPolicy(IntPtr.Zero, ref attributes, POLICY_CREATE_SECRET, out policy);
        if (status != 0) {
            throw new System.ComponentModel.Win32Exception(LsaNtStatusToWinError(status));
        }

        LSA_UNICODE_STRING lsaKey = ToLsa(key);
        LSA_UNICODE_STRING lsaValue = new LSA_UNICODE_STRING();
        IntPtr data = IntPtr.Zero;
        try {
            if (value != null) {
                lsaValue = ToLsa(value);
                data = Marshal.AllocHGlobal(Marshal.SizeOf(lsaValue));
                Marshal.StructureToPtr(lsaValue, data, false);
            }
            status = LsaStorePrivateData(policy, ref lsaKey, data);
            // Deleting a secret that doesn't exist is fine
            if (status != 0 && !(value == null && LsaNtStatusToWinError(status) == 2)) {
                throw new System.ComponentModel.Win32Exception(LsaNtStatusToWinError(status));
            }
        } finally {
            if (data != IntPtr.Zero) Marshal.FreeHGlobal(data);
            if (lsaValue.Buffer != IntPtr.Zero) {
                // Overwrite the password before freeing it
                Marshal.Copy(new byte[lsaValue.MaximumLength], 0, lsaValue.Buffer, lsaValue.MaximumLength);
                Marshal.FreeHGlobal(lsaValue.Buffer);
            }
            Marshal.FreeHGlobal(lsaKey.Buffer);
            LsaClose(policy);
        }
    }
}
"@

$script:WinlogonKey = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
$script:LockTaskName = "Starlight Lock At Logon"

function Enable-StarlightAutologon([string]$UserName, [string]$Domain, [string]$Password, [string]$TaskUser) {
    [StarlightLsa]::Store("DefaultPassword", $Password)

    Set-ItemProperty $script:WinlogonKey -Name AutoAdminLogon -Value "1" -Type String
    Set-ItemProperty $script:WinlogonKey -Name DefaultUserName -Value $UserName -Type String
    Set-ItemProperty $script:WinlogonKey -Name DefaultDomainName -Value $Domain -Type String
    Remove-ItemProperty $script:WinlogonKey -Name DefaultPassword -ErrorAction SilentlyContinue
    Remove-ItemProperty $script:WinlogonKey -Name AutoLogonCount -ErrorAction SilentlyContinue

    # "Only allow Windows Hello sign-in" blocks automatic login
    $passwordLess = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\PasswordLess\Device"
    New-Item -Path $passwordLess -Force | Out-Null
    Set-ItemProperty $passwordLess -Name DevicePasswordLessBuildVersion -Value 0 -Type DWord

    # Lock the pc right after the automatic login: the session keeps running, but the
    # password or PIN is still needed at the pc itself
    $action = New-ScheduledTaskAction -Execute "rundll32.exe" -Argument "user32.dll,LockWorkStation"
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $TaskUser
    $principal = New-ScheduledTaskPrincipal -UserId $TaskUser -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $script:LockTaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
}

function Disable-StarlightAutologon {
    Set-ItemProperty $script:WinlogonKey -Name AutoAdminLogon -Value "0" -Type String -ErrorAction SilentlyContinue
    Remove-ItemProperty $script:WinlogonKey -Name DefaultPassword -ErrorAction SilentlyContinue
    try {
        [StarlightLsa]::Store("DefaultPassword", $null)
    } catch {
        Write-Warning "Kunne ikke slette det gemte password: $_"
    }
    Unregister-ScheduledTask -TaskName $script:LockTaskName -Confirm:$false -ErrorAction SilentlyContinue
}
