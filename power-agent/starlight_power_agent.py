"""
Starlight Streams - Power Agent

Run this small program on the PC you stream FROM (the one running Sunshine).
It lets the Starlight Streams web server shut the PC down with a button.

Usage:
    python starlight_power_agent.py --token MY_SECRET

The same token must be set as "power_agent_token" under "moonlight" in the
Starlight Streams server/config.json.

Only uses the Python standard library.
"""

import argparse
import hmac
import platform
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_PORT = 47900


def shutdown_command():
    system = platform.system()
    if system == "Windows":
        return ["shutdown", "/s", "/t", "5"]
    if system == "Darwin":
        return ["sudo", "shutdown", "-h", "+1"]
    return ["systemctl", "poweroff"]


def make_handler(token):
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != "/shutdown":
                self.send_response(404)
                self.end_headers()
                return

            auth = self.headers.get("Authorization", "")
            if not token or not hmac.compare_digest(auth, f"Bearer {token}"):
                self.send_response(401)
                self.end_headers()
                return

            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"shutting down")
            print("Shutdown requested, turning off the pc...")
            # Run after the response is sent
            threading.Timer(1.0, lambda: subprocess.run(shutdown_command())).start()

        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Starlight power agent is running")

    return Handler


def main():
    parser = argparse.ArgumentParser(description="Starlight Streams power agent")
    parser.add_argument("--token", required=True, help="shared secret, must match power_agent_token in config.json")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--bind", default="0.0.0.0")
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.bind, args.port), make_handler(args.token))
    print(f"Starlight power agent listening on {args.bind}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
