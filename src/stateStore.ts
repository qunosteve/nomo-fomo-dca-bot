// src/stateStore.ts
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  statSync,
} from "fs";
import { BuyEntry, SellStat } from "./config";

export class StateStore {
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
      this.tokenMint = obj.tokenMint ?? "";
      this.buys = obj.buys ?? [];
      this.sells = obj.sells ?? [];
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
          tokenMint: this.tokenMint,
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
