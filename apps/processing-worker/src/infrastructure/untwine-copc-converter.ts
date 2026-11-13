import { UntwineProgress } from "./untwine-progress";
import { spawn } from "node:child_process";

export interface CopcConverter {
  convert(input: {
    sourcePath: string;
    outputPath: string;
    tempDirectory: string;
    onProgress?: (percent: number) => void;
  }): Promise<void>;
}

/** Untwine tiles to disk instead of retaining the complete octree in RAM. */
export class UntwineCopcConverter implements CopcConverter {
  constructor(private readonly executablePath: string) {
    if (!executablePath.startsWith("/")) {
      throw new Error("Untwine executable path must be absolute");
    }
  }

  async convert(input: {
    sourcePath: string;
    outputPath: string;
    tempDirectory: string;
    onProgress?: (percent: number) => void;
  }) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        this.executablePath,
        [
          `--files=${input.sourcePath}`,
          `--output_dir=${input.outputPath}`,
          `--temp_dir=${input.tempDirectory}`,
          "--progress_fd=3",
        ],
        { stdio: ["ignore", "pipe", "pipe", "pipe"] },
      );
      let diagnostics = "";
      const capture = (chunk: Buffer | string) => {
        diagnostics = `${diagnostics}${chunk.toString()}`.slice(-4_096);
      };
      const progress = new UntwineProgress(
        (percent) => input.onProgress?.(percent),
        capture,
      );
      const progressStream = child.stdio[3];
      if (progressStream && "on" in progressStream)
        progressStream.on("data", (chunk: Buffer) => progress.write(chunk));
      child.stdout?.on("data", capture);
      child.stderr?.on("data", capture);
      child.once("error", reject);
      child.once("close", (code, signal) => {
        if (code === 0) resolve();
        else
          reject(
            new Error(
              `Untwine COPC conversion failed (${signal ?? code}): ${diagnostics.trim()}`,
            ),
          );
      });
    });
  }
}
