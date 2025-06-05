// src/notificationService.ts
import { EventKind, BotConfig } from "./config";

export class NotificationService {
  private filters: Record<"console" | "discord" | "telegram", Set<string>>;

  constructor(private cfg: BotConfig) {
    const parse = (v?: string) =>
      new Set((v ?? "").split(/[, ]+/).filter(Boolean).map((x) => x.toUpperCase()));

    this.filters = {
      console: parse(cfg.consoleEvents ?? "ALL"),
      discord: parse(cfg.discordEvents ?? ""),
      telegram: parse(cfg.telegramEvents ?? ""),
    };

    // if console‐filter is empty, treat as ALL
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
