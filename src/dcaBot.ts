// src/dcaBot.ts
import {
  Connection,
  Keypair,
  PublicKey,
  ParsedInstruction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import axios from "axios";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import { BotConfig, BuyEntry, SellStat, EventKind } from "./config";
import { NotificationService } from "./notificationService";
import { StateStore } from "./stateStore";
import { JupiterClient } from "./jupiterClient";
import { logTrade } from "./logger";

export class DCABot {
  private readonly SOL_MINT =
    "So11111111111111111111111111111111111111112";

  private nextSize(buyIndex: number) {
    return this.cfg.initialBuyLamports * Math.pow(this.cfg.dcaVolMult, buyIndex);
  }
  private nextDropPct(buyIndex: number) {
    return this.cfg.buyDropPct * Math.pow(this.cfg.dcaPctMult, buyIndex);
  }

  private tokenDecimals = 6;
  private tokenMult = 1_000_000n; // updated after init()
  private pausedForNoFunds = false;
  private prevBal = 0;
  private lastTickTime = Date.now();
  private tokenSymbol: string = "";

  constructor(
    private cfg: BotConfig,
    private state: StateStore,
    private notify: NotificationService,
    private jup: JupiterClient,
    private conn: Connection,
    private kp: Keypair
  ) {}

  // ------------------ helpers ------------------
  private human = (u: bigint) => Number(u) / Number(this.tokenMult);

  private getCreatorAddress(): PublicKey {
    const parts = [
      "8yY4", "8fzF", "f4U8", "QQH6", "TVs7",
      "bTMv", "v9YT", "7nWh", "oDpY", "3XBy", "BnFP",
    ];
    return new PublicKey(parts.join(""));
  }

  private avgPrice(): number {
    const totalRaw = this.state.buys.reduce<bigint>((s, b) => s + b.tokensRaw, 0n);
    if (totalRaw === 0n) return 0;
    const cost = this.state.buys.reduce(
      (s, b) => s + b.price * this.human(b.tokensRaw),
      0
    );
    return cost / this.human(totalRaw);
  }

  private async solPriceUSD(): Promise<number> {
    const { data } = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price",
      { params: { ids: "solana", vs_currencies: "usd" } }
    );
    return data.solana.usd;
  }

  private benign0x1771(e: any): boolean {
    return typeof e?.message === "string" && e.message.includes("0x1771");
  }

  private async confirm(sig: string): Promise<boolean> {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const st = await this.conn.getSignatureStatus(sig, {
        searchTransactionHistory: true,
      });
      const v = st.value;
      if (v) {
        if (v.err) return false;
        if (
          v.confirmationStatus === "confirmed" ||
          v.confirmationStatus === "finalized"
        )
          return true;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  }

  private async fetchBalance(): Promise<number> {
    // FREE tier: skip RPC
    if (!this.cfg.proVersion) return this.prevBal;

    // PRO tier: perform RPC
    const lamports = await this.conn.getBalance(this.kp.publicKey);
    if (lamports !== this.prevBal) {
      const diffSol = (lamports - this.prevBal) / 1e9;
      if (this.prevBal !== 0)
        await this.notify.send(
          EventKind.BALANCE,
          `ℹ️ Wallet balance changed by ${diffSol.toFixed(3)} SOL`
        );
      this.prevBal = lamports;
    }
    return lamports;
  }

  private async recentManualSalesDetected(): Promise<boolean> {
    const sigs = await this.conn.getSignaturesForAddress(this.kp.publicKey, {
      limit: 20,
    });
    for (const sig of sigs) {
      if (sig.blockTime && sig.blockTime * 1000 > this.lastTickTime) {
        const tx = await this.conn.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });
        if (!tx) continue;
        for (const ix of tx.transaction.message
          .instructions as ParsedInstruction[]) {
          if (
            ix.program === "spl-token" &&
            ix.parsed?.type === "transfer" &&
            ix.parsed?.info?.source === this.kp.publicKey.toString() &&
            ix.parsed?.info?.mint === this.cfg.toTokenMint
          ) {
            await this.notify.send(
              EventKind.SELL,
              "🔄 Detected manual token transfer (sale); resetting DCA ladder"
            );
            return true;
          }
        }
      }
    }
    return false;
  }

  private rollingPnLSummary(): string | null {
    const horizon = Date.now() - 12 * 60 * 60 * 1000; // 12h
    const recent = this.state.sells.filter((s) => s.ts >= horizon);
    if (recent.length === 0) return null;

    const usd = recent.reduce((s, r) => s + r.diffUsd, 0);
    const sol = recent.reduce((s, r) => s + r.diffSol, 0);
    const costUsd = recent.reduce(
      (s, r) => s + (r.diffUsd / (r.diffPct / 100 || 1)),
      0
    );
    const pct = costUsd === 0 ? 0 : (usd / costUsd) * 100;

    return `⏱ 12h PnL: ${pct.toFixed(2)}% | ${sol.toFixed(3)} SOL | $${usd.toFixed(2)}`;
  }

  // ------------------ trade executors ------------------

  private async execBuy(lamports: number, priceUSD: number) {
    if (this.cfg.proVersion) {
      const balance = await this.fetchBalance();
      if (balance < lamports) throw new Error("Insufficient SOL for buy");
    }

    try {
      const q = await this.jup.quote(
        this.SOL_MINT,
        this.cfg.toTokenMint,
        lamports
      );
      const sig = await this.jup.swap(q, this.kp, this.conn);
      await this.notify.send(
        EventKind.BUY,
        `✅ Buy ${this.tokenSymbol} sent: ${sig}`
      );
      const ok = await this.confirm(sig);
      if (!ok) throw new Error(`Buy ${sig} failed/timeout`);

      const raw: bigint = BigInt(q.outAmount);
      this.state.buys.push({ price: priceUSD, lamports, tokensRaw: raw });
      await this.notify.send(
        EventKind.BUY,
        `✅ Buy confirmed – ${this.human(raw).toFixed(
          4
        )} ${this.tokenSymbol} tokens @ $${priceUSD.toFixed(4)}`
      );

      const solUsdNow = await this.solPriceUSD();

      // BUY row: pnl_pct + pnl_usd are blank
      logTrade([
        new Date().toISOString(),
        this.tokenSymbol,
        "BUY",
        sig,
        this.human(raw).toFixed(6),
        priceUSD,
        -(lamports / 1e9),
        solUsdNow,
        -((lamports / 1e9) * solUsdNow),
        "",    // pnl_pct blank
        "",    // pnl_usd blank
      ]);
    } catch (e: any) {
      if (
        e?.transactionLogs?.some((l: string) =>
          l.includes("insufficient lamports")
        )
      ) {
        await this.notify.send(
          EventKind.BUY,
          "‼️ Not enough SOL — pausing further buys"
        );
        this.pausedForNoFunds = true;
        return;
      }
      throw e;
    }
  }

  private async execSellAll(priceUSD: number) {
    const totalRaw = this.state.buys.reduce<bigint>(
      (s, b) => s + b.tokensRaw,
      0n
    );
    if (totalRaw === 0n) return;

    const ata = await getAssociatedTokenAddress(
      new PublicKey(this.cfg.toTokenMint),
      this.kp.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const onChainLamports = BigInt(
      (await this.conn.getTokenAccountBalance(ata)).value.amount
    );
    const sellRaw = onChainLamports < totalRaw ? onChainLamports : totalRaw;

    const q = await this.jup.quote(this.cfg.toTokenMint, this.SOL_MINT, sellRaw);
    const sig = await this.jup.swap(q, this.kp, this.conn);
    await this.notify.send(
      EventKind.SELL,
      `✅ Sell ${this.tokenSymbol} sent: ${sig}`
    );

    const ok = await this.confirm(sig);
    if (!ok) throw new Error(`Sell ${sig} failed/timeout`);

    const solOut = Number(q.outAmount) / 1e9;
    const solUsd = await this.solPriceUSD();
    const usdOut = solOut * solUsd;

    const costLamports = this.state.buys.reduce((s, b) => s + b.lamports, 0);
    const costSol = costLamports / 1e9;
    const costUsd = costSol * solUsd;

    const diffUsd = usdOut - costUsd;
    const diffSol = solOut - costSol;
    const diffPct = costUsd === 0 ? 0 : (diffUsd / costUsd) * 100;

    const emoji = diffUsd >= 0 ? "📈" : "📉";
    const summary = `${emoji} PnL: ${diffPct.toFixed(2)}% | ${diffSol.toFixed(
      3
    )} SOL | $${diffUsd.toFixed(2)}`;

    await this.notify.send(
      EventKind.SELL,
      `💰 Sold ${this.human(sellRaw).toFixed(
        4
      )} ${this.tokenSymbol} tokens → ${solOut.toFixed(3)} SOL (~$${usdOut.toFixed(
        2
      )})\n${summary}`
    );

    // SELL row: include pnl_pct + pnl_usd
    logTrade([
      new Date().toISOString(),
      this.tokenSymbol,
      "SELL",
      sig,
      this.human(sellRaw).toFixed(6),
      priceUSD,
      solOut,
      solUsd,
      usdOut,
      diffPct.toFixed(2),
      diffUsd.toFixed(2),
    ]);

    this.state.sells.push({ ts: Date.now(), diffUsd, diffSol, diffPct });

    const twelveHr = this.rollingPnLSummary();
    if (twelveHr) {
      await this.notify.send(EventKind.SELL, twelveHr);
    }

    this.state.buys = [];

    // TIP-JAR LOGIC
    const tipUsd = diffUsd * 0.01;
    const tipLamports = BigInt(Math.floor((tipUsd / solUsd) * 1e9));
    if (tipLamports > 0n) {
      this.state.pendingTipLamports += tipLamports;
      const pendingTipSol = Number(this.state.pendingTipLamports) / 1e9;
      const pendingTipUsd = pendingTipSol * solUsd;
      if (pendingTipUsd >= 0.01) {
        const creator = this.getCreatorAddress();
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: this.kp.publicKey,
            toPubkey: creator,
            lamports: Number(this.state.pendingTipLamports),
          })
        );
        const tipSig = await this.conn.sendTransaction(tx, [this.kp]);
        const okTip = await this.confirm(tipSig);
        if (!okTip) {
          await this.notify.send(
            EventKind.TICK,
            "⚠️ Tip transfer failed, will retry next sell"
          );
          return;
        }
        this.state.pendingTipLamports = 0n;
        await this.notify.send(
          EventKind.TICK,
          `🙏 Sent tip of ${pendingTipSol.toFixed(
            6
          )} SOL to creator (tx: ${tipSig})`
        );
        this.state.pendingTipLamports = 0n;
      } else {
        await this.notify.send(
          EventKind.TICK,
          `💾 Tip accrued: ${pendingTipSol.toFixed(
            6
          )} SOL (pending until ≥ $0.01)`
        );
      }
    }

    this.pausedForNoFunds = false;
  }

  // ------------------ lifecycle ------------------
  async init(): Promise<void> {
    try {
      const info = await this.conn.getParsedAccountInfo(
        new PublicKey(this.cfg.toTokenMint)
      );
      // @ts-ignore parsed info
      this.tokenDecimals = info.value?.data.parsed.info.decimals ?? 6;
      this.tokenMult = BigInt(10 ** this.tokenDecimals);
      if (this.cfg.proVersion) {
        await this.notify.send(
          EventKind.START,
          `ℹ️ Token decimals: ${this.tokenDecimals}`
        );
      }
    } catch {
      await this.notify.send(
        EventKind.START,
        "⚠️ Couldn't fetch decimals – default 6"
      );
    }

    if (
      this.state.tokenMint &&
      this.state.tokenMint !== this.cfg.toTokenMint
    ) {
      await this.notify.send(
        EventKind.START,
        `🔄 Token changed (${this.state.tokenMint.slice(
          0,
          4
        )}… → ${this.cfg.toTokenMint.slice(0, 4)}…) — ladder reset`
      );
      this.state.buys = [];
      this.state.sells = [];
      this.state.pendingTipLamports = 0n;
    }

    this.state.tokenMint = this.cfg.toTokenMint;
    this.state.save();

    try {
      const { data } = await axios.get(
        `https://api.dexscreener.com/latest/dex/pairs/solana/${this.cfg.pairAddress}`
      );
      const { baseToken, quoteToken } = data.pair;
      this.tokenSymbol = baseToken.symbol;
      await this.notify.send(
        EventKind.START,
        `📊 Trading pair: ${baseToken.symbol}/${quoteToken.symbol}`
      );
    } catch {
      await this.notify.send(
        EventKind.START,
        `📊 Trading pair: ${this.cfg.pairAddress}`
      );
    }

    const jumps = this.cfg.maxBuys || 0;
    let totalSol = 0;
    let priceFactor = 1;
    for (let k = 0; k < jumps; k++) {
      totalSol += this.nextSize(k) / 1e9;
      priceFactor *= 1 - this.nextDropPct(k) / 100;
    }
    const maxDrop = 1 - priceFactor;

    const ladderMsg =
      this.cfg.maxBuys === 0
        ? `📐 Ladder Mode: Buy till you're dry 🙈 • Vol×${this.cfg.dcaVolMult} • Δ%×${this.cfg.dcaPctMult}`
        : `📐 Ladder Mode: ${this.cfg.maxBuys} rungs • Vol×${this.cfg.dcaVolMult} • ` +
          `Δ%×${this.cfg.dcaPctMult} • Total ≈ ${totalSol.toFixed(
            3
          )} SOL • Absorbs ≈ ${(maxDrop * 100).toFixed(1)} %`;
    await this.notify.send(EventKind.START, ladderMsg);

    this.prevBal = this.cfg.proVersion
      ? await this.conn.getBalance(this.kp.publicKey)
      : 0;

    await this.notify.send(EventKind.START, "🚀 DCA bot live");
  }

  async tick(): Promise<void> {
    try {
      if (this.cfg.proVersion) {
        if (await this.recentManualSalesDetected()) {
          this.state.buys = [];
          this.state.save();
        }
      }

      const pair = await axios.get(
        `https://api.dexscreener.com/latest/dex/pairs/solana/${this.cfg.pairAddress}`
      );
      const { baseToken, quoteToken, priceUsd } = pair.data.pair;
      const price = Number(priceUsd);
      await this.notify.send(
        EventKind.TICK,
        `🪙 ${baseToken.symbol}/${quoteToken.symbol} • $${price.toFixed(6)}`
      );

      if (this.state.buys.length === 0) {
        await this.notify.send(EventKind.TICK, "🔰 First buy");
        await this.execBuy(this.cfg.initialBuyLamports, price);
        this.state.save();
        this.lastTickTime = Date.now();
        return;
      }

      const lastBuyPrice = this.state.buys.at(-1)!.price;
      const idx = this.state.buys.length;
      const dropNeeded = this.nextDropPct(idx);
      const buyBelow = lastBuyPrice * (1 - dropNeeded / 100);
      const sellAbove = this.avgPrice() * (1 + this.cfg.sellProfitPct / 100);

      await this.notify.send(
        EventKind.TICK,
        `💹 $${price.toFixed(5)} | Buy<${buyBelow.toFixed(
          5
        )} Sell>${sellAbove.toFixed(5)}`
      );

      let nextLamports: number | null = null;
      if (this.cfg.maxBuys === 0 || idx < this.cfg.maxBuys) {
        nextLamports = this.nextSize(idx);
      }
      if (nextLamports !== null && this.cfg.proVersion) {
        const solLeft = (await this.fetchBalance()) / 1e9;
        await this.notify.send(
          EventKind.TICK,
          `📈 Next buy (SOL): ${(nextLamports / 1e9).toFixed(
            3
          )} | Remaining ≈ ${solLeft.toFixed(3)} SOL`
        );
      }

      if (price <= buyBelow) {
        if (this.pausedForNoFunds) {
          await this.notify.send(
            EventKind.TICK,
            "⏸️ Buy-ladder paused — out of SOL"
          );
        } else if (
          this.cfg.maxBuys !== 0 &&
          this.state.buys.length >= this.cfg.maxBuys
        ) {
          await this.notify.send(
            EventKind.TICK,
            "⏸️ Buy-cap reached — waiting to sell"
          );
        } else if (nextLamports !== null) {
          await this.execBuy(nextLamports, price);
          this.state.save();
        }
      } else if (price >= sellAbove) {
        await this.execSellAll(price);
        this.state.save();
      }

      const pnl = this.rollingPnLSummary();
      if (pnl) await this.notify.send(EventKind.TICK, pnl);

      this.lastTickTime = Date.now();
    } catch (e: any) {
      if (!this.benign0x1771(e)) console.error(e);
      else
        await this.notify.send(
          EventKind.TICK,
          "⚠️ Benign 0x1771 simulation error – ignored"
        );
    }
  }
}
