/** Untwine 1.5.1 generic/progress.hpp uses little-endian native uint32 frames on Scalingo. */
export class UntwineProgress {
  private pending = Buffer.alloc(0);
  private percent = 0;

  constructor(
    private readonly report: (percent: number) => void,
    private readonly onError?: (message: string) => void,
  ) {}

  write(chunk: Buffer) {
    this.pending = Buffer.concat([this.pending, chunk]);
    while (this.pending.length >= 8) {
      const kind = this.pending.readInt32LE(0);
      const headerSize = kind === 1000 ? 12 : 8;
      if (kind !== 1000 && kind !== 1001) {
        this.pending = Buffer.alloc(0);
        return;
      }
      if (this.pending.length < headerSize) return;
      const messageSize = this.pending.readUInt32LE(headerSize - 4);
      if (messageSize > 65_536) {
        this.pending = Buffer.alloc(0);
        return;
      }
      if (this.pending.length < headerSize + messageSize) return;
      if (kind === 1000) {
        this.percent = Math.max(
          this.percent,
          Math.min(100, this.pending.readUInt32LE(4)),
        );
        this.report(this.percent);
      }
      if (kind === 1001)
        this.onError?.(
          this.pending
            .subarray(headerSize, headerSize + messageSize)
            .toString("utf8"),
        );
      this.pending = this.pending.subarray(headerSize + messageSize);
    }
  }
}
