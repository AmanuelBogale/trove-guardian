import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { isAddress } from 'ethers';
import { startWeb } from '../src/web.js';
import { NETWORKS } from '../src/chain.js';

const server = startWeb(0);
if (!server.listening) await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const rpc = (path, body) => fetch(base + path, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const call = (method) => ({ jsonrpc: '2.0', id: 1, method, params: [] });

test('health check answers ok', async () => {
  const r = await fetch(base + '/health');
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'ok');
});
test('the page is served with security headers', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await r.text(), /Trove Guardian/);
});
test('the relay refuses calls that send transactions', async () => {
  assert.equal((await rpc('/rpc/mainnet', call('eth_sendRawTransaction'))).status, 403);
  assert.equal((await rpc('/rpc', call('eth_sendTransaction'))).status, 403);
});
test('the relay refuses a batch with one disallowed call', async () => {
  const r = await rpc('/rpc/testnet', [call('eth_chainId'), call('eth_sendRawTransaction')]);
  assert.equal(r.status, 403);
});
test('the relay refuses invalid JSON', async () => {
  assert.equal((await rpc('/rpc', 'not json')).status, 403);
});
test('the relay refuses oversized bodies', async () => {
  const r = await rpc('/rpc', 'a'.repeat(25_000)).catch(() => null);
  assert.ok(r === null || r.status === 413);
});
test('network settings are valid', () => {
  assert.equal(NETWORKS.testnet.chainId, 31611);
  assert.equal(NETWORKS.mainnet.chainId, 31612);
  for (const n of Object.values(NETWORKS)) {
    for (const k of ['tm', 'pf', 'bo', 'st']) assert.ok(isAddress(n[k]), `${n.key} ${k} is not a valid address`);
    assert.ok(n.rpcs.length >= 1);
  }
  assert.ok(NETWORKS.mainnet.rpcs.length >= 2, 'mainnet should have a fallback provider');
});
