/** Fixed clock retains backlog. The host explicitly resets it on visibility changes. */
export class FixedClock {
  private accumulator = 0;
  constructor(
    readonly step = 1 / 60,
    readonly maxSteps = 12,
  ) {
    if (!(step > 0) || !Number.isFinite(step) || !Number.isInteger(maxSteps) || maxSteps < 1)
      throw new Error("Invalid fixed clock settings");
  }
  advance(elapsed: number, tick: (dt: number) => void): number {
    if (!Number.isFinite(elapsed) || elapsed < 0) return this.alpha;
    this.accumulator += elapsed;
    let steps = 0;
    while (this.accumulator + 1e-10 >= this.step && steps++ < this.maxSteps) {
      tick(this.step);
      this.accumulator = Math.max(0, this.accumulator - this.step);
    }
    return this.alpha;
  }
  get alpha(): number {
    return Math.min(1, this.accumulator / this.step);
  }
  reset(): void {
    this.accumulator = 0;
  }
}
