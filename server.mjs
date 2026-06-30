// server.mjs — production Node server for the Axum report viewer.
//
// Why this exists: TanStack Start builds an SSR app whose server bundle
// (dist/server/server.js) is a Fetch-API handler, not a runnable Node server.
// A static index.html shell cannot render it — the app uses shellComponent +
// <Scripts /> to emit the whole HTML document and hydrate it. So we run the
// real SSR handler here and wrap it in a Node http server.
//
// Routing order:
//   1. /reports/*  -> served LIVE from public/reports/ (reports written by
//                     process_log.py appear on a browser refresh, no rebuild).
//   2. any path that is a real file in dist/client/ -> served static
//                     (the hashed JS/CSS the SSR document references).
//   3. everything else -> server-side rendered by the TanStack Start handler.
//
// Run after `npm run build`:   node server.mjs
// Then open http://localhost:3000  (or http://<lan-ip>:3000).

import http from "node:http";
import {
  createReadStream,
  existsSync,
  statSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { Readable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const CLIENT_DIR = join(__dirname, "dist", "client");
// Test/normal classification labels live in a LOCAL writable file (NOT the
// read-only reports mount) so the web app owns them. Keyed by report date.
const LABELS_FILE = process.env.LABELS_FILE || join(__dirname, "data", "labels.json");
const VERSIONS_FILE = process.env.VERSIONS_FILE || join(__dirname, "data", "versions.json");
// REPORTS_DIR is env-overridable so JantaServer can point it at the LAN-mounted
// reports folder from the Monitor PC (e.g. REPORTS_DIR=/mnt/axum-reports).
// Defaults to the local public/reports for single-machine use.
const REPORTS_DIR = process.env.REPORTS_DIR || join(__dirname, "public", "reports");

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

// Import the SSR fetch handler from the built server bundle.
const { default: handler } = await import("./dist/server/server.js");

/** Serve a file from disk to the Node response. Returns true if served. */
function serveFile(absPath, res) {
  if (!existsSync(absPath)) return false;
  let st;
  try {
    st = statSync(absPath);
  } catch {
    return false;
  }
  if (!st.isFile()) return false;

  const type = MIME[extname(absPath).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": st.size,
    // Reports change daily and assets are content-hashed, so no-store is safe
    // and avoids stale views during testing.
    "Cache-Control": "no-store",
  });
  createReadStream(absPath).pipe(res);
  return true;
}

/** Block path traversal: keep the resolved path inside the given root. */
function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const joined = normalize(join(root, decoded));
  if (!joined.startsWith(normalize(root))) return null;
  return joined;
}

async function ssr(req, res) {
  const url = `http://${req.headers.host || `localhost:${PORT}`}${req.url}`;
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    // GET/HEAD have no body; pass through anything else.
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
    duplex: "half",
  });

  const response = await handler.fetch(request, {}, {});

  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));

  if (response.body) {
    Readable.fromWeb(response.body).pipe(res);
  } else {
    res.end(await response.text());
  }
}

function readJsonFile(file) {
  try {
    const obj = JSON.parse(readFileSync(file, "utf-8"));
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function writeJsonFile(file, obj) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  writeFileSync(tmp, JSON.stringify(obj, null, 2));
  renameSync(tmp, file);
}

const readLabels = () => readJsonFile(LABELS_FILE);
const writeLabels = (o) => writeJsonFile(LABELS_FILE, o);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 100_000) req.destroy(); // guard against runaway bodies
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const path = req.url.split("?")[0];

    // 0. Classification labels API (test/normal/note), keyed by report date.
    if (path === "/labels") {
      if (req.method === "GET") {
        const body = JSON.stringify(readLabels());
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(body);
        return;
      }
      if (req.method === "POST") {
        let payload;
        try {
          payload = JSON.parse(await readBody(req));
        } catch {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("bad json");
          return;
        }
        const date = String(payload.date || "").match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
        if (!date) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("bad date");
          return;
        }
        const labels = readLabels();
        const runType = payload.run_type === "test" ? "test" : "normal";
        const testName = payload.test_name ? String(payload.test_name).slice(0, 80) : "";
        const note = payload.note ? String(payload.note).slice(0, 280) : "";
        const version = payload.version ? String(payload.version).slice(0, 40) : "";
        if (runType === "normal" && !note && !testName && !version) {
          delete labels[date]; // default normal + nothing set: nothing to store
        } else {
          labels[date] = { run_type: runType };
          if (testName) labels[date].test_name = testName;
          if (version) labels[date].version = version;
          if (note) labels[date].note = note;
        }
        writeLabels(labels);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(labels[date] || { run_type: "normal" }));
        return;
      }
    }

    // 0b. Version registry (stable / deployment / testing), editable.
    if (path === "/versions") {
      if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify(readJsonFile(VERSIONS_FILE)));
        return;
      }
      if (req.method === "POST") {
        let payload;
        try {
          payload = JSON.parse(await readBody(req));
        } catch {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("bad json");
          return;
        }
        const clean = (v) => (v ? String(v).slice(0, 40) : "");
        const versions = {
          stable: clean(payload.stable),
          deployment: clean(payload.deployment),
          testing: clean(payload.testing),
        };
        writeJsonFile(VERSIONS_FILE, versions);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(versions));
        return;
      }
    }

    // 1. Live reports passthrough.
    if (path.startsWith("/reports/")) {
      const rel = path.slice("/reports/".length);
      const abs = safeJoin(REPORTS_DIR, rel);
      if (abs && serveFile(abs, res)) return;
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Report not found");
      return;
    }

    // 2. Static client file (hashed assets, favicon, etc.).
    if (path !== "/") {
      const abs = safeJoin(CLIENT_DIR, path);
      if (abs && serveFile(abs, res)) return;
    }

    // 3. Server-side render everything else.
    await ssr(req, res);
  } catch (err) {
    console.error("[server] request failed:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
    }
    res.end("Internal server error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Axum viewer  ->  http://localhost:${PORT}`);
  console.log(`LAN          ->  http://<this-pc-ip>:${PORT}`);
  console.log(`reports      ->  ${REPORTS_DIR}  (live, no rebuild needed)`);
  console.log("Press Ctrl+C to stop.");
});
