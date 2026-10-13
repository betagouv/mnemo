import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { randomUUID, timingSafeEqual } from "node:crypto";

const port = Number(process.env.PORT ?? 8080);
const upstreamPort = Number(process.env.IFC_UPSTREAM_PORT ?? 8081);
const upstream = `http://127.0.0.1:${upstreamPort}`;
const token = process.env.IFC_SERVER_API_TOKEN;
const storageEndpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET;
const maximumBytes = Number(process.env.MAX_FILE_SIZE_MB ?? 1024) * 1024 * 1024;
let processorVersion = "unknown";

if (!token || !storageEndpoint || !bucket) {
  throw new Error(
    "IFC_SERVER_API_TOKEN, S3_ENDPOINT and S3_BUCKET are required",
  );
}

const allowedOrigin = new URL(storageEndpoint).origin;
const rust = spawn(
  process.env.IFC_SERVER_BINARY ?? "./node_modules/.bin/ifc-lite-server",
  [],
  { env: { ...process.env, PORT: String(upstreamPort) }, stdio: "inherit" },
);
rust.on("exit", (code) => {
  console.error("IFC-Lite Rust stopped", { code });
  process.exit(code ?? 1);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => rust.kill(signal));
}

function authorized(header) {
  const provided = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const expected = Buffer.from(token);
  const actual = Buffer.from(provided);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function respond(response, status, message) {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify({ error: message }));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 8192) throw new Error("Request is too large");
  }
  return JSON.parse(body);
}

export function validateSourceUrl(value) {
  const url = new URL(value);
  if (
    url.origin !== allowedOrigin ||
    !url.pathname.startsWith(`/${bucket}/projects/`) ||
    !url.searchParams.has("X-Amz-Signature") ||
    !url.searchParams.has("X-Amz-Credential") ||
    !["http:", "https:"].includes(url.protocol)
  ) {
    throw new Error("Invalid signed object URL");
  }
  return url;
}

async function proxy(upstreamResponse, response, extraHeaders = {}) {
  response.writeHead(upstreamResponse.status, {
    "content-type":
      upstreamResponse.headers.get("content-type") ??
      "application/octet-stream",
    "cache-control": "no-store",
    "x-accel-buffering": "no",
    ...extraHeaders,
  });
  if (upstreamResponse.body) {
    await new Promise((resolve, reject) => {
      Readable.fromWeb(upstreamResponse.body)
        .on("error", reject)
        .pipe(response)
        .on("finish", resolve)
        .on("error", reject);
    });
  } else {
    response.end();
  }
}

async function handle(request, response) {
  const path = new URL(request.url ?? "/", `http://localhost:${port}`).pathname;
  if (path === "/api/v1/health" && request.method === "GET") {
    const health = await fetch(`${upstream}/api/v1/health`);
    return proxy(health, response);
  }
  if (!authorized(request.headers.authorization)) {
    return respond(response, 401, "Unauthorized");
  }

  if (path === "/api/v1/parse/from-s3" && request.method === "POST") {
    if (processorVersion === "unknown") {
      const health = await fetch(`${upstream}/api/v1/health`);
      if (health.ok)
        processorVersion = String((await health.json()).version ?? "unknown");
    }
    const input = await readJson(request);
    const url = validateSourceUrl(input.sourceUrl);
    const source = await fetch(url, { redirect: "error" });
    if (!source.ok || !source.body) {
      return respond(response, 502, "The IFC source is unavailable");
    }
    const size = Number(source.headers.get("content-length"));
    if (!Number.isFinite(size) || size <= 0 || size > maximumBytes) {
      await source.body.cancel();
      return respond(response, 413, "The IFC source exceeds the server limit");
    }
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
      "x-mnemo-max-express-id": "200000000",
      "x-mnemo-processor-version": processorVersion,
    });
    response.write(": connected\n\n");
    let atEventBoundary = true;
    const heartbeat = setInterval(() => {
      if (atEventBoundary && !response.destroyed)
        response.write(": processing\n\n");
    }, 15_000);
    response.once("close", () => clearInterval(heartbeat));
    const boundary = `mnemo-${randomUUID()}`;
    const prefix = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="model.ifc"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    );
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
    let maxExpressId = 0;
    let scanTail = "";
    async function* multipart() {
      yield prefix;
      for await (const chunk of Readable.fromWeb(source.body)) {
        const text = scanTail + chunk.toString("latin1");
        for (const match of text.matchAll(/#([0-9]{1,10})\s*=/g)) {
          maxExpressId = Math.max(maxExpressId, Number(match[1]));
          if (maxExpressId > 200_000_000)
            throw new Error(
              "IFC Express ID exceeds the supported federation range",
            );
        }
        scanTail = text.slice(-32);
        yield chunk;
      }
      yield suffix;
    }
    try {
      const result = await fetch(
        `${upstream}/api/v1/parse/parquet-stream?data_model_entities=rooted&parquet_layout=shared-shapes`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": `multipart/form-data; boundary=${boundary}`,
            "content-length": String(prefix.length + size + suffix.length),
          },
          body: Readable.toWeb(Readable.from(multipart())),
          duplex: "half",
        },
      );
      if (!result.ok || !result.body) {
        response.write(
          `data: ${JSON.stringify({ type: "error", message: "Le traitement IFC a échoué." })}\n\n`,
        );
        response.end();
        return;
      }
      await new Promise((resolve, reject) => {
        let tail = "";
        Readable.fromWeb(result.body)
          .on("data", (chunk) => {
            tail = (
              tail +
              chunk.subarray(Math.max(0, chunk.length - 4)).toString("latin1")
            ).slice(-4);
            atEventBoundary = tail.endsWith("\n\n");
          })
          .on("error", reject)
          .pipe(response)
          .on("finish", resolve)
          .on("error", reject);
      });
    } finally {
      clearInterval(heartbeat);
    }
    return;
  }

  const match = path.match(
    /^\/api\/v1\/parse\/data-model\/([a-zA-Z0-9_-]{1,200})$/,
  );
  if (match && request.method === "GET") {
    return proxy(
      await fetch(`${upstream}${path}?data_model_entities=rooted`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      response,
    );
  }
  respond(response, 404, "Not found");
}

createServer((request, response) => {
  void handle(request, response).catch((error) => {
    console.error(
      "IFC gateway request failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    if (!response.headersSent)
      respond(response, 502, "IFC service unavailable");
    else if (response.writableEnded || response.destroyed) return;
    else if (response.getHeader("content-type") === "text/event-stream") {
      response.write(
        `data: ${JSON.stringify({ type: "error", message: "Le traitement IFC a échoué." })}\n\n`,
      );
      response.end();
    } else response.destroy(error);
  });
}).listen(port, "0.0.0.0");
