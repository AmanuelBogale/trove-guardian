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
