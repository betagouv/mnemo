import { z } from "zod";

export const systemInfoSchema = z.object({
  service: z.literal("mnemo-web"),
  apiVersion: z.literal("v1"),
  status: z.literal("ok"),
  requestId: z.uuid(),
  timestamp: z.iso.datetime(),
});

export type SystemInfo = z.infer<typeof systemInfoSchema>;
