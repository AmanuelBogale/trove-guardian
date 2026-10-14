import http from 'node:http';
import { readFileSync } from 'node:fs';

const RPC = process.env.RPC_URL || 'https://rpc.test.mezo.org';
const page = new URL('../web/index.html', import.meta.url);

// Serves the dashboard, forwards chain requests to Mezo (/rpc), and answers /health for uptime pings.
export function startWeb(port) {
  http.createServer(async (req, res) => {
    if (req.url === '/health') { res.writeHead(200); res.end('ok'); return; }
    if (req.method === 'POST' && req.url === '/rpc') {
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(await r.text());
      } catch (e) { res.writeHead(502); res.end(e.message); }
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(readFileSync(page));
  }).listen(port, () => console.log(`Dashboard listening on port ${port}`));
}
