import { JsonRpcProvider, Contract, isAddress } from 'ethers';

export const cfg = {
  rpc: process.env.RPC_URL || 'https://rpc.test.mezo.org',
  troveManager: process.env.TROVE_MANAGER || '0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0',
  priceFeed: process.env.PRICE_FEED || '0x86bCF0841622a5dAC14A313a15f96A95421b9366',
  appUrl: process.env.APP_URL || 'https://testnet.mezo.org',
};
// Function names follow Mezo's Liquity-style contracts; run `npm run verify` to confirm.
const TM_ABI = [
  'function getTroveStatus(address) view returns (uint256)',
  'function getTroveColl(address) view returns (uint256)',
  'function getTroveDebt(address) view returns (uint256)',
  'function getCurrentICR(address,uint256) view returns (uint256)',
];
const PF_ABI = ['function fetchPrice() view returns (uint256)'];

const provider = new JsonRpcProvider(cfg.rpc);
const tm = new Contract(cfg.troveManager, TM_ABI, provider);
const pf = new Contract(cfg.priceFeed, PF_ABI, provider);

export { isAddress };
export const getPrice = () => pf.fetchPrice.staticCall(); // works whether fetchPrice is view or not

export async function readTrove(address, price) {
  const p = price ?? (await getPrice());
  const status = await tm.getTroveStatus(address);
  if (status !== 1n) return { address, active: false, price: p };
  const [coll, debt, onchainIcr] = await Promise.all([
    tm.getTroveColl(address),
    tm.getTroveDebt(address),
    tm.getCurrentICR(address, p),
  ]);
  return { address, active: true, coll, debt, price: p, onchainIcr };
}
