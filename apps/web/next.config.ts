import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  reactStrictMode: true,
  experimental: {
    agentUpgrade: "security",
    // BCF visibility/selection lists travel as JSON; image bytes still upload directly to S3.
    serverActions: { bodySizeLimit: "8mb" },
  },
  transpilePackages: [
    "@codegouvfr/react-dsfr",
    "@mnemo/contracts",
    "@mnemo/database",
    "@mnemo/domain",
    "@mnemo/ifc-viewer-adapter",
    "@mnemo/point-cloud-viewer-adapter",
    "@mnemo/processing-worker",
    "@mnemo/storage",
  ],
  headers() {
    return [
      {
        source: "/projets/:projectId/viewer/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
        ],
      },
      {
        source: "/pointcloud/:path*",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
  webpack(config) {
    config.module.rules.push(
      {
        test: /\.wasm$/,
        type: "asset/resource",
      },
      {
        test: /\.woff2?$/,
        type: "asset/resource",
      },
    );

    return config;
  },
};

export default nextConfig;
