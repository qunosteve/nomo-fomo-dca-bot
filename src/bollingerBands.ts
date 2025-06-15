// src/bollingerBands.ts
export class BollingerBands {
  private prices: number[] = [];
  constructor(
    private readonly period: number = 20,
    private readonly stdDevMultiplier: number = 1.5
  ) {}

  addPrice(price: number): void {
    this.prices.push(price);
    if (this.prices.length > this.period) {
      this.prices.shift(); // keep only last N prices
    }
  }

  get mean(): number | null {
    if (this.prices.length < this.period) return null;
    const sum = this.prices.reduce((a, b) => a + b, 0);
    return sum / this.prices.length;
  }

  get stdDev(): number | null {
    const mean = this.mean;
    if (mean === null) return null;
    const variance = this.prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / this.prices.length;
    return Math.sqrt(variance);
  }

  get upperBand(): number | null {
    const mean = this.mean;
    const std = this.stdDev;
    if (mean === null || std === null) return null;
    return mean + this.stdDevMultiplier * std;
  }

  get lowerBand(): number | null {
    const mean = this.mean;
    const std = this.stdDev;
    if (mean === null || std === null) return null;
    return mean - this.stdDevMultiplier * std;
  }
}
