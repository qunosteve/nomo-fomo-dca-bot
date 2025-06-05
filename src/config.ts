// src/config.ts
import dotenv from "dotenv";
dotenv.config();

export type Lamports = number;
export type TokensRaw = bigint;

export enum EventKind {
  START = "START",
  TICK = "TICK",
  BALANCE = "BALANCE",
  BUY = "BUY",
  SELL = "SELL",
}

export interface BuyEntry {
  price: number;
  lamports: Lamports;
  tokensRaw: TokensRaw;
}

export interface SellStat {
  ts: number;    // epoch ms
  diffUsd: number;
  diffSol: number;
  diffPct: number;
}

export interface BotConfig {
  rpc: string;
  pairAddress: string;
  toTokenMint: string;
  initialBuyLamports: Lamports;
  maxBuys: number;
  dcaVolMult: number;
  dcaPctMult: number;
  buyDropPct: number;
  sellProfitPct: number;
  tickIntervalMs: number;

  // channels & filters (comma-separated list of EventKind or "ALL")
  consoleEvents: string;
  discordEvents?: string;
  telegramEvents?: string;
  discordWebhook?: string;
  telegramBot?: string;
  telegramChat?: string;
  proVersion: boolean;
}

export function buildConfig(): BotConfig {
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
    maxBuys: Number(process.env.MAX_BUYS ?? 0),    // 0 means “unlimited”
    dcaVolMult: Number(process.env.DCA_VOL_MULT ?? 2),
    dcaPctMult: Number(process.env.DCA_PCT_MULT ?? 1),
    sellProfitPct: Number(process.env.SELL_PROFIT_PCT ?? 2.5),
    consoleEvents: process.env.CONSOLE_EVENTS ?? "ALL",
    tickIntervalMs: Number(process.env.TICK_INTERVAL_MS ?? 60000),
    discordEvents: process.env.DISCORD_EVENTS,
    telegramEvents: process.env.TELEGRAM_EVENTS,
    discordWebhook: process.env.DISCORD_WEBHOOK,
    telegramBot: process.env.TELEGRAM_BOT_TOKEN,
    telegramChat: process.env.TELEGRAM_CHAT_ID,
    proVersion: process.env.VERBOSE_VERSION === "1",
  };
}
