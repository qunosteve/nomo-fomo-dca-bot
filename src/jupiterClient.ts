// src/jupiterClient.ts
import axios from "axios";
import { Keypair, VersionedTransaction, Connection } from "@solana/web3.js";

export interface QuoteOpts {
   /** how many bps you’re willing to lose in execution (e.g. 50 = 0.5%) */
  slippageBps?: number;
}


export class JupiterClient {
  private readonly BASE = "https://lite-api.jup.ag/swap/v1";

  async quote(
    inputMint: string,
    outputMint: string,
    amount: bigint | number,
    opts: QuoteOpts = {}
  ) {
    const params = {
      inputMint,
      outputMint,
      amount: amount.toString(),
      slippageBps: opts.slippageBps ?? 50,
    };
    // Lite API returns the quote object directly
    const { data } = await axios.get(`${this.BASE}/quote`, { params });
    return data as any;
  }
    async swap(q: any, kp: Keypair, connection: Connection) {
    const body = {
      quoteResponse: q,
      userPublicKey: kp.publicKey.toString(),
      wrapUnwrapSOL: true,
      // ← tell Lite API to auto-tune your slippage on‐chain
      dynamicSlippage: true,
    };
    const { data } = await axios.post(`${this.BASE}/swap`, body);
    const vtx = VersionedTransaction.deserialize(
      Buffer.from(data.swapTransaction, "base64")
    );
    vtx.sign([kp]);
    return connection.sendRawTransaction(vtx.serialize());
  }

  // swap stays the same…
}