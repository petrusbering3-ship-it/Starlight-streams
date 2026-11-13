#!/usr/bin/env bash
# Starlight Streams - installation på Raspberry Pi'en (serveren)
# Run from the unpacked Starlight-Streams-Pi folder: bash install-pi.sh
set -e
if [ "$(id -u)" -ne 0 ]; then
    exec sudo bash "$0" "$@"
fi

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST=/opt/starlight-streams
trap 'echo; echo "Noget gik galt (linje $LINENO). Send et billede af denne besked."' ERR

echo
echo "=== Starlight Streams - installation på Raspberry Pi'en ==="
echo

if [ "$(uname -m)" != "aarch64" ]; then
    echo "Starlight Streams kræver 64-bit Raspberry Pi OS (Raspberry Pi 3, 4 eller 5)."
    echo "Installer '64-bit' i Raspberry Pi Imager og prøv igen."
    exit 1
fi

# 1. Spørgsmål
TOKEN=""
until [[ "$TOKEN" =~ ^[A-Za-z0-9]+$ ]]; do
    read -r -p "Vælg et sluk-password (kun bogstaver a-z og tal, samme skal bruges på gaming PC'en): " TOKEN
done
MINUTES=""
until [[ "$MINUTES" =~ ^[0-9]+$ ]]; do
    read -r -p "Auto-sluk: sluk gaming PC'en efter hvor mange minutter uden stream? (0 = aldrig, tryk Enter for 30): " MINUTES
    MINUTES="${MINUTES:-30}"
done
read -r -p "Er gaming PC'en sat direkte til Pi'en med et netværkskabel? (J/N): " CABLE

# 2. Kopier programmet
echo "Installerer Starlight Streams i $DEST ..."
systemctl stop starlight-streams 2>/dev/null || true
mkdir -p "$DEST/server"
cp "$SRC/web-server" "$DEST/"
rm -rf "$DEST/static"
cp -r "$SRC/static" "$DEST/"
cp "$SRC/update-pi.sh" "$SRC/uninstall-pi.sh" "$DEST/"
chmod +x "$DEST/web-server" "$DEST/update-pi.sh" "$DEST/uninstall-pi.sh"

# 3. Config med sluk-password (beholder resten af en eksisterende config)
python3 - "$DEST/server/config.json" "$TOKEN" "$MINUTES" <<'PY'
import json, os, sys
path, token, minutes = sys.argv[1:]
config = json.load(open(path)) if os.path.exists(path) else {}
moonlight = config.setdefault("moonlight", {})
moonlight["power_agent_token"] = token
moonlight["auto_shutdown_minutes"] = int(minutes)
json.dump(config, open(path, "w"), indent=2)
PY

# 4. Start automatisk når Pi'en tænder, og opdater selv hver nat
cat > /etc/systemd/system/starlight-streams.service <<UNIT
[Unit]
Description=Starlight Streams
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=$DEST
ExecStart=$DEST/web-server
Restart=always
RestartSec=5
Nice=-5

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/starlight-streams-update.service <<UNIT
[Unit]
Description=Starlight Streams auto update
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$DEST/update-pi.sh --auto
UNIT

cat > /etc/systemd/system/starlight-streams-update.timer <<UNIT
[Unit]
Description=Starlight Streams auto update every night

[Timer]
OnCalendar=*-*-* 04:30
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now starlight-streams
systemctl enable --now starlight-streams-update.timer

# 5. Kabel-tricket: gaming PC'en sat direkte til Pi'en.
# The pi gives the pc an address (192.168.50.x) and internet through its own Wi-Fi, and
# Wake-on-LAN goes straight through the cable.
if [[ "$CABLE" =~ ^[JjYy] ]]; then
    if ! command -v nmcli >/dev/null; then
        echo "Kabel-tricket kræver Raspberry Pi OS Bookworm eller nyere (NetworkManager)."
    elif ! nmcli -t -f DEVICE,STATE device | grep -q '^wlan0:connected'; then
        echo "Pi'en skal være forbundet til internettet med Wi-Fi, når kablet går til PC'en."
        echo "Slå Wi-Fi til (sudo raspi-config, System Options, Wireless LAN) og kør installationen igen."
    else
        echo "Sætter kablet til gaming PC'en op ..."
        apt-get install -y dnsmasq-base >/dev/null
        nmcli connection delete starlight-pc >/dev/null 2>&1 || true
        nmcli connection add type ethernet ifname eth0 con-name starlight-pc \
            ipv4.method shared ipv4.addresses 192.168.50.1/24 ipv6.method disabled \
            connection.autoconnect yes connection.autoconnect-priority 100 >/dev/null
        nmcli connection up starlight-pc >/dev/null 2>&1 || echo "Sæt kablet i, så forbinder den af sig selv."
    fi
fi

# 6. Tailscale Funnel: adgang fra internettet uden at installere noget på den anden computer
if ! command -v tailscale >/dev/null; then
    echo "Installerer Tailscale ..."
    curl -fsSL https://tailscale.com/install.sh | sh
fi
echo
echo "Log ind i Tailscale (gratis konto). Åbn linket der vises herunder i en browser."
tailscale up
echo
echo "Slår Tailscale Funnel til. Første gang skal du åbne linket og trykke 'Enable'."
tailscale funnel --bg 8080
echo
tailscale funnel status || true

echo
echo "=== Færdig! ==="
echo "Åbn https-adressen ovenfor (den der slutter på .ts.net) i en browser - hvor som helst."
echo "Hjemme kan du også bruge http://$(hostname -I | awk '{print $1}'):8080"
echo "Første gang du logger ind, bliver det navn og password du skriver til din admin-konto."
echo "Husk at installere Starlight PC-delen på gaming PC'en med samme sluk-password: $TOKEN"
