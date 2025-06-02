# NoMo' FOMO: On‑chain Dollar‑Cost‑Average Bot

**Version 3.3 (Alpha)**  •  **Normal & Verbose modes**
*(now with CSV ledger, token‑aware state reset **and fully tunable DCA multipliers**)*

NoMo' FOMO is a self‑custodial, open‑source **Dollar Cost Average (DCA)** bot for **Solana**. It buys dips, takes profits, logs every fill to **`trade_log.csv`**, and alerts you in real time.
A dual‑edition design lets you conserve RPC calls in **Normal** mode while power‑users unlock full monitoring in **Verbose** mode.

> 🔐 **Self‑Custodial** – your private key never leaves your machine.

---

## 🚀 Feature Matrix

|                                                       | **Normal Mode** (default) | **Verbose Mode**  |
| ----------------------------------------------------- | ------------------------- | ------------- |
| Self‑custodial, open source                           | ✔️                        | ✔️            |
| Tunable DCA **volume multiplier** (size ladder)       | ✔️                        | ✔️            |
| Tunable DCA **percentage multiplier** (dip ladder)    | ✔️                        | ✔️            |
| Configurable **max buys** or *buy‑till‑dry*           | ✔️                        | ✔️            |
| Ladder preview (total SOL & % draw‑down absorbed)     | ✔️                        | ✔️            |
| Auto‑sell on profit‑target                            | ✔️                        | ✔️            |
| CSV ledger `trade_log.csv`                            | ✔️                        | ✔️            |
| **`dca_state.json`** persistence (resume after crash) | ✔️                        | ✔️            |
| Token‑switch auto‑reset                               | ✔️                        | ✔️            |
| Wallet balance polling (`getBalance`)                 | —                         | ✔️ every tick |
| Manual‑sale detection (`getSignaturesForAddress`)     | —                         | ✔️ every tick |
| Tip‑jar (1 % of net profit)                | ✔️                        | ✔️            |
| Channel‑specific Discord / Telegram alerts            | ✔️                        | ✔️            |
| Configurable RPC call tick frequency                  | ✔️                        | ✔️            |
| Typical RPC calls ∕ hour *(60 s tick)*                | **≈ 15**                  | **≈ 75**       |

**Bottom line:** Normal mode uses **\~80 % fewer RPC calls** – perfect for public endpoints or limited Helius plans.

---

## 🗂️ Resilient State Storage

All open positions, pending tips and the mint being tracked are written to **`dca_state.json`** with BigInt‑safe encoding.
If the program, your VPS or laptop crashes, simply restart – the bot reloads the ladder and continues exactly where it left off.

---

## 🔧 `.env` Template

```env
# ─────────────────────────────────────
# ─────────────────────────────────────
# ─────────────────────────────────────
#  No'Mo' FOMO DCA Bot Sample Configuration File
# ─────────────────────────────────────
# ─────────────────────────────────────
# ─────────────────────────────────────

# ─────────────────────────────────────
#  Wallet key (get your JSON formatted key here: https://github.com/qunosteve/solana-seed-to-array )
#  For best practices, use the key from a separate wallet, not your main wallet
# ─────────────────────────────────────
PRIVATE_KEY=[123,456,...,]


# ─────────────────────────────────────
#  Token / pair configuration (grab these parameters from DexScreener)
# ─────────────────────────────────────

# WIF
PAIR_ADDRESS=32vFAmd12dTHMwo9g5QuCE9sgvdv72yUfK9PMP2dtBj7
TO_TOKEN_MINT=21AErpiB8uSb94oQKRcwuHqyHF93njAxBSbdUrpupump


# ─────────────────────────────────────
#  DCA parameters
# ─────────────────────────────────────
INITIAL_BUY_SOL=0.0125        # first buy size (SOL)
BUY_DROP_PCT=7              # % drop from last buy to trigger next
SELL_PROFIT_PCT=2.5         # % above avg cost to sell entire stack
MAX_BUYS=5   # 0 = “buy till you’re dry mode” (no cap); any positive integer caps ladder depth
DCA_VOL_MULT=2      # 2 = double each buy
DCA_PCT_MULT=1.1      # 1 = same %-dip every time

# ─────────────────────────────────────
#  Optional webhooks / notifications
# ─────────────────────────────────────
DISCORD_WEBHOOK=            # e.g. https://discord.com/api/webhooks/…
TELEGRAM_BOT_TOKEN=         # @BotFather token
TELEGRAM_CHAT_ID=           # numeric chat / channel id

# ─────────────────────────────────────────────────────────────
# ── Channel-specific event filters ───────────────────────────
#   Valid comma-separated event kinds:
#   START, TICK, BALANCE, BUY, SELL   (or ALL)
#   Leave the var empty to disable that channel entirely.
# ─────────────────────────────────────────────────────────────
CONSOLE_EVENTS=ALL                                    # show everything in terminal
DISCORD_EVENTS=START,BUY,SELL                           # only trade & stats to Discord
TELEGRAM_EVENTS=SELL                                  # just final sells to Telegram

# ─────────────────────────────────────
#  Advanced Configuration
#  Normal mode works on Helius Free Tier. go to https://www.helius.dev/ and set it up
# ─────────────────────────────────────
RPC_ENDPOINT=https://api.mainnet-beta.solana.com   # or your Helius / QuickNode URL
VERBOSE_VERSION=0   # 0 =doesn't query wallet balance/etc, 1 = verbose, which uses more useful data but more rpc calls
TICK_INTERVAL_MS=60000
```

