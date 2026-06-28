#!/usr/bin/env python3
"""
serve.py  -  serve the Axum report viewer on the LAN.

Why this exists: the TanStack Start build produces hashed JS/CSS bundles but
no static index.html (it expects an edge/SSR runtime).  This server fills that
gap by generating the index.html shell at start-up from the built assets, then
serving the SPA normally.  It also serves /reports/* live from the
public\\reports folder on disk so freshly generated reports appear on a simple
browser refresh — no rebuild needed.

Run it after every `npm run build`:
    python D:\\scheduler\\serve.py

Then open http://localhost:3000  (or http://<this-pc-ip>:3000 on the LAN).
"""

import os
import glob
import http.server
import socketserver

# ----------------------------------------------------------------- config ----
PORT          = 3000
BUILT_CLIENT  = r"D:\scheduler\dist\client"        # the built front-end
LIVE_REPORTS  = r"D:\scheduler\public\reports"     # live report folder


def _build_index_html(assets_dir: str) -> bytes:
    """Generate an index.html shell from the hashed build artefacts."""
    css = next(iter(sorted(glob.glob(os.path.join(assets_dir, "styles-*.css")))), None)
    js  = next(iter(sorted(glob.glob(os.path.join(assets_dir, "index-*.js")))),   None)

    css_tag = f'  <link rel="stylesheet" href="/assets/{os.path.basename(css)}" />\n' if css else ""
    js_tag  = f'  <script type="module" src="/assets/{os.path.basename(js)}"></script>\n'  if js  else ""

    html = (
        '<!doctype html>\n'
        '<html lang="en">\n'
        '<head>\n'
        '  <meta charset="utf-8" />\n'
        '  <meta name="viewport" content="width=device-width, initial-scale=1" />\n'
        '  <title>Axum Nightly Reports</title>\n'
        + css_tag
        + js_tag
        + '</head>\n'
        '<body>\n'
        '  <div id="root"></div>\n'
        '</body>\n'
        '</html>\n'
    )
    return html.encode("utf-8")


# Generate once at start-up; stays fresh until the next `npm run build`.
_INDEX_HTML = _build_index_html(os.path.join(BUILT_CLIENT, "assets"))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BUILT_CLIENT, **kwargs)

    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if clean.startswith("/reports/"):
            rel = clean[len("/reports/"):]
            return os.path.join(LIVE_REPORTS, rel)
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        clean = self.path.split("?", 1)[0]

        # Live reports directory is handled by translate_path.
        if clean.startswith("/reports/"):
            return super().do_GET()

        # Static assets (JS/CSS) — serve normally from dist/client.
        if clean.startswith("/assets/"):
            return super().do_GET()

        # Every other path (including "/") gets the SPA shell.
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(_INDEX_HTML)))
        self.end_headers()
        self.wfile.write(_INDEX_HTML)

    def log_message(self, fmt, *args):
        # Suppress noisy per-request logs; only show startup message.
        pass


def main():
    os.makedirs(LIVE_REPORTS, exist_ok=True)
    if not _INDEX_HTML or b"index-" not in _INDEX_HTML:
        print("WARNING: no built index-*.js found in dist/client/assets/")
        print("         Run `npm run build` first, then restart this server.")

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Axum viewer → http://localhost:{PORT}")
        print(f"LAN          → http://<this-pc-ip>:{PORT}")
        print(f"reports      → {LIVE_REPORTS}  (live, no rebuild needed)")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
