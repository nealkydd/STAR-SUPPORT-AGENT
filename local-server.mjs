// local-server.mjs — Star Support local dev server
// Serves public/ as static files and routes /api/* to the Vercel-style handlers.
// Loads .env.local before anything else.
// Usage: npm run local  →  http://localhost:3000

import http   from 'http';
import fs     from 'fs';
import path   from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Load .env.local ──────────────────────────────────────────────────────────
// Must run before any API module is imported, as handlers read process.env at init time.

(function loadEnvLocal() {
  const envPath = path.join(__dirname, '.env.local');
  if (!fs.existsSync(envPath)) {
    console.warn('[local-server] .env.local not found — API calls may fail');
    return;
  }
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
  console.log('[local-server] .env.local loaded');
})();

// ─── API routes ───────────────────────────────────────────────────────────────
// Mapped to handler files using import.meta.url for reliable ESM resolution.

const API_ROUTES = {
  '/api/support-request-code': new URL('./api/support-request-code.js', import.meta.url).href,
  '/api/support-auth':         new URL('./api/support-auth.js',         import.meta.url).href,
  '/api/support-account':      new URL('./api/support-account.js',      import.meta.url).href,
};

// ─── MIME types ───────────────────────────────────────────────────────────────

const MIME = {
  '.html':  'text/html; charset=utf-8',
  '.css':   'text/css',
  '.js':    'application/javascript',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.png':   'image/png',
  '.svg':   'image/svg+xml',
  '.webp':  'image/webp',
  '.ico':   'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff':  'font/woff',
};

// ─── Vercel-style request/response adapter ────────────────────────────────────

function makeReq(nodeReq, body) {
  return {
    method:  nodeReq.method,
    headers: nodeReq.headers,
    url:     nodeReq.url,
    body,
  };
}

function makeRes(nodeRes) {
  let code = 200;
  const api = {
    status(c) { code = c; return api; },
    json(data) {
      const payload = JSON.stringify(data);
      nodeRes.writeHead(code, {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      });
      nodeRes.end(payload);
    },
    setHeader(k, v) { nodeRes.setHeader(k, v); },
    end(data)       { nodeRes.end(data); },
  };
  return api;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end',  () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ─── Server ───────────────────────────────────────────────────────────────────

const PUBLIC_DIR = path.join(__dirname, 'public');

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost:3000');

  // CORS headers for local dev
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── API routes
  if (pathname.startsWith('/api/')) {
    const handlerUrl = API_ROUTES[pathname];

    if (!handlerUrl) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, reason: 'route_not_found' }));
      return;
    }

    try {
      const body            = await readBody(req);
      const { default: fn } = await import(handlerUrl);
      await fn(makeReq(req, body), makeRes(res));
    } catch (err) {
      console.error(`[local-server] ${pathname}`, err.message);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, reason: 'server_error', detail: err.message }));
      }
    }
    return;
  }

  // ── Static files from public/
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end();
    return;
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');

    const content  = fs.readFileSync(filePath);
    const ext      = path.extname(filePath).toLowerCase();
    const mimeType = MIME[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => {
  console.log(`\nStar Support — http://localhost:${PORT}\n`);
});