> **Tip:** keep `VERBOSE_VERSION=0` while testing on a shared RPC; flip to 1 once you switch to a private endpoint.

---

### 🔑 Need Your JSON Wallet Key?

If you’re not sure how to get the JSON-encoded key from your Solana wallet, use this simple utility:

👉 [solana-seed-to-array](https://github.com/qunosteve/solana-seed-to-array)

It helps you convert your wallet's seed phrase into the proper JSON array format required by this bot.  
Make sure to **store it securely** and never share it publicly.

## 🧪 Example Configurations

### 1. **BONK** – Deep‑Dip, Wide Steps

```env
INITIAL_BUY_SOL=0.005
BUY_DROP_PCT=10
DCA_VOL_MULT=2        # double‑down
DCA_PCT_MULT=1        # flat 10 % ladder
MAX_BUYS=7            # seven rungs
SELL_PROFIT_PCT=15
```

*Buys →* 0.005 → 0.010 → 0.020 SOL … up to seven times.
Absorbs **≈ 52 %** draw‑down, sells when average price is +15 %.

### 2. **WIF** – Tighter Ladder, Same Size Multiplier

```env
INITIAL_BUY_SOL=0.010
BUY_DROP_PCT=5
DCA_VOL_MULT=2
DCA_PCT_MULT=1
MAX_BUYS=5
SELL_PROFIT_PCT=8
```

Absorbs **≈ 23 %** drop, sells on +8 % gain.

### 3. **TACO** – *Martini* Ladder (softer sizing)

```env
INITIAL_BUY_SOL=0.010
BUY_DROP_PCT=6
DCA_VOL_MULT=1.5      # 10 → 15 → 22.5 …
DCA_PCT_MULT=1        # flat ladder
MAX_BUYS=8
SELL_PROFIT_PCT=10
```

Total SOL committed is smaller than a 2× series while giving eight bites at the dip.

### 4. **DOG** – Expanding Ladder (wider dips)

```env
INITIAL_BUY_SOL=0.008
BUY_DROP_PCT=4
DCA_VOL_MULT=2
DCA_PCT_MULT=1.25     # 4 → 5 → 6.25 → …
MAX_BUYS=6
SELL_PROFIT_PCT=12
```

Dip trigger grows 25 % each rung, so buys slow down in free‑falls.

---

## ⏩ Quick Start

```bash
# 1 · Download & install
git clone https://github.com/qunosteve/nomo-fomo-dca-bot
cd nomo-fomo-dca-bot
npm install # Learn about npm here: https://www.w3schools.com/whatis/whatis_npm.asp

# 2 · Create .env file in the nomo-fomo-dca-bot directory (see template above)

# 3 · Run
npx ts-node index.ts

# 4 · Update
CTRL+c #y
git pull origin main
npx ts-node index.ts

```

---

## 💸 About the Tip‑Jar

NoMo' FOMO never charges volume fees. Instead, it tips **1 % of *net profit***.
Tips accrue on‑chain until they reach **\$0.01** (≈ 0.00005 SOL) to save fees.

| Profit | Tip (1 %) | You Keep |
| ------ | --------- | -------- |
| \$ 10  | \$ 0.10   | \$ 9.90  |
| \$ 50  | \$ 0.50   | \$ 49.50 |

Want zero tip? Fork the repo and comment out three lines – it’s open‑source.

---

## 🗃️ CSV Trade Ledger

Every confirmed buy/sell is appended to **`trade_log.csv`** with:

```
timestamp,symbol,event,tx,tokens,token_price_usd,sol_delta,sol_price_usd,usd_delta,pnl_pct
```

Import into Excel, Sheets, or your accountant’s software for painless capital‑gains tracking.

---

## 🧠 Best Practices

* Test with tiny SOL first.
* Normal tier → public RPC; Verbose tier → dedicated RPC/API key.
* Back up `.env`, `dca_state.json`, and `trade_log.csv`.
* Keep node‑build tools installed if you want native bigint bindings (fallback JS is fine).

---

## 📜 License — ISC

```
ISC License

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED “AS IS” AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

---

## 🙏 Acknowledgements

Thanks for giving **NoMo' FOMO** a spin. Fork it, improve it, and share your results!
