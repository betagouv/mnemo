import type { RemotePointCloudLauncher } from "../application/process-remote-point-cloud-asset";
import {
  remotePointCloudJobSchema,
  type RemotePointCloudJob,
} from "../application/remote-point-cloud-protocol";

export type ScalingoLauncherOptions = {
  apiToken: string;
  app: string;
  region: "osc-fr1" | "osc-secnum-fr1";
  size: string;
  fetchImpl?: typeof fetch;
};

export class ScalingoPointCloudJobLauncher implements RemotePointCloudLauncher {
  private readonly fetchImpl: typeof fetch;
  private bearerToken?: { value: string; validUntil: number };

  constructor(private readonly options: ScalingoLauncherOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async launch(job: RemotePointCloudJob) {
    const validated = remotePointCloudJobSchema.parse(job);
    const bearerToken = await this.getBearerToken();
    const response = await this.fetchImpl(
      `https://api.${this.options.region}.scalingo.com/v1/apps/${encodeURIComponent(this.options.app)}/run`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          command: "node dist/process-point-cloud-once.js",
          env: { MNEMO_POINT_CLOUD_JOB: JSON.stringify(validated) },
          size: this.options.size,
          detached: true,
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) {
      if (response.status === 401) this.bearerToken = undefined;
      // API error bodies may contain account details; never log them or tokens.
      throw new Error(
        `Scalingo one-off launch failed (HTTP ${response.status})`,
      );
    }
  }

  private async getBearerToken() {
    if (this.bearerToken && this.bearerToken.validUntil > Date.now()) {
      return this.bearerToken.value;
    }
    const tokenResponse = await this.fetchImpl(
      "https://auth.scalingo.com/v1/tokens/exchange",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`:${this.options.apiToken}`).toString("base64")}`,
        },
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!tokenResponse.ok) {
      throw new Error(
        `Scalingo token exchange failed (HTTP ${tokenResponse.status})`,
      );
    }
    const tokenBody: unknown = await tokenResponse.json();
    if (
      !tokenBody ||
      typeof tokenBody !== "object" ||
      !("token" in tokenBody) ||
      typeof tokenBody.token !== "string" ||
      !tokenBody.token
    ) {
      throw new Error("Scalingo token exchange returned no bearer token");
    }

    this.bearerToken = {
      value: tokenBody.token,
      validUntil: Date.now() + 50 * 60_000,
    };
    return this.bearerToken.value;
  }
}
