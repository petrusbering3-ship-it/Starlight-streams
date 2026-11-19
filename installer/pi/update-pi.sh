#!/usr/bin/env bash
# Starlight Streams - updates the server on the Raspberry Pi to the latest release.
# Runs every 5 minutes (--auto: only when there is a new version and nobody is streaming) and from
# the Update button. --register only sets up that timer (the server does this when it starts).
set -e
if [ "$(id -u)" -ne 0 ]; then
    exec sudo bash "$0" "$@"
fi

REPOSITORY=petrusbering3-ship-it/Starlight-streams
DEST=/opt/starlight-streams

if [ "$1" = "--register" ]; then
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
Description=Starlight Streams auto update, checks every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
UNIT
    systemctl daemon-reload
    systemctl enable starlight-streams-update.timer >/dev/null 2>&1
    systemctl restart starlight-streams-update.timer
    exit 0
fi

LATEST=$(curl -fsSL "https://api.github.com/repos/$REPOSITORY/releases/latest" \
    | python3 -c 'import json, sys; print(json.load(sys.stdin)["tag_name"])')
INSTALLED=$(cat "$DEST/version.txt" 2>/dev/null || true)
# Never in the middle of a stream (streams.txt is written every minute by the server while streaming)
if [ "$1" = "--auto" ] && [ -n "$(find "$DEST/streams.txt" -mmin -3 2>/dev/null)" ] \
    && [ "$(cat "$DEST/streams.txt")" -gt 0 ]; then
    echo "Nogen streamer lige nu. Opdaterer, når streamen er slut."
    exit 0
fi
if [ "$1" = "--auto" ] && [ "$LATEST" = "$INSTALLED" ]; then
    echo "Starlight Streams er allerede opdateret ($INSTALLED)."
    exit 0
fi
echo "Opdaterer til $LATEST (installeret: $INSTALLED) ..."

# Download first, so the server keeps running if the download fails
TMP=$(mktemp -d)
curl -fsSL -o "$TMP/pi.tar.gz" "https://github.com/$REPOSITORY/releases/latest/download/Starlight-Streams-Pi.tar.gz"
tar -xzf "$TMP/pi.tar.gz" -C "$TMP"
NEW="$TMP/Starlight-Streams-Pi"

# Always start the server again, also when the update failed. server/ (config and data) is kept
trap 'systemctl start starlight-streams; rm -rf "$TMP"' EXIT
systemctl stop starlight-streams
cp "$NEW/web-server" "$DEST/"
rm -rf "$DEST/static"
cp -r "$NEW/static" "$DEST/"
cp "$NEW/update-pi.sh" "$NEW/uninstall-pi.sh" "$DEST/"
chmod +x "$DEST/web-server" "$DEST/update-pi.sh" "$DEST/uninstall-pi.sh"
echo "Opdateret til $LATEST."
