import { startWeb } from "./web.js";
startWeb(Number(process.env.PORT || 3000));
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { Bot } from 'grammy';
import { cfg, getPrice, getLimits, readTrove, isAddress } from './chain.js';
import * as R from './risk.js';

if (!process.env.BOT_TOKEN) throw new Error('Set BOT_TOKEN in .env (see .env.example)');
const bot = new Bot(process.env.BOT_TOKEN);

// ---- store: Upstash Redis if configured (survives restarts), else a local JSON file ----
const FILE = process.env.DATA_FILE || 'data.json';
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL, REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'trove-guardian:db';
async function redis(cmd) {
  const r = await fetch(REDIS_URL, { method: 'POST', headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(cmd) });
  return (await r.json()).result;
}
let db = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { subs: [] };
if (REDIS_URL) { const saved = await redis(['GET', KEY]); if (saved) db = JSON.parse(saved); }
const save = () => {
  if (REDIS_URL) return redis(['SET', KEY, JSON.stringify(db)]).catch((e) => console.error('save failed', e.message));
  writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 1)); renameSync(FILE + '.tmp', FILE);
};

const n = (x, d = 2) => R.toNum(x).toLocaleString('en-US', { maximumFractionDigits: d });
const TARGET_ICR = R.fromNum(1.5); // "safe" ratio suggested by /fix

const STATUS = { 0: 'No Trove was found for this address.', 2: 'This Trove was closed by its owner.', 3: 'This Trove was liquidated.', 4: 'This Trove was closed by redemption.' };
const statusText = (t) => STATUS[t.status] || 'This Trove is not active.';

async function summary(t) {
  const lim = await getLimits();
  const liq = R.liqPriceFromIcr(t.price, t.onchainIcr, lim.mcr);
  const buf = R.bufferFromIcr(t.onchainIcr, lim.mcr);
  return { lim, liq, buf, text:
    `Collateral: ${n(t.coll, 4)} BTC\nDebt: ${n(t.debt)} MUSD\nBTC price: $${n(t.price)}\n` +
    `Collateral ratio: ${(R.toNum(t.onchainIcr) * 100).toFixed(1)}%\n` +
    `Liquidation price: $${n(liq)}\nBuffer: ${buf.toFixed(1)}% price drop\n` +
    `Dashboard: ${cfg.publicUrl}/?address=${t.address}` };
}

bot.command('start', (ctx) => ctx.reply(
  'Trove Guardian watches your Mezo MUSD loan and warns you before liquidation.\n\n' +
  '/watch <address> [warn%] [critical%]  (default 20 / 8)\n/unwatch <address>\n/list\n' +
  '/status <address>\n/simulate <address> <drop%>\n/fix <address>'));

bot.command('watch', async (ctx) => {
  const [addr, w = '20', c = '8'] = ctx.match.trim().split(/\s+/);
  const warn = Number(w), crit = Number(c);
  if (!isAddress(addr ?? '') || !(warn > crit && crit > 0)) return ctx.reply('Usage: /watch 0xAddress [warn%] [critical%] (warn > critical > 0)');
  const t = await readTrove(addr);
  if (!t.active) return ctx.reply(statusText(t));
  db.subs = db.subs.filter((s) => !(s.chatId === ctx.chat.id && s.address.toLowerCase() === addr.toLowerCase()));
  db.subs.push({ chatId: ctx.chat.id, address: addr, warn, crit });
  save();
  ctx.reply(`Watching ${addr}\nAlerts at ${warn}% and ${crit}% buffer.\n\n${(await summary(t)).text}`);
});

