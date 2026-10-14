import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { Bot } from 'grammy';
import { cfg, getPrice, readTrove, isAddress } from './chain.js';
import * as R from './risk.js';

if (!process.env.BOT_TOKEN) throw new Error('Set BOT_TOKEN in .env (see .env.example)');
const bot = new Bot(process.env.BOT_TOKEN);

// ---- tiny JSON store ----
const FILE = process.env.DATA_FILE || 'data.json';
const db = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { subs: [] };
const save = () => { writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 1)); renameSync(FILE + '.tmp', FILE); };

const n = (x, d = 2) => R.toNum(x).toLocaleString('en-US', { maximumFractionDigits: d });
const TARGET_ICR = R.fromNum(1.5); // "safe" ratio suggested by /fix

function summary(t) {
  const liq = R.liquidationPrice(t.coll, t.debt);
  const buf = R.bufferPct(t.price, liq);
  return { liq, buf, text:
    `Collateral: ${n(t.coll, 4)} BTC\nDebt: ${n(t.debt)} MUSD\nBTC price: $${n(t.price)}\n` +
    `Collateral ratio: ${(R.toNum(t.onchainIcr) * 100).toFixed(1)}%\n` +
    `Liquidation price: $${n(liq)}\nBuffer: ${buf.toFixed(1)}% price drop` };
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
  if (!t.active) return ctx.reply('No active Trove found for that address on this network.');
  db.subs = db.subs.filter((s) => !(s.chatId === ctx.chat.id && s.address.toLowerCase() === addr.toLowerCase()));
  db.subs.push({ chatId: ctx.chat.id, address: addr, warn, crit });
  save();
  ctx.reply(`Watching ${addr}\nAlerts at ${warn}% and ${crit}% buffer.\n\n${summary(t).text}`);
});

bot.command('unwatch', (ctx) => {
  const a = ctx.match.trim().toLowerCase();
  db.subs = db.subs.filter((s) => !(s.chatId === ctx.chat.id && s.address.toLowerCase() === a));
  save(); ctx.reply('Stopped watching.');
});
bot.command('list', (ctx) => {
  const mine = db.subs.filter((s) => s.chatId === ctx.chat.id);
  ctx.reply(mine.length ? mine.map((s) => `${s.address} (${s.warn}%/${s.crit}%) ${s.level ?? ''}`).join('\n') : 'Nothing watched yet.');
});
bot.command('status', async (ctx) => {
  const a = ctx.match.trim();
  if (!isAddress(a)) return ctx.reply('Usage: /status 0xAddress');
  const t = await readTrove(a);
  ctx.reply(t.active ? summary(t).text : 'No active Trove for that address.');
});
bot.command('simulate', async (ctx) => {
  const [addr, d] = ctx.match.trim().split(/\s+/); const drop = Number(d);
  if (!isAddress(addr ?? '') || !(drop >= 0 && drop < 100)) return ctx.reply('Usage: /simulate 0xAddress 30');
  const t = await readTrove(addr);
  if (!t.active) return ctx.reply('No active Trove for that address.');
  const p2 = (t.price * BigInt(Math.round((100 - drop) * 100))) / 10000n;
  const ratio = R.toNum(R.icr(t.coll, t.debt, p2)) * 100;
  ctx.reply(`If BTC falls ${drop}% to $${n(p2)}:\nCollateral ratio ${ratio.toFixed(1)}% -> ${ratio < 110 ? 'LIQUIDATABLE' : 'still safe'}`);
});
bot.command('fix', async (ctx) => {
  const a = ctx.match.trim();
  if (!isAddress(a)) return ctx.reply('Usage: /fix 0xAddress');
  const t = await readTrove(a);
  if (!t.active) return ctx.reply('No active Trove for that address.');
  ctx.reply(`To reach a 150% ratio you can either:\n- add ${n(R.addCollateralFor(t.coll, t.debt, t.price, TARGET_ICR), 4)} BTC, or\n- repay ${n(R.repayFor(t.coll, t.debt, t.price, TARGET_ICR))} MUSD\n\nDo it in the Mezo app: ${cfg.appUrl}`);
});
bot.catch((e) => console.error('bot error', e.message));

// ---- monitor ----
async function tick() {
  const price = await getPrice();
  for (const s of db.subs) {
    try {
      const t = await readTrove(s.address, price);
      if (!t.active) continue;
      const { buf, text } = summary(t);
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
bot.start({ onStart: () => console.log('Trove Guardian running') });
