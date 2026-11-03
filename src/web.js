import http from 'node:http';
import { readFileSync } from 'node:fs';
import { NETWORKS } from './chain.js';

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
// Forward to the network's RPC endpoints, trying each until one answers.
async function forward(net, body) {
  let last = 'no endpoint';
  for (const url of NETWORKS[net].rpcs) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      const text = await r.text();
      JSON.parse(text);
      return text;
    } catch (e) { last = e.message; }
  }
  throw new Error(last);
}

// Serves the dashboard, forwards allowed read calls to Mezo (/rpc/testnet, /rpc/mainnet), and answers /health.
export function startWeb(port) {
  http.createServer(async (req, res) => {
    if (req.url === '/health') { res.writeHead(200, HEADERS); res.end('ok'); return; }
    const m = req.method === 'POST' && /^\/rpc(?:\/(testnet|mainnet))?$/.exec(req.url);
    if (m) {
      const net = m[1] || 'testnet';
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > MAX_BODY) { res.writeHead(413, HEADERS); res.end('too large'); return; }
      }
      if (!allowed(body)) { res.writeHead(403, HEADERS); res.end('method not allowed'); return; }
      try {
        const text = await forward(net, body);
        res.writeHead(200, { ...HEADERS, 'content-type': 'application/json' });
        res.end(text);
      } catch (e) { res.writeHead(502, HEADERS); res.end('upstream error'); }
      return;
    }
    res.writeHead(200, { ...HEADERS, 'content-type': 'text/html; charset=utf-8' });
    res.end(readFileSync(page));
  }).listen(port, () => console.log(`Dashboard listening on port ${port}`));
}
