"use client";

import "client-only";

import { z } from "zod";

export async function fetchJson<Schema extends z.ZodType>(
  url: string,
  schema: Schema,
): Promise<z.output<Schema>> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return schema.parse(await response.json());
}
