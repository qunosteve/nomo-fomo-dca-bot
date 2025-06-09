# NoMo' FOMO: On‑chain Dollar‑Cost‑Average Bot

**Version 4.0.1 (Alpha)**  •  **Normal & Verbose modes**
*(now with CSV ledger, token‑aware state reset, fully tunable DCA multipliers, and an adaptive interactive setup)*

NoMo' FOMO is a self‑custodial, open‑source **Dollar Cost Average (DCA)** bot for **Solana**. It buys dips, takes profits, logs every fill to **`trade_log.csv`**, and sends alerts in real time.
A dual‑edition design lets you conserve RPC calls in **Normal** mode while power‑users unlock full monitoring in **Verbose** mode.

> 🔐 **Self‑Custodial** – your private key never leaves your machine.

---

## 🚀 Feature Matrix

|                                                       | **Normal Mode** (default) | **Verbose Mode** |
| ----------------------------------------------------- | ------------------------- | ---------------- |
| Self‑custodial, open source                           | ✔️                        | ✔️               |
| Tunable DCA **volume multiplier** (size ladder)       | ✔️                        | ✔️               |
| Tunable DCA **percentage multiplier** (dip ladder)    | ✔️                        | ✔️               |
| Configurable **max buys** or *buy‑till‑dry*           | ✔️                        | ✔️               |
| Ladder preview (total SOL & % draw‑down absorbed)     | ✔️                        | ✔️               |
| Auto‑sell on profit‑target                            | ✔️                        | ✔️               |
| CSV ledger `trade_log.csv`                            | ✔️                        | ✔️               |
| **`dca_state.json`** persistence (resume after crash) | ✔️                        | ✔️               |
| Token‑switch auto‑reset                               | ✔️                        | ✔️               |
| Wallet balance polling (`getBalance`)                 | —                         | ✔️ every tick    |
| Manual‑sale detection (`getSignaturesForAddress`)     | —                         | ✔️ every tick    |
| Tip‑jar (1 % of net profit)                           | ✔️                        | ✔️               |
| Channel‑specific Discord / Telegram alerts            | ✔️                        | ✔️               |
| Configurable RPC call tick frequency                  | ✔️                        | ✔️               |
| Typical RPC calls ∕ hour *(60 s tick)*                | **≈ 15**                  | **≈ 75**         |

**Bottom line:** Normal mode uses **∼80 % fewer RPC calls** – perfect for public endpoints or limited Helius plans.

---

## 🛠️ Adaptive Interactive Setup

Instead of hand‑crafting your `.env`, run a wizard that:

1. Loads any existing `.env` and pre‑loads defaults.
2. Lets you pick which sections to update: Seed, Pair, Ladder, Profit, RPC.
3. Prompts only the chosen sections, reusing unchanged settings.
4. Validates required fields before saving.

```bash
npm run setup
```

Afterwards, `.env` is updated in place—no surprises or missing keys.

---

## 🔧 `.env` Reference

The wizard writes or updates these keys (you can still edit manually):

```env
RPC_ENDPOINT=...            # e.g. https://api.mainnet-beta.solana.com
PRIVATE_KEY=[array]         # JSON array of your secretKey
PAIR_ADDRESS=...            # DexScreener pairAddress
TO_TOKEN_MINT=...           # Base token mint address
INITIAL_BUY_SOL=0.0125      # First buy in SOL
MAX_BUYS=5                  # Ladder depth (0 = unlimited)
DCA_VOL_MULT=2              # Volume multiplier per rung
DCA_PCT_MULT=1.1            # Drop‑% multiplier per rung
BUY_DROP_PCT=10             # % drop to trigger each buy
SELL_PROFIT_PCT=2.5         # % profit to trigger sell
TICK_INTERVAL_MS=60000      # Poll interval in ms
CONSOLE_EVENTS=ALL          # Terminal events filter
# Optional: DISCORD_EVENTS, TELEGRAM_EVENTS, DISCORD_WEBHOOK, etc.
```  

---

## ⏩ Quick Start

```bash
# 1 · Clone & install
git clone https://github.com/qunosteve/nomo-fomo-dca-bot
cd nomo-fomo-dca-bot
npm install

# 2 · Run adaptive setup
npm run setup

# 3 · Launch the bot
npm run start

# 4 · Pull & repeat
git pull
npm install
npm run start
```

---

## 💸 Tip‑Jar & Ledger

- **Tip‑Jar:** 1 % of net profit, sends once ≥ \$0.01.
- **Ledger:** All trades logged in `trade_log.csv` (perfect for tax reports...or to dazzle your accountant with big numbers 😉)

---

## 💡 Best Practices

- Test with small SOL amounts.
- Use Normal mode on shared RPC; Verbose on private endpoints.
- Backup `.env`, `dca_state.json`, and `trade_log.csv`.

---

## 📜 License — ISC

*Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies. The software is provided “as is” and the author disclaims all warranties with regard to this software including all implied warranties of merchantability and fitness. In no event shall the author be liable for any special, direct, indirect, or consequential damages or any damages whatsoever resulting from loss of use, data or profits, whether in an action of contract, negligence or other tortious action, arising out of or in connection with the use or performance of this software.*

---

## 🙏 Acknowledgements

Thanks for choosing **NoMo' FOMO**—fork, customize, and share your gains!
