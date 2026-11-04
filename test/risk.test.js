import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/risk.js';

const v = (x) => R.fromNum(x);
test('icr and liquidation price', () => {
  const coll = v(1), debt = v(50000), price = v(100000);
  assert.equal(R.toNum(R.icr(coll, debt, price)), 2);
  assert.equal(R.toNum(R.liquidationPrice(coll, debt)), 55000);
  assert.equal(Math.round(R.bufferPct(price, R.liquidationPrice(coll, debt))), 45);
});
test('fix amounts reach target', () => {
  const coll = v(1), debt = v(80000), price = v(100000), target = v(1.5);
  assert.equal(R.toNum(R.addCollateralFor(coll, debt, price, target)), 0.2);
  assert.equal(Math.round(R.toNum(R.repayFor(coll, debt, price, target))), 13333);
  assert.equal(R.addCollateralFor(v(5), debt, price, target), 0n);
});
test('alert levels use hysteresis', () => {
  assert.equal(R.nextLevel(undefined, 30, 20, 8), 'SAFE');
  assert.equal(R.nextLevel('SAFE', 15, 20, 8), 'WARNING');
  assert.equal(R.nextLevel('WARNING', 5, 20, 8), 'CRITICAL');
  assert.equal(R.nextLevel('WARNING', 21, 20, 8), 'WARNING');
  assert.equal(R.nextLevel('WARNING', 23, 20, 8), 'SAFE');
  assert.equal(R.nextLevel('CRITICAL', 9, 20, 8), 'CRITICAL');
  assert.equal(R.nextLevel('CRITICAL', 12, 20, 8), 'WARNING');
});

test('buffer and liquidation price from the on-chain ratio', () => {
  assert.equal(Math.round(R.bufferFromIcr(v(2.2))), 50);
  assert.equal(R.toNum(R.liqPriceFromIcr(v(100000), v(2))), 55000);
});
test('max repay respects the minimum net debt', () => {
  assert.equal(R.toNum(R.maxRepay(v(2202), v(200), v(1800))), 202);
  assert.equal(R.maxRepay(v(1900), v(200), v(1800)), 0n);
});

test('zero debt or zero collateral gives no ratio or price', () => {
  assert.equal(R.icr(v(1), 0n, v(100)), null);
  assert.equal(R.liquidationPrice(0n, v(100)), null);
  assert.equal(R.bufferFromIcr(0n), null);
  assert.equal(R.bufferFromIcr(null), null);
});
test('nothing to add or repay when already above the target', () => {
  assert.equal(R.addCollateralFor(v(20), v(1000), v(100), v(1.5)), 0n);
  assert.equal(R.repayFor(v(5), v(100), v(100), v(1.5)), 0n);
});
test('the ratio at the liquidation price equals the minimum ratio', () => {
  const coll = v(2), debt = v(100000);
  assert.equal(R.icr(coll, debt, R.liquidationPrice(coll, debt)), R.MCR);
});
test('alert level changes exactly at the threshold', () => {
  assert.equal(R.nextLevel('SAFE', 20, 20, 8), 'WARNING');
  assert.equal(R.nextLevel('SAFE', 20.1, 20, 8), 'SAFE');
});
