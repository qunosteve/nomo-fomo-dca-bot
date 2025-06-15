# Beginner's Guide to On-Chain Trading 🚀

Welcome to your first journey into on-chain trading! This guide will help you go from your bank account all the way to running the **NoMo FOMO Bot** on Solana. Let’s break it down step-by-step for beginners. By the end, you’ll be ready to trade on-chain with confidence! 💪

---

## 🏦 1️⃣ Set up your Coinbase account

1. Go to [https://www.coinbase.com/](https://www.coinbase.com/) 🌐
2. Create an account — you’ll need an email and to set a password 🔒
3. Complete identity verification (upload ID, provide personal details) 🪪
4. Link your bank account or debit card 💳
5. Buy **SOL (Solana)** tokens ⚡

---

## 🦊 2️⃣ Set up your Phantom wallet

1. Download Phantom wallet: [https://phantom.app/](https://phantom.app/) 📲
2. Create a new wallet
3. **Write down and securely store** your 12-word seed phrase (this is your master key 🔑 — never share it!)
4. Copy your wallet address (you’ll use this to receive SOL) 📋

---

## 💸 3️⃣ Fund your Phantom wallet

1. In Coinbase, select **Send/Receive**
2. Paste your Phantom wallet address
3. Double-check the address (always!) 👀
4. Send your SOL and wait for it to appear in Phantom ⏳

---

## 🤖 4️⃣ Set up NoMo FOMO Bot

🖥️ **Before you start:**

* Download and install **Node.js** (includes npm) from [https://nodejs.org/](https://nodejs.org/) ✅
* Download and install **Git** from [https://git-scm.com/](https://git-scm.com/) ✅
* Learn how to open **Terminal** (Mac) or **Command Prompt** (Windows). Tip: On Mac, search for "Terminal" in Spotlight 🔍. On Windows, search for "Command Prompt" in the Start Menu 💻.

---

### ⌨️ Run these commands one by one:

```bash
# 1 · Clone & install
git clone https://github.com/qunosteve/nomo-fomo-dca-bot
cd nomo-fomo-dca-bot
npm install

# 2 · Run adaptive setup
npm run setup

# 3 · Launch the bot
npm run start

# 4 · Update code when needed
git pull
npm install
npm run start
```

---

### 🔍 How to find pairs and mint addresses on Dexscreener

1. Go to [https://dexscreener.com/](https://dexscreener.com/) 🌐
2. In the search bar at the top, type the **token name or symbol** (e.g. BONK) 🔎
3. Look for Solana pairs (you’ll see “Solana” or “SOL” mentioned in the pair info) ⚡
4. Click the pair you want — the URL will contain the **pair address**, and on the page you'll see the **token mint address** 🔑
5. Copy these addresses carefully for use during setup 📋

---

### ⚡ During setup you’ll:

* Enter your **12-word seed phrase**
* Choose your **trading pair** using the pair and mint from Dexscreener
* Configure ladder: initial buy, rungs, volume multiplier
* Set your profit % and tick interval

Watch your terminal for updates and bot actions! 📈

---

## 📖 More resources

✅ When you're ready, check out the [README](https://github.com/qunosteve/nomo-fomo-dca-bot/blob/main/readme.md) for advanced setup options and tips!

Happy trading and welcome to the world of on-chain! 🌊

---

## 💡 Why this process might feel tedious (and why it’s worth it!)

Setting up on-chain trading can feel a bit tedious at first — installing tools, securing your seed phrase, hunting down mint addresses, and running commands. This is because **self-custodial trading** puts you in full control. There’s no centralized exchange holding your funds or keys — you hold your own keys 🔑.

✅ **Benefits:**

* You truly own your assets (not your keys, not your crypto!)
* No reliance on centralized platforms that could freeze funds or go down 🚫
* Privacy and sovereignty over your trades and wallet
* Learn skills that will help you explore other Web3 opportunities 🚀

While it takes effort up front, you’ll gain independence and peace of mind knowing your trading is fully in your hands.
