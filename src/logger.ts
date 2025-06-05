// src/logger.ts
import { existsSync, appendFileSync } from "fs";

/**
 * logTrade() now dynamically chooses `<TOKEN_SYMBOL>_trade_log.csv`.
 * It also writes an extra `pnl_usd` header/column.
 */
export function logTrade(row: (string | number)[]) {
  // row[1] is token_symbol
  const symbol = String(row[1]);
  const fileName = `${symbol}_trade_log.csv`;

  if (!existsSync(fileName)) {
    appendFileSync(
      fileName,
      "timestamp,token_symbol,event,tx,tokens,token_price_usd,sol_delta,sol_price_usd,usd_delta,pnl_pct,pnl_usd\n"
    );
  }

  appendFileSync(
    fileName,
    row.map((v) => (typeof v === "string" ? `"${v}"` : v)).join(",") + "\n"
  );
}
