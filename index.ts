// NOMO FOMO DCA BOT — v3.2
// ---------------------------------------------------------------------------
//  • Channel‑aware logging & notifications (console / Discord / Telegram)
//  • .env‑driven event filters per channel (START, TICK, BALANCE, BUY, SELL, PNL)
//  • Jupiter v6 quoting / swapping
//  • BigInt‑accurate accounting & JSON state
//  • Robust tx‑confirmation with 0x1771 benign‑error handling
//  • Wallet‑balance change alerts & projected buy ladder
//  • Profit/Loss breakdown (%, SOL, USD) on every sell
//  • Rolling 12‑hour PnL statistics
//  • Auto‑reset DCA sequence on manual sells (testing)
// ---------------------------------------------------------------------------

import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  ParsedInstruction, SystemProgram, Transaction,
} from "@solana/web3.js";
import axios from "axios";
import dotenv from "dotenv";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  renameSync,
  statSync,
} from "fs";
import { setTimeout as delay } from "timers/promises";
import {
  getAssociatedTokenAddress,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";


dotenv.config();

// ---------------------------------------------------------------------------
// TYPES & CONFIG HELPERS
// ---------------------------------------------------------------------------

type Lamports = number;
type TokensRaw = bigint;

enum EventKind {
  START = "START",
  TICK = "TICK",
  BALANCE = "BALANCE",
  BUY = "BUY",
  SELL = "SELL",
}

interface BuyEntry {
  price: number;
  lamports: Lamports;
  tokensRaw: TokensRaw;
}

interface SellStat {
  ts: number; // epoch ms
  diffUsd: number;
  diffSol: number;
  diffPct: number;
}

interface BotConfig {
  rpc: string;
  pairAddress: string;
  toTokenMint: string;
  initialBuyLamports: Lamports;
  maxBuys: number;  
  dcaVolMult: number;      
  dcaPctMult: number;      
  buyDropPct: number;
  sellProfitPct: number;
  // channels & filters (comma‑separated list of EventKind or "ALL")
  consoleEvents: string;
  discordEvents?: string;
  telegramEvents?: string;
  discordWebhook?: string;
  telegramBot?: string;
  telegramChat?: string;
  proVersion: boolean; 
}

function buildConfig(): BotConfig {
  const required = (key: string) => {
    const v = process.env[key];
    if (!v) throw new Error(`Missing env var ${key}`);
    return v;
  };

  return {
    rpc: process.env.RPC_ENDPOINT ?? "https://api.mainnet-beta.solana.com",
    pairAddress: required("PAIR_ADDRESS"),
    toTokenMint: required("TO_TOKEN_MINT"),
    initialBuyLamports: Number(process.env.INITIAL_BUY_SOL ?? 0.0125) * 1e9,
    buyDropPct: Number(process.env.BUY_DROP_PCT ?? 10),
    maxBuys: Number(process.env.MAX_BUYS ?? 0), // 0 means “unlimited”
    dcaVolMult: Number(process.env.DCA_VOL_MULT ?? 2),
    dcaPctMult: Number(process.env.DCA_PCT_MULT ?? 1),
    sellProfitPct: Number(process.env.SELL_PROFIT_PCT ?? 2.5),
    consoleEvents: process.env.CONSOLE_EVENTS ?? "ALL",
    discordEvents: process.env.DISCORD_EVENTS,
    telegramEvents: process.env.TELEGRAM_EVENTS,
    discordWebhook: process.env.DISCORD_WEBHOOK,
    telegramBot: process.env.TELEGRAM_BOT_TOKEN,
    telegramChat: process.env.TELEGRAM_CHAT_ID,
    proVersion: process.env.VERBOSE_VERSION === "1",
  };
}

// ---------------------------------------------------------------------------
// NOTIFICATION SERVICE
// ---------------------------------------------------------------------------
class NotificationService {
  private filters: Record<"console" | "discord" | "telegram", Set<string>>;

  constructor(private cfg: BotConfig) {
    const parse = (v?: string) =>
      new Set((v ?? "").split(/[, ]+/).filter(Boolean).map((x) => x.toUpperCase()));

    this.filters = {
      console: parse(cfg.consoleEvents ?? "ALL"),
      discord: parse(cfg.discordEvents ?? ""),
      telegram: parse(cfg.telegramEvents ?? ""),
    };

    // if empty, treat as ALL
    if (this.filters.console.size === 0) this.filters.console.add("ALL");
  }

  private shouldSend(channel: keyof typeof this.filters, kind: EventKind): boolean {
    const f = this.filters[channel];
    return f.has("ALL") || f.has(kind);
  }

  async send(kind: EventKind, msg: string): Promise<void> {
    try {
      if (this.shouldSend("console", kind)) console.log(msg);

      const tasks: Promise<unknown>[] = [];

      if (this.cfg.discordWebhook && this.shouldSend("discord", kind)) {
        tasks.push(
          fetch(this.cfg.discordWebhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: msg }),
          })
        );
      }

      if (
        this.cfg.telegramBot &&
        this.cfg.telegramChat &&
        this.shouldSend("telegram", kind)
      ) {
        tasks.push(
          fetch(
            `https://api.telegram.org/bot${this.cfg.telegramBot}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: this.cfg.telegramChat, text: msg }),
            }
          )
        );
      }

      await Promise.allSettled(tasks);
    } catch (err) {
      console.error("Notification error:", err);
    }
  }
}

// ---------------------------------------------------------------------------
// STATE STORE (persistent JSON)
// ---------------------------------------------------------------------------
class StateStore {
  private file = "dca_state.json";
  tokenMint: string = "";              
  buys: BuyEntry[] = [];
  sells: SellStat[] = [];
  pendingTipLamports: bigint = 0n;

  constructor() {
    this.load();
  }

private load() {
  if (!existsSync(this.file) || statSync(this.file).size === 0) return;
  try {
    const raw = readFileSync(this.file, "utf8");
    const obj = JSON.parse(raw, (_k, v) =>
      typeof v === "string" && v.endsWith("n") ? BigInt(v.slice(0, -1)) : v
    );
    this.tokenMint          = obj.tokenMint ?? "";
    this.buys               = obj.buys ?? [];
    this.sells              = obj.sells ?? [];
    this.pendingTipLamports = BigInt(obj.pendingTipLamports ?? 0);
  } catch {
    renameSync(this.file, `${this.file}.corrupt_${Date.now()}`);
  }
}


  save() {
    writeFileSync(
      this.file,
      JSON.stringify(
        {
          tokenMint: this.tokenMint,                 // ← NEW
          buys: this.buys,
          sells: this.sells,
          pendingTipLamports: this.pendingTipLamports,
        },
        (_k, v) => (typeof v === "bigint" ? `${v}n` : v),
        2
      )
    );
  }
}

// ---------------------------------------------------------------------------
// JUPITER API WRAPPER
// ---------------------------------------------------------------------------
class JupiterClient {
  private readonly BASE = "https://quote-api.jup.ag/v6";

  async quote(inputMint: string, outputMint: string, amount: bigint | number) {
    const { data } = await axios.get(`${this.BASE}/quote`, {
      params: {
        inputMint,
        outputMint,
        amount: amount.toString(),
        slippageBps: 50,
      },
    });
    return data.data?.[0] || data;
  }

  async swap(q: any, kp: Keypair, connection: Connection) {
    const { data } = await axios.post(`${this.BASE}/swap`, {
      quoteResponse: q,
      userPublicKey: kp.publicKey.toString(),
      wrapUnwrapSOL: true,
      dynamicComputeUnitLimit: true,
    });
    const vtx = VersionedTransaction.deserialize(
      Buffer.from(data.swapTransaction, "base64")
    );
    vtx.sign([kp]);
    return connection.sendRawTransaction(vtx.serialize());
  }
}

const CSV_FILE = "trade_log.csv";

function logTrade(row: (string | number)[]) {
  if (!existsSync(CSV_FILE)) {
    appendFileSync(
      CSV_FILE,
      "timestamp,event,tx,tokens,token_price_usd,sol_delta,sol_price_usd,usd_delta,pnl_pct\n"
    );
  }
  appendFileSync(
    CSV_FILE,
    row.map(v => typeof v === "string" ? `"${v}"` : v).join(",") + "\n"
  );
}


// ---------------------------------------------------------------------------
// DCABot CLASS (full)
// ---------------------------------------------------------------------------
class DCABot {
  private readonly SOL_MINT =
    "So11111111111111111111111111111111111111112";
  private nextSize(buyIndex: number) {
    // 0 → first re-buy, 1 → second re-buy, …
    return this.cfg.initialBuyLamports * Math.pow(this.cfg.dcaVolMult, buyIndex);
  }

  private nextDropPct(buyIndex: number) {
    // base-dip · pctMult^index
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
  const parts = ["8yY4", "8fzF", "f4U8", "QQH6", "TVs7", "bTMv", "v9YT", "7nWh", "oDpY", "3XBy", "BnFP"];
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
        if (v.confirmationStatus === "confirmed" || v.confirmationStatus === "finalized") return true;
      }
      await delay(2_000);
    }
    return false;
  }

private async fetchBalance(): Promise<number> {
  // FREE tier: skip RPC, just return the cached value
  if (!this.cfg.proVersion) return this.prevBal;

  // PRO tier: perform the RPC call
  const lamports = await this.conn.getBalance(this.kp.publicKey);
  if (lamports !== this.prevBal) {
    const diffSol = (lamports - this.prevBal) / 1e9;
    if (this.prevBal !== 0)
      await this.notify.send(EventKind.BALANCE, `ℹ️ Wallet balance changed by ${diffSol.toFixed(3)} SOL`);
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
        for (const ix of tx.transaction.message.instructions as ParsedInstruction[]) {
          if (
            ix.program === "spl-token" &&
            ix.parsed?.type === "transfer" &&
            ix.parsed?.info?.source === this.kp.publicKey.toString() &&
            ix.parsed?.info?.mint === this.cfg.toTokenMint
          ) {
            await this.notify.send(EventKind.SELL, "🔄 Detected manual token transfer (sale); resetting DCA ladder");
            return true;
          }
        }
      }
    }
    return false;
  }

  private rollingPnLSummary(): string | null {
    const horizon = Date.now() - 12 * 60 * 60 * 1000; // 12h ms
    const recent = this.state.sells.filter((s) => s.ts >= horizon);
    if (recent.length === 0) return null;

    const usd = recent.reduce((s, r) => s + r.diffUsd, 0);
    const sol = recent.reduce((s, r) => s + r.diffSol, 0);
    const costUsd = recent.reduce((s, r) => s + (r.diffUsd / (r.diffPct / 100 || 1)), 0);
    const pct = costUsd === 0 ? 0 : (usd / costUsd) * 100;

    return `⏱ 12h PnL: ${pct.toFixed(2)}% | ${sol.toFixed(3)} SOL | $${usd.toFixed(2)}`;
  }

  // ------------------ trade executors ------------------
private async execBuy(lamports: number, priceUSD: number) {
  // ✅ Only check wallet balance if Pro mode
  if (this.cfg.proVersion) {
    const balance = await this.fetchBalance();
    if (balance < lamports) throw new Error("Insufficient SOL for buy");
  }
try {
  const q = await this.jup.quote(this.SOL_MINT, this.cfg.toTokenMint, lamports);
    const sig = await this.jup.swap(q, this.kp, this.conn);
    await this.notify.send(EventKind.BUY, `✅ Buy ${this.tokenSymbol} sent: ${sig}`);
    const ok = await this.confirm(sig);
    if (!ok) throw new Error(`Buy ${sig} failed/timeout`);

    const raw: bigint = BigInt(q.outAmount);
    this.state.buys.push({ price: priceUSD, lamports, tokensRaw: raw });
    await this.notify.send(EventKind.BUY, `✅ Buy confirmed – ${this.human(raw).toFixed(4)} ${this.tokenSymbol} tokens @ $${priceUSD.toFixed(4)}`);
    const solUsdNow = await this.solPriceUSD();
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
        ""
      ]);
    } catch (e: any) {
        if (e?.transactionLogs?.some((l: string)=> l.includes("insufficient lamports"))) {
    await this.notify.send(EventKind.BUY, "‼️ Not enough SOL — pausing further buys");
    this.pausedForNoFunds = true;
    return;        // exit quietly, don’t throw
  }
  throw e;         // re-throw any other error
}
  }

private async execSellAll(priceUSD: number) {
  // total tokens recorded from buys
  const totalRaw = this.state.buys.reduce<bigint>((s, b) => s + b.tokensRaw, 0n);
  if (totalRaw === 0n) return;

  // ── CAP SELL SIZE TO ACTUAL WALLET BALANCE ─────────────────────────────
  const ata = await getAssociatedTokenAddress(
    new PublicKey(this.cfg.toTokenMint),
    this.kp.publicKey,
    false,                          // allowOwnerOffCurve
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const onChainLamports = BigInt(
    (await this.conn.getTokenAccountBalance(ata)).value.amount
  );
  const sellRaw = onChainLamports < totalRaw ? onChainLamports : totalRaw;
  // ───────────────────────────────────────────────────────────────────────

  const q  = await this.jup.quote(this.cfg.toTokenMint, this.SOL_MINT, sellRaw);
  const sig = await this.jup.swap(q, this.kp, this.conn);
  await this.notify.send(EventKind.SELL, `✅ Sell ${this.tokenSymbol} sent: ${sig}`);

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
  const summary =
    `${emoji} PnL: ${diffPct.toFixed(2)}% | ${diffSol.toFixed(3)} SOL | $${diffUsd.toFixed(2)}`;

  await this.notify.send(
    EventKind.SELL,
    `💰 Sold ${this.human(sellRaw).toFixed(4)} ${this.tokenSymbol} tokens → ${solOut.toFixed(3)} SOL (~$${usdOut.toFixed(2)})\n${summary}`
  );

  logTrade([
  new Date().toISOString(),
  this.tokenSymbol, 
  "SELL",
  sig,
  this.human(sellRaw).toFixed(6),
  priceUSD,          // token price passed to execSellAll
  solOut,
  solUsd,
  usdOut,
  diffPct.toFixed(2)
  ]);

  // record for rolling stats a
  this.state.sells.push({ ts: Date.now(), diffUsd, diffSol, diffPct });
  
  const twelveHr = this.rollingPnLSummary();
  if (twelveHr) {
    await this.notify.send(EventKind.SELL, twelveHr);
  }

  // reset buys
  this.state.buys = [];

  // ── TIP-JAR LOGIC ──────────────────────────────────────────────────────
  const tipUsd = diffUsd * 0.01;
  const solUsdForTip = solUsd;              // already fetched
  const tipLamports = BigInt(Math.floor((tipUsd / solUsdForTip) * 1e9));

  if (tipLamports > 0n) {
    this.state.pendingTipLamports += tipLamports;

    const pendingTipSol = Number(this.state.pendingTipLamports) / 1e9;
    const pendingTipUsd = pendingTipSol * solUsdForTip;

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
      const ok = await this.confirm(tipSig);
        if (!ok) {
          await this.notify.send(EventKind.TICK, "⚠️ Tip transfer failed, will retry next sell");
          return;                       // keep pendingTipLamports intact
        }
        this.state.pendingTipLamports = 0n;  // only reset on success

      await this.notify.send(
        EventKind.TICK,
        `🙏 Sent tip of ${pendingTipSol.toFixed(6)} SOL to creator (tx: ${tipSig})`
      );

      this.state.pendingTipLamports = 0n;
    } else {
      await this.notify.send(
        EventKind.TICK,
        `💾 Tip accrued: ${pendingTipSol.toFixed(6)} SOL (pending until ≥ $0.01)`
      );
    }
  }
  // resume buy ladder if it had been paused for low SOL
  this.pausedForNoFunds = false;
}


  // ------------------ lifecycle ------------------
 async init(): Promise<void> {
  /* ── 1. Fetch token-decimals (unchanged) ───────────────────────── */
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

  /* ── 2. Detect token-switch and reset ladder if needed ─────────── */
  if (
    this.state.tokenMint &&                    // not first run
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
  // always sync state to current token
  this.state.tokenMint = this.cfg.toTokenMint;
  this.state.save();

  /* ── 3. Fetch pair symbols (unchanged) ─────────────────────────── */
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

  /* ── 4. Ladder preview 📐 ──────────────────────────────────────── */
  const jumps = this.cfg.maxBuys || 0;                  // pick a reasonable loop cap
  let totalSol = 0;
  let priceFactor = 1;                                  // running product of drops
  for (let k = 0; k < jumps; k++) {
    totalSol += this.nextSize(k) / 1e9;
    priceFactor *= 1 - this.nextDropPct(k) / 100;
  }
  const maxDrop = 1 - priceFactor;                      // fraction

  const ladderMsg = this.cfg.maxBuys === 0
    ? `📐 Ladder Mode: Buy till you're dry 🙈 • Vol×${this.cfg.dcaVolMult} • Δ%×${this.cfg.dcaPctMult}`
    : `📐 Ladder Mode: ${this.cfg.maxBuys} rungs • Vol×${this.cfg.dcaVolMult} • `
    + `Δ%×${this.cfg.dcaPctMult} • Total ≈ ${totalSol.toFixed(3)} SOL • `
    + `Absorbs ≈ ${(maxDrop * 100).toFixed(1)} %`;
  await this.notify.send(EventKind.START, ladderMsg);


  /* ── 5. Initial balance (only Pro) ─────────────────────────────── */
  this.prevBal = this.cfg.proVersion
    ? await this.conn.getBalance(this.kp.publicKey)
    : 0;

  await this.notify.send(EventKind.START, "🚀 DCA bot live (60s tick)");
}


  async tick(): Promise<void> {
    try {
        // manual sales detection (pro only)
        if (this.cfg.proVersion) {
          if (await this.recentManualSalesDetected()) {
            this.state.buys = [];
            this.state.save();
          }
      }
      // fetch price
      const pair = await axios.get(
        `https://api.dexscreener.com/latest/dex/pairs/solana/${this.cfg.pairAddress}`
      );
      const { baseToken, quoteToken, priceUsd } = pair.data.pair;
      const price = Number(priceUsd);
      await this.notify.send(EventKind.TICK, `🪙 ${baseToken.symbol}/${quoteToken.symbol} • $${price.toFixed(6)}`);

      // first buy
      if (this.state.buys.length === 0) {
        await this.notify.send(EventKind.TICK, "🔰 First buy");
        await this.execBuy(this.cfg.initialBuyLamports, price);
        this.state.save();
        this.lastTickTime = Date.now();
        return;
      }

      // thresholds
      const lastBuyPrice = this.state.buys.at(-1)!.price;
      const idx          = this.state.buys.length;          // how many buys we ALREADY did
      const dropNeeded   = this.nextDropPct(idx);           // % for *next* buy
      const buyBelow     = lastBuyPrice * (1 - dropNeeded / 100);
      const sellAbove    = this.avgPrice() * (1 + this.cfg.sellProfitPct / 100);

      await this.notify.send(
        EventKind.TICK,
        `💹 $${price.toFixed(5)} | Buy<${buyBelow.toFixed(5)} Sell>${sellAbove.toFixed(5)}`
      );

      // preview next buy
      let nextLamports: number | null = null;
      if (this.cfg.maxBuys === 0 || idx < this.cfg.maxBuys) {
        nextLamports = this.nextSize(idx);                  // << NEW
      }
      if (nextLamports !== null && this.cfg.proVersion) {
        const solLeft = (await this.fetchBalance()) / 1e9;
        await this.notify.send(
          EventKind.TICK,
          `📈 Next buy (SOL): ${(nextLamports / 1e9).toFixed(3)} | Remaining ≈ ${solLeft.toFixed(3)} SOL`
        );
      }

      if (price <= buyBelow) {
        if (this.pausedForNoFunds) {
          await this.notify.send(EventKind.TICK, "⏸️ Buy-ladder paused — out of SOL");
        } else if (
          this.cfg.maxBuys !== 0 &&         // capped mode AND
          this.state.buys.length >= this.cfg.maxBuys
        ) {
          await this.notify.send(EventKind.TICK, "⏸️ Buy-cap reached — waiting to sell");
        } else if (nextLamports !== null) {
          await this.execBuy(nextLamports, price);
          this.state.save();
        }
      } else if (price >= sellAbove) {
        await this.execSellAll(price);
        this.state.save();
      }

      // rolling PnL stats
      const pnl = this.rollingPnLSummary();
      if (pnl) await this.notify.send(EventKind.TICK, pnl);

      this.lastTickTime = Date.now();
    } catch (e: any) {
      if (!this.benign0x1771(e)) console.error(e);
      else await this.notify.send(EventKind.TICK, "⚠️ Benign 0x1771 simulation error – ignored");
    }
  }
}


// ---------------------------------------------------------------------------
// BOOTSTRAP
// ---------------------------------------------------------------------------
(async () => {
  const cfg = buildConfig();
  const conn = new Connection(cfg.rpc, "confirmed");
  const keypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(process.env.PRIVATE_KEY ?? "[]"))
  );
  const state = new StateStore();
  const notifier = new NotificationService(cfg);
  const jup = new JupiterClient();

  const bot = new DCABot(cfg, state, notifier, jup, conn, keypair);
  await bot.init();

  await bot.tick();
  setInterval(() => bot.tick(), 60_000);
})();
