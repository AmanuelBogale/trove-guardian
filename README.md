# Trove Guardian

Telegram bot + web dashboard that watches a Mezo MUSD Trove and warns the owner before liquidation.

## Run
1. `npm install`
2. Create a bot with @BotFather, copy `.env.example` to `.env`, and set `BOT_TOKEN`.
3. `npm run verify -- 0xTroveOwner` (confirms the contract calls work; use an address with an open testnet Trove)
4. `node --env-file=.env src/index.js`
5. Dashboard: open `web/index.html` (or serve the folder). If the browser blocks RPC calls (CORS), serve it with `npx serve web`.

Bot commands: /watch, /unwatch, /list, /status, /simulate, /fix.

## Notes
- Liquidation price = debt x 1.10 / collateral. The 110% minimum ratio and the testnet contract addresses must be confirmed against mezo.org/docs before submitting.
- /fix links to the Mezo app; the bot never holds keys or sends transactions.
- Risk math lives in `src/risk.js` and is covered by `npm test`.
