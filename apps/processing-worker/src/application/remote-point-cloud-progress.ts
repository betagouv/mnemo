import type { ReportProcessingProgress } from "./process-point-cloud-asset";
import type { ProcessingProgress } from "@mnemo/contracts/assets";
import type { ObjectStorage } from "@mnemo/storage";
import {
  remotePointCloudProgressKey,
  type RemotePointCloudJob,
} from "./remote-point-cloud-protocol";

/** Coalesce frequent converter events into one bounded, serial S3 write stream. */
export class RemotePointCloudProgress {
  private sequence = 0;
  private latest: ProcessingProgress | null = null;
  private dirty = false;
  private inFlight: Promise<void> | null = null;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly storage: ObjectStorage,
    private readonly job: RemotePointCloudJob,
  ) {
    this.timer = setInterval(() => {
      void this.flush();
    }, 3_000);
    this.timer.unref();
  }

  report: ReportProcessingProgress = (progress) => {
    if (
      this.latest?.phase === progress.phase &&
      this.latest.percent === progress.percent
    )
      return;
    this.sequence += 1;
    this.latest = { ...progress, updatedAt: new Date().toISOString() };
    this.dirty = true;
  };

  async flush() {
    if (this.inFlight) await this.inFlight;
    if (!this.dirty || !this.latest) return;
    this.dirty = false;
    const snapshot = {
      jobId: this.job.jobId,
      attempt: this.job.attempt,
      sequence: this.sequence,
      progress: this.latest,
    };
    this.inFlight = this.storage
      .writeObject({
        objectKey: remotePointCloudProgressKey(this.job),
        contentType: "application/json",
        body: new TextEncoder().encode(JSON.stringify(snapshot)),
      })
      .catch(() => {
        // Progress delivery is best effort and must not invalidate a conversion.
        this.dirty = true;
        console.warn("Point-cloud progress publication failed", {
          jobId: this.job.jobId,
        });
      })
      .finally(() => {
        this.inFlight = null;
      });
    await this.inFlight;
  }

  async close() {
    clearInterval(this.timer);
    await this.flush();
  }
}
