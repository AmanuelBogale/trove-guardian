import http from 'node:http';
import { readFileSync } from 'node:fs';

const RPC = process.env.RPC_URL || 'https://rpc.test.mezo.org';
const page = new URL('../web/index.html', import.meta.url);

// The dashboard only needs these read-only calls. Anything else is refused, so this
// server cannot be used as a general-purpose relay.
const ALLOWED = new Set(['eth_chainId', 'net_version', 'eth_blockNumber', 'eth_call', 'eth_getBalance', 'eth_getBlockByNumber', 'eth_getCode', 'eth_gasPrice']);
const MAX_BODY = 20_000;

const HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
};

function allowed(body) {
  try {
    const j = JSON.parse(body);
    const calls = Array.isArray(j) ? j : [j];
    return calls.length > 0 && calls.length <= 20 && calls.every((c) => c && ALLOWED.has(c.method));
  } catch { return false; }
}

// Serves the dashboard, forwards allowed read calls to Mezo (/rpc), and answers /health for uptime pings.
export function startWeb(port) {
  http.createServer(async (req, res) => {
    if (req.url === '/health') { res.writeHead(200, HEADERS); res.end('ok'); return; }
    if (req.method === 'POST' && req.url === '/rpc') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > MAX_BODY) { res.writeHead(413, HEADERS); res.end('too large'); return; }
      }
      if (!allowed(body)) { res.writeHead(403, HEADERS); res.end('method not allowed'); return; }
      try {
        const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
        res.writeHead(200, { ...HEADERS, 'content-type': 'application/json' });
        res.end(await r.text());
      } catch (e) { res.writeHead(502, HEADERS); res.end('upstream error'); }
      return;
    }
    res.writeHead(200, { ...HEADERS, 'content-type': 'text/html; charset=utf-8' });
    res.end(readFileSync(page));
  }).listen(port, () => console.log(`Dashboard listening on port ${port}`));
}
