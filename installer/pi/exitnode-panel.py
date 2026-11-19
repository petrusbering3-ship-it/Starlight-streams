#!/usr/bin/env python3
# Starlight Streams - a small page of its own (port 8090) that switches the Pi's Tailscale exit node on and off.
# Runs as root (systemd: starlight-exitnode), set up by update-pi.sh.
import json
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8090


def exit_node_on():
    try:
        prefs = json.loads(subprocess.run(["tailscale", "debug", "prefs"], capture_output=True, text=True, timeout=10).stdout)
        return "0.0.0.0/0" in (prefs.get("AdvertiseRoutes") or [])
    except Exception:
        return None


def set_exit_node(on):
    subprocess.run(["tailscale", "set", f"--advertise-exit-node={'true' if on else 'false'}"], capture_output=True, timeout=20)


PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Exit node</title>
<style>
:root{--ink:#111;--paper:#f3f2ee;--white:#fbfaf7;--grey:#6b6b6b;--green:#0f7a3f;--red:#d71e1e}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:var(--paper);color:var(--ink);font:16px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;padding:16px}
main{width:100%;max-width:420px;background:var(--white);border:1px solid var(--ink);padding:28px}
.label{font:500 11px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--grey)}
h1{margin:10px 0 6px;font-size:44px;line-height:1;letter-spacing:-.03em}
.state{display:flex;align-items:center;gap:8px;font-weight:600;margin-bottom:18px}
.dot{width:9px;height:9px;border-radius:50%;background:{{dot}}}
p{margin:0 0 22px;color:var(--grey);font-size:14px}
button{width:100%;height:52px;border:0;background:{{btn}};color:#fff;font:600 16px inherit;cursor:pointer}
button:active{opacity:.85}
</style></head><body><main>
<span class="label">Raspberry Pi · Tailscale</span>
<h1>Exit node</h1>
<div class="state"><span class="dot"></span>{{state}}</div>
<p>{{help}}</p>
<form method="post" action="/toggle"><button type="submit">{{action}}</button></form>
</main></body></html>"""


class Handler(BaseHTTPRequestHandler):
    def send_page(self):
        on = exit_node_on()
        if on is None:
            values = dict(state="Tailscale not reachable", help="Is Tailscale running on the Pi?", action="Try again", dot="#d71e1e", btn="#111")
        elif on:
            values = dict(state="On", help="Devices that pick the Pi as exit node use your home internet. Starlight Streams keeps working.",
                          action="Turn off", dot="#0f7a3f", btn="#111")
        else:
            values = dict(state="Off", help="Nobody can use the Pi as exit node right now.", action="Turn on", dot="#6b6b6b", btn="#111")
        page = PAGE
        for key, value in values.items():
            page = page.replace("{{" + key + "}}", value)
        body = page.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.send_page()

    def do_POST(self):
        if self.path == "/toggle":
            on = exit_node_on()
            set_exit_node(not on if on is not None else True)
        self.send_response(303)
        self.send_header("Location", "/")
        self.end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
