import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  reactStrictMode: true,
  transpilePackages: [
    "@codegouvfr/react-dsfr",
    "@mnemo/contracts",
    "@mnemo/database",
    "@mnemo/domain",
    "@mnemo/storage",
  ],
};

export default nextConfig;
