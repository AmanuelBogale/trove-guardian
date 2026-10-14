// Pure risk math. All on-chain values are BigInt scaled by 1e18.
export const E18 = 10n ** 18n;
export const MCR = 11n * 10n ** 17n; // 110% minimum collateral ratio (verify in Mezo docs)
export const toNum = (x) => Number(x) / 1e18;
export const fromNum = (n) => BigInt(Math.round(n * 1e9)) * 10n ** 9n;

export const icr = (coll, debt, price) => (debt === 0n ? null : (coll * price) / debt);
export const liquidationPrice = (coll, debt, mcr = MCR) => (coll === 0n ? null : (debt * mcr) / coll);
// % the BTC price can fall before liquidation
export const bufferPct = (price, liqPrice) =>
  liqPrice === null || price === 0n ? null : (1 - toNum(liqPrice) / toNum(price)) * 100;
export const addCollateralFor = (coll, debt, price, target) => {
  const need = (debt * target) / price;
  return need > coll ? need - coll : 0n;
};
export const repayFor = (coll, debt, price, target) => {
  const maxDebt = (coll * price) / target;
  return debt > maxDebt ? debt - maxDebt : 0n;
};

export const LEVELS = ['SAFE', 'WARNING', 'CRITICAL'];
// Alert level with hysteresis so alerts don't flap around a threshold.
export function nextLevel(prev, buffer, warn, crit, hyst = 2) {
  const raw = buffer <= crit ? 2 : buffer <= warn ? 1 : 0;
  const p = LEVELS.indexOf(prev);
  if (p < 0 || raw >= p) return LEVELS[raw];
  const threshold = p === 2 ? crit : warn;
  return buffer > threshold + hyst ? LEVELS[raw] : LEVELS[p];
}
