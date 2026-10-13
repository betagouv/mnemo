import { fileURLToPath } from "node:url";

import { remotePointCloudJobSchema } from "./application/remote-point-cloud-protocol";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function getPointCloudOneOffConfig() {
  return {
    job: remotePointCloudJobSchema.parse(
      JSON.parse(required("MNEMO_POINT_CLOUD_JOB")) as unknown,
    ),
    storage: {
      endpoint: required("S3_ENDPOINT"),
      region: required("S3_REGION"),
      bucket: required("S3_BUCKET"),
      accessKeyId: required("S3_ACCESS_KEY"),
      secretAccessKey: required("S3_SECRET_KEY"),
    },
    potreeConverterPath:
      process.env.POTREE_CONVERTER_PATH?.trim() ||
      fileURLToPath(new URL("../bin/potree-converter", import.meta.url)),
    pdalPath:
      process.env.PDAL_PATH?.trim() ||
      fileURLToPath(new URL("../bin/pdal", import.meta.url)),
  };
}
