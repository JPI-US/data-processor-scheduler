#!/usr/bin/env python3
"""
serve.py — DEPRECATED. Use the Node SSR server instead.

This project is a TanStack Start app: its server build renders the whole HTML
document and hydrates it (shellComponent + <Scripts />). A static index.html
shell — which is all a plain Python file server can provide — cannot run it,
so the page rendered blank.

Run the real server instead:

    npm run build      # once, after any UI code change
    npm start          # = node server.mjs  ->  http://localhost:3000

server.mjs serves /reports/ live from public/reports/, just like this script
tried to, but it also actually renders the React app.
"""

import sys

print(__doc__)
print("This script no longer starts a server. Run:  npm run build && npm start")
sys.exit(1)
