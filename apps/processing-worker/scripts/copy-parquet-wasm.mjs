import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(
  import.meta.resolve("parquet-wasm/node/parquet_wasm_bg.wasm"),
);
const destination = new URL("../dist/parquet_wasm_bg.wasm", import.meta.url);

await mkdir(new URL("../dist", import.meta.url), { recursive: true });
await copyFile(source, destination);
