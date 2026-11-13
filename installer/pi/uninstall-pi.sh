#!/usr/bin/env bash
# Starlight Streams - afinstaller fra Raspberry Pi'en
if [ "$(id -u)" -ne 0 ]; then
    exec sudo bash "$0" "$@"
fi

systemctl disable --now starlight-streams starlight-streams-update.timer 2>/dev/null
rm -f /etc/systemd/system/starlight-streams.service \
    /etc/systemd/system/starlight-streams-update.service \
    /etc/systemd/system/starlight-streams-update.timer
systemctl daemon-reload

command -v tailscale >/dev/null && tailscale funnel reset
command -v nmcli >/dev/null && nmcli connection delete starlight-pc >/dev/null 2>&1

rm -rf /opt/starlight-streams
echo "Starlight Streams er fjernet. Tailscale kan fjernes med: sudo apt remove tailscale"
