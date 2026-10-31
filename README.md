# Trove Guardian

A Telegram bot and web dashboard that warns Mezo MUSD borrowers before their Bitcoin-backed loan is liquidated, and lets the owner top it up in one tap.

- Live: https://trove-guardian.onrender.com
- Bot: https://t.me/TroveGuardianAman_bot
- Video: https://youtu.be/jb3sczsmqQk
- Evidence of testing: [docs/EVIDENCE.md](docs/EVIDENCE.md)

Status: working on Mezo testnet. Mainnet has not been tested.

## What it does
- Reads a Trove's collateral, debt and the BTC price from Mezo's contracts and shows the liquidation price and the buffer.
- Telegram alerts at warning and critical levels the user chooses, with hysteresis so alerts do not flap.
- `/simulate` shows what happens if BTC falls by X%. `/fix` shows how much BTC to add or MUSD to repay, respecting Mezo's minimum debt.
- Tells you when the price feed cannot be read, or when your Trove was closed, liquidated or redeemed.
- Dashboard "Rescue this loan": connect the owner wallet, then add collateral or repay MUSD. Each action is simulated before the wallet is asked to sign.

## How it works
Mezo contracts (TroveManager, PriceFeed, BorrowerOperations, SortedTroves) are read with ethers.js. The bot (grammY) polls every minute. The watch list is stored in Upstash Redis so it survives restarts. A small Node server serves the dashboard and forwards RPC calls. It is hosted on Render.

## Bot commands
`/watch <address> [warn%] [critical%]`, `/unwatch <address>`, `/list`, `/status <address>`, `/simulate <address> <drop%>`, `/fix <address>`

## Run it yourself
1. `npm install`
2. Create a bot with @BotFather and copy `.env.example` to `.env`, then set `BOT_TOKEN`.
3. `node --env-file=.env src/index.js`
4. Optional settings: `BORROWER_OPERATIONS` (testnet `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5`), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `PUBLIC_URL`.
5. `npm test` runs the risk-math tests. `npm run verify -- 0xOwner` checks the contract calls against a real Trove.

## Limits
- Testnet only so far.
- The bot never holds keys or sends transactions. Rescues are signed by the owner in their own wallet.
- Premium alerts (more wallets, email and phone calls) are planned and not built.
