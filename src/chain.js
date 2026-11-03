import { JsonRpcProvider, Contract, ZeroAddress, isAddress } from 'ethers';

export const cfg = { publicUrl: process.env.PUBLIC_URL || 'https://trove-guardian.onrender.com' };

// Addresses are from Mezo's official docs (mezo.org/docs/developers/musd/musd-redemptions).
export const NETWORKS = {
  testnet: {
    key: 'testnet', label: 'Mezo testnet', chainId: 31611,
    rpcs: [process.env.RPC_URL || 'https://rpc.test.mezo.org'],
    tm: process.env.TROVE_MANAGER || '0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0',
    pf: process.env.PRICE_FEED || '0x86bCF0841622a5dAC14A313a15f96A95421b9366',
    bo: process.env.BORROWER_OPERATIONS || '0xCdF7028ceAB81fA0C6971208e83fa7872994beE5',
    st: '0x722E4D24FD6Ff8b0AC679450F3D91294607268fA',
    appUrl: process.env.APP_URL || 'https://testnet.mezo.org',
  },
  mainnet: {
    key: 'mainnet', label: 'Mezo mainnet', chainId: 31612,
    rpcs: (process.env.MAINNET_RPC_URLS || 'https://mezo-mainnet.boar.network,https://mainnet.mezo.public.validationcloud.io,https://mezo.drpc.org').split(',').map((s) => s.trim()).filter(Boolean),
    tm: '0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193',
    pf: '0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88',
    bo: '0x44b1bac67dDA612a41a58AAf779143B181dEe031',
    st: '0x8C5DB4C62BF29c1C4564390d10c20a47E0b2749f',
    appUrl: 'https://mezo.org/borrow',
  },
};
const TM_ABI = [
  'function getTroveStatus(address) view returns (uint256)',
  'function getTroveColl(address) view returns (uint256)',
  'function getTroveDebt(address) view returns (uint256)',
  'function getCurrentICR(address,uint256) view returns (uint256)',
  'function MCR() view returns (uint256)',
  'function MUSD_GAS_COMPENSATION() view returns (uint256)',
];
const PF_ABI = ['function fetchPrice() view returns (uint256)'];
const BO_ABI = ['function minNetDebt() view returns (uint256)'];
const ST_ABI = ['function getLast() view returns (address)', 'function getPrev(address) view returns (address)', 'function getSize() view returns (uint256)'];

export { isAddress };
const cache = {};
const provs = (net) => (cache[net] ??= NETWORKS[net].rpcs.map((u) => new JsonRpcProvider(u, NETWORKS[net].chainId, { staticNetwork: true })));
// Try each RPC provider in turn until one answers.
async function each(net, fn) {
  let last;
  for (const p of provs(net)) { try { return await fn(p); } catch (e) { last = e; } }
  throw last;
}
const ct = (net, key, abi, p) => new Contract(NETWORKS[net][key], abi, p);

export const getPrice = (net = 'testnet') => each(net, (p) => ct(net, 'pf', PF_ABI, p).fetchPrice.staticCall());

export async function readTrove(address, price, net = 'testnet') {
  return each(net, async (p) => {
    const tm = ct(net, 'tm', TM_ABI, p);
    const pr = price ?? (await ct(net, 'pf', PF_ABI, p).fetchPrice.staticCall());
    const status = Number(await tm.getTroveStatus(address));
    if (status !== 1) return { address, active: false, status, price: pr, net };
    const [coll, debt, onchainIcr] = await Promise.all([tm.getTroveColl(address), tm.getTroveDebt(address), tm.getCurrentICR(address, pr)]);
    return { address, active: true, status, coll, debt, price: pr, onchainIcr, net };
  });
}

// Find which network a Trove is on. With no hint, mainnet is checked first.
export async function locate(address, hint) {
  const nets = hint ? [hint] : ['mainnet', 'testnet'];
  const rs = await Promise.allSettled(nets.map((n) => readTrove(address, undefined, n)));
  const ok = rs.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (!ok.length) throw rs[0].reason;
  return ok.find((t) => t.active) || ok.find((t) => t.status !== 0) || ok[0];
}

// Protocol limits are read from the chain; documented values are the fallback ("assumed").
const FALLBACK = { mcr: 11n * 10n ** 17n, gasComp: 200n * 10n ** 18n, minNetDebt: 1800n * 10n ** 18n };
const limCache = {};
export async function getLimits(net = 'testnet') {
  const c = limCache[net];
  if (c && Date.now() - c.at < 10 * 60e3) return c.v;
  const v = { ...FALLBACK, assumed: [] };
  try { v.mcr = await each(net, (p) => ct(net, 'tm', TM_ABI, p).MCR()); } catch { v.assumed.push('minimum ratio'); }
  try { v.gasComp = await each(net, (p) => ct(net, 'tm', TM_ABI, p).MUSD_GAS_COMPENSATION()); } catch { v.assumed.push('gas compensation'); }
  try { v.minNetDebt = await each(net, (p) => ct(net, 'bo', BO_ABI, p).minNetDebt()); } catch { v.assumed.push('minimum debt'); }
  limCache[net] = { at: Date.now(), v };
  return v;
}

// Mezo keeps Troves sorted by ratio. The last entries have the lowest ratio, and
// redemptions start there (per Mezo's docs).
export async function lowestTroves(net, n = 5) {
  return each(net, async (p) => {
    const st = ct(net, 'st', ST_ABI, p), tm = ct(net, 'tm', TM_ABI, p);
    const price = await ct(net, 'pf', PF_ABI, p).fetchPrice.staticCall();
    const size = Number(await st.getSize());
    const troves = [];
    let a = await st.getLast();
    while (a !== ZeroAddress && troves.length < n) {
      const [coll, debt, icr] = await Promise.all([tm.getTroveColl(a), tm.getTroveDebt(a), tm.getCurrentICR(a, price)]);
      troves.push({ address: a, coll, debt, icr });
      a = await st.getPrev(a);
    }
    return { size, price, troves };
  });
}
export async function rankOf(address, net, max = 300) {
  return each(net, async (p) => {
    const st = ct(net, 'st', ST_ABI, p);
    const size = Number(await st.getSize());
    let a = await st.getLast(), i = 1;
    while (a !== ZeroAddress && i <= max) {
      if (a.toLowerCase() === address.toLowerCase()) return { rank: i, size };
      a = await st.getPrev(a); i++;
    }
    return { rank: null, size };
  });
}
