import { JsonRpcProvider, Contract, isAddress } from 'ethers';

export const cfg = {
  rpc: process.env.RPC_URL || 'https://rpc.test.mezo.org',
  troveManager: process.env.TROVE_MANAGER || '0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0',
  priceFeed: process.env.PRICE_FEED || '0x86bCF0841622a5dAC14A313a15f96A95421b9366',
  borrowerOps: process.env.BORROWER_OPERATIONS || '',
  appUrl: process.env.APP_URL || 'https://testnet.mezo.org',
  publicUrl: process.env.PUBLIC_URL || 'https://trove-guardian.onrender.com',
};
const TM_ABI = [
  'function getTroveStatus(address) view returns (uint256)',
  'function getTroveColl(address) view returns (uint256)',
  'function getTroveDebt(address) view returns (uint256)',
  'function getCurrentICR(address,uint256) view returns (uint256)',
  'function MCR() view returns (uint256)',
  'function MUSD_GAS_COMPENSATION() view returns (uint256)',
  'function borrowerOperationsAddress() view returns (address)',
];
const PF_ABI = ['function fetchPrice() view returns (uint256)'];
const BO_ABI = ['function minNetDebt() view returns (uint256)'];

const provider = new JsonRpcProvider(cfg.rpc);
const tm = new Contract(cfg.troveManager, TM_ABI, provider);
const pf = new Contract(cfg.priceFeed, PF_ABI, provider);

export { isAddress };
export const getPrice = () => pf.fetchPrice.staticCall(); // works whether fetchPrice is view or not

// Protocol limits are read from the chain; documented values are the fallback ("assumed").
const FALLBACK = { mcr: 11n * 10n ** 17n, gasComp: 200n * 10n ** 18n, minNetDebt: 1800n * 10n ** 18n };
let cache = null;
export async function getLimits() {
  if (cache && Date.now() - cache.at < 10 * 60e3) return cache.v;
  const v = { ...FALLBACK, assumed: [] };
  try { v.mcr = await tm.MCR(); } catch { v.assumed.push('minimum ratio'); }
  try { v.gasComp = await tm.MUSD_GAS_COMPENSATION(); } catch { v.assumed.push('gas compensation'); }
  try {
    const addr = cfg.borrowerOps || (await tm.borrowerOperationsAddress());
    v.minNetDebt = await new Contract(addr, BO_ABI, provider).minNetDebt();
  } catch { v.assumed.push('minimum debt'); }
  cache = { at: Date.now(), v };
  return v;
}

export async function readTrove(address, price) {
  const p = price ?? (await getPrice());
  const status = Number(await tm.getTroveStatus(address));
  if (status !== 1) return { address, active: false, status, price: p };
  const [coll, debt, onchainIcr] = await Promise.all([
    tm.getTroveColl(address),
    tm.getTroveDebt(address),
    tm.getCurrentICR(address, p),
  ]);
  return { address, active: true, status, coll, debt, price: p, onchainIcr };
}
