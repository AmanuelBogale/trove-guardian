// Usage: node scripts/verify.js 0xTroveOwner
// Confirms the contract calls work and that our ICR matches the chain's.
import { getPrice, readTrove } from '../src/chain.js';
import * as R from '../src/risk.js';
const addr = process.argv[2];
const price = await getPrice();
console.log('BTC price:', R.toNum(price));
const t = await readTrove(addr, price);
if (!t.active) { console.log('No active Trove for', addr); process.exit(0); }
console.log('coll', R.toNum(t.coll), 'debt', R.toNum(t.debt));
console.log('ICR ours:', R.toNum(R.icr(t.coll, t.debt, price)), 'on-chain:', R.toNum(t.onchainIcr));
