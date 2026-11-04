# Evidence

Rescue transactions were done on Mezo testnet with test coins. Mainnet is read-only: Trove Guardian never sends a transaction there.

## Live links
- App and dashboard: https://trove-guardian.onrender.com
- Telegram bot: https://t.me/TroveGuardianAman_bot
- Demo video: https://youtu.be/jb3sczsmqQk
- Pitch deck: [Trove Guardian pitch deck.pdf](../Trove%20Guardian%20pitch%20deck.pdf)

## 1. One-tap rescue, on a real testnet loan
From the dashboard, the owner connected a wallet (Rabby), the page simulated the call, and the wallet signed it.

| | Before | After |
|---|---|---|
| Collateral | 0.048 BTC | 0.0485 BTC |
| Collateral ratio | 168.2% | 170.0% |
| Liquidation price | $50,485.24 | $49,964.78 |
| Buffer before liquidation | 34.6% | 35.3% |

- Rescue transaction (adds 0.0005 BTC through BorrowerOperations): [0x3f0014c0...6858](https://explorer.test.mezo.org/tx/0x3f0014c04333f8790338fcc36fff94993c64b1b79c15e7ddfb50003903b76858)
- BTC moved slightly between the two readings, so the ratio change is not only from the added collateral.

## 2. Read-only on Mezo mainnet (tested Nov 4, 2026)
- `/riskiest` read Mezo's sorted list of Troves on mainnet: **3 open Troves**. The lowest ratio was **115%** (debt about 2,090 MUSD), then 134%, then about 8,891%.
- `/status` on a mainnet Trove returned 16.5892 BTC of collateral, 14,492.93 MUSD of debt, a ratio of 8,893.4% and a 98.8% buffer. `/rank` placed it **3 of 3** from the lowest ratio.
- The dashboard loads the same Trove with the network switch set to mainnet, and shows the redemption queue position.
- A mainnet sample to try: `0x593c427d8C7bf5C555Ed41cd7CB7cCe8C9F15bB5`. Figures change over time.
- Why it matters: only a handful of Troves are open on mainnet right now, so the market for loan monitoring is small today. Trove Guardian is built for when borrowing grows, and its redemption-risk view applies to every Trove.

## 3. Safety checks
- A repayment larger than Mezo allows (5,000 MUSD) is refused on the page before any wallet pop-up, using the minimum net debt read from the chain (1,800 MUSD).
- Every action is simulated first. Nothing is sent unless the simulation passes and the owner confirms in the wallet.
- The app never holds keys. The dashboard relay only forwards read calls.

## 4. Values read from the chain
The minimum collateral ratio, the gas compensation and the minimum net debt are read from Mezo's contracts on both networks. The buffer comes from `getCurrentICR`.

## Contracts used (official Mezo docs)
| | Testnet | Mainnet |
|---|---|---|
| TroveManager | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` | `0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193` |
| PriceFeed | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` | `0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88` |
| BorrowerOperations | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` | `0x44b1bac67dDA612a41a58AAf779143B181dEe031` |
| SortedTroves | `0x722E4D24FD6Ff8b0AC679450F3D91294607268fA` | `0x8C5DB4C62BF29c1C4564390d10c20a47E0b2749f` |

## Tests
`npm test` runs 5 automated tests on the risk math (ratio, liquidation price, buffer, repay limits, alert levels).

## Not done yet
- Rescue on mainnet: not built, by design.
- Repaying MUSD from the dashboard is implemented but not yet exercised with a real transaction.
- The alerts for a failed price read and for closed or liquidated Troves are implemented but have not been triggered in production.
- Bitcoin-wallet sign-in (Mezo Passport) is not supported. The rescue needs an EVM wallet such as Rabby.
