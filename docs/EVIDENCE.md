# Evidence (Mezo testnet)

Everything below was done on Mezo testnet with test coins. Nothing here has been tried on mainnet.

## Live links
- App and dashboard: https://trove-guardian.onrender.com
- Telegram bot: https://t.me/TroveGuardianAman_bot
- Demo video: https://youtu.be/jb3sczsmqQk
- Pitch deck: [Trove Guardian pitch deck.pdf](../Trove%20Guardian%20pitch%20deck.pdf)

## One-tap rescue, on a real testnet loan
From the dashboard, the owner connected a wallet (Rabby), the page simulated the call, and the wallet signed it.

| | Before | After |
|---|---|---|
| Collateral | 0.048 BTC | 0.0485 BTC |
| Collateral ratio | 168.2% | 170.0% |
| Liquidation price | $50,485.24 | $49,964.78 |
| Buffer before liquidation | 34.6% | 35.3% |

- Rescue transaction (adds 0.0005 BTC through BorrowerOperations): [0x3f0014c0...6858](https://explorer.test.mezo.org/tx/0x3f0014c04333f8790338fcc36fff94993c64b1b79c15e7ddfb50003903b76858)
- BTC price moved slightly between the two readings, so the ratio change is not only from the added collateral.

## Safety checks
- A repayment larger than Mezo allows (5,000 MUSD) is refused on the page before any wallet pop-up, using the minimum net debt read from the chain (1,800 MUSD).
- Every action is simulated first. Nothing is sent unless the simulation passes and the owner confirms in the wallet.
- The app never holds keys.

## Values read from the chain
The bot reads the minimum collateral ratio, the gas compensation and the minimum net debt from Mezo's contracts. Its `/fix` reply no longer reports any "documented values" fallback.

## Contracts used (Mezo testnet)
- TroveManager `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0`
- PriceFeed `0x86bCF0841622a5dAC14A313a15f96A95421b9366`
- BorrowerOperations `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5`
- SortedTroves `0x722E4D24FD6Ff8b0AC679450F3D91294607268fA`

## Tests
`npm test` runs 5 automated tests on the risk math (ratio, liquidation price, buffer, repay limits, alert levels).

## Not done yet
- Mainnet has not been tested.
- The alerts for a failed price read and for closed or liquidated Troves are implemented but have not been triggered in production.
- Repaying MUSD from the dashboard is implemented but not yet exercised with a real transaction.
