// src/jupiterClient.ts
import axios from "axios";
import { Keypair, VersionedTransaction, Connection } from "@solana/web3.js";

export class JupiterClient {
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
