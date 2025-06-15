// index.ts (in project root)
import { Connection, Keypair } from "@solana/web3.js";
import { buildConfig } from "./src/config";
import { StateStore } from "./src/stateStore";
import { NotificationService } from "./src/notificationService";
import { JupiterClient } from "./src/jupiterClient";
import { DCABot } from "./src/dcaBot";
import { BollingerBands } from "./src/bollingerBands";

(async () => {
  const cfg = buildConfig();
  const conn = new Connection(cfg.rpc, "confirmed");
  const keypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(process.env.PRIVATE_KEY ?? "[]"))
  );
  const state = new StateStore();
  const notifier = new NotificationService(cfg);
  const jup = new JupiterClient();
  const bollinger = new BollingerBands(cfg.bollingerPeriod, cfg.bollingerStdDev);


  const bot = new DCABot(cfg, state, notifier, jup, conn, keypair, bollinger);
  await bot.init();
  await bot.tick();
  setInterval(() => bot.tick(), cfg.tickIntervalMs);
})();
