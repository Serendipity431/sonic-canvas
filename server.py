#!/usr/bin/env python3
"""
Sonic Canvas — local static server (no dependencies, Python stdlib only).

Usage:
    python3 server.py            # serve on http://127.0.0.1:5173
    python3 server.py 8080       # serve on a custom port

Everything runs locally in your browser. No audio is ever uploaded anywhere.
"""
import http.server
import os
import socketserver
import sys
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".json": "application/json",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        # keep the console quiet except for real errors
        if args and (" 404 " in fmt % args or " 500 " in fmt % args):
            super().log_message(fmt, *args)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    os.chdir(ROOT)

    httpd = None
    for p in range(port, port + 20):
        try:
            httpd = Server(("127.0.0.1", p), Handler)
            port = p
            break
        except OSError:
            continue
    if httpd is None:
        print(f"Could not find a free port near {port}.")
        sys.exit(1)

    url = f"http://127.0.0.1:{port}"
    print()
    print("  SONIC CANVAS")
    print(f"  → {url}")
    print("  Ctrl+C to stop")
    print()
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")


if __name__ == "__main__":
    main()
