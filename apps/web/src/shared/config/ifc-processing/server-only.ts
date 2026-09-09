import "server-only";

const defaultBrowserProcessingLimit = 25 * 1_024 * 1_024;

export type IfcProcessingSelection =
  { engine: "browser" } | { engine: "rust"; serverBaseUrl: string };

function readBrowserProcessingLimit() {
  const rawValue = process.env.IFC_BROWSER_PROCESSING_MAX_BYTES;
  if (!rawValue) return defaultBrowserProcessingLimit;

  const value = Number(rawValue);
  return Number.isFinite(value) && value >= 0
    ? value
    : defaultBrowserProcessingLimit;
}

export function selectIfcProcessing(sizeBytes: number): IfcProcessingSelection {
  const serverBaseUrl = process.env.IFC_LITE_PUBLIC_URL?.trim();

  if (serverBaseUrl && sizeBytes >= readBrowserProcessingLimit()) {
    return { engine: "rust", serverBaseUrl };
  }

  return { engine: "browser" };
}