bot.command('unwatch', (ctx) => {
  const a = ctx.match.trim().toLowerCase();
  db.subs = db.subs.filter((s) => !(s.chatId === ctx.chat.id && s.address.toLowerCase() === a));
  save(); ctx.reply('Stopped watching.');
});
bot.command('list', (ctx) => {
  const mine = db.subs.filter((s) => s.chatId === ctx.chat.id);
  ctx.reply(mine.length ? mine.map((s) => `${s.address} (${s.warn}%/${s.crit}%) ${s.ended ? 'INACTIVE' : s.level ?? ''}`).join('\n') : 'Nothing watched yet.');
});
bot.command('status', async (ctx) => {
  const a = ctx.match.trim();
  if (!isAddress(a)) return ctx.reply('Usage: /status 0xAddress');
  const t = await readTrove(a);
  ctx.reply(t.active ? (await summary(t)).text : statusText(t));
});
bot.command('simulate', async (ctx) => {
  const [addr, d] = ctx.match.trim().split(/\s+/); const drop = Number(d);
  if (!isAddress(addr ?? '') || !(drop >= 0 && drop < 100)) return ctx.reply('Usage: /simulate 0xAddress 30');
  const t = await readTrove(addr);
  if (!t.active) return ctx.reply(statusText(t));
  const lim = await getLimits();
  const p2 = (t.price * BigInt(Math.round((100 - drop) * 100))) / 10000n;
  const ratio = R.toNum(R.icr(t.coll, t.debt, p2)) * 100;
  ctx.reply(`If BTC falls ${drop}% to $${n(p2)}:\nCollateral ratio ${ratio.toFixed(1)}% -> ${ratio < R.toNum(lim.mcr) * 100 ? 'LIQUIDATABLE' : 'still safe'}`);
});
bot.command('fix', async (ctx) => {
  const a = ctx.match.trim();
  if (!isAddress(a)) return ctx.reply('Usage: /fix 0xAddress');
  const t = await readTrove(a);
  if (!t.active) return ctx.reply(statusText(t));
  const lim = await getLimits();
  const add = R.addCollateralFor(t.coll, t.debt, t.price, TARGET_ICR);
  const want = R.repayFor(t.coll, t.debt, t.price, TARGET_ICR);
  const cap = R.maxRepay(t.debt, lim.gasComp, lim.minNetDebt);
  const repay = want < cap ? want : cap;
  let msg = `To reach a 150% ratio you can either:\n- add ${n(add, 4)} BTC, or\n- repay ${n(repay)} MUSD`;
  if (want > cap) msg += `\n\nMezo requires at least ${n(lim.minNetDebt)} MUSD of net debt (debt minus ${n(lim.gasComp)} gas compensation), so repaying alone can't reach 150%. Adding BTC is the better fix.`;
  if (lim.assumed.length) msg += `\n\n(Used documented values for: ${lim.assumed.join(', ')}. Confirm in the Mezo app.)`;
  ctx.reply(`${msg}\n\nDo it in the Mezo app: ${cfg.appUrl}`);
});
bot.catch((e) => console.error('bot error', e.message));

// ---- monitor ----
let priceDown = false, priceFails = 0;
async function notifyAll(text) {
  for (const s of db.subs) await bot.api.sendMessage(s.chatId, text).catch(() => {});
}
async function tick() {
  let price;
  try {
    price = await getPrice();
    priceFails = 0;
    if (priceDown) { priceDown = false; await notifyAll('Mezo price feed is readable again. Monitoring has resumed.'); }
  } catch (e) {
    priceFails++;
    console.error('price read failed', e.message);
    if (priceFails >= 3 && !priceDown) {
      priceDown = true;
      await notifyAll("I can't read the BTC price from Mezo's oracle right now, so I can't check your loan. I'll keep trying and tell you when it works again.");
    }
    return;
  }
  for (const s of db.subs.slice()) {
    try {
      const t = await readTrove(s.address, price);
      if (!t.active) {
        if (!s.ended) {
          s.ended = true; save();
          await bot.api.sendMessage(s.chatId, `${statusText(t)}\n${s.address}\nI have stopped alerting for it. Use /unwatch to remove it, or /watch again if you open a new one.`);
        }
        continue;
      }
      if (s.ended) { s.ended = false; s.level = undefined; }
      const { buf, text } = await summary(t);
      const lvl = R.nextLevel(s.level, buf, s.warn, s.crit);
      const prev = s.level ?? 'SAFE';
      const worse = R.LEVELS.indexOf(lvl) > R.LEVELS.indexOf(prev);
      const recovered = lvl === 'SAFE' && prev !== 'SAFE';
      const repeat = lvl === 'CRITICAL' && Date.now() - (s.lastAlert ?? 0) > 30 * 60e3;
      if (worse || recovered || repeat) {
        const head = recovered ? 'Back to safe' : lvl === 'CRITICAL' ? 'CRITICAL: liquidation risk' : 'Warning: buffer shrinking';
        await bot.api.sendMessage(s.chatId, `${head}\n${s.address}\n\n${text}\n\nUse /fix ${s.address}`);
        s.lastAlert = Date.now();
      }
      s.level = lvl; save();
    } catch (e) { console.error('check failed', s.address, e.message); }
  }
}
const every = Number(process.env.POLL_SECONDS || 60) * 1000;
setInterval(() => tick().catch((e) => console.error('tick failed', e.message)), every);
(async () => {
  for (;;) {
    try { await bot.start({ onStart: () => console.log('Trove Guardian running') }); return; }
    catch (e) { console.error('polling stopped, retrying in 5s:', e.message); await new Promise((r) => setTimeout(r, 5000)); }
  }
})();
