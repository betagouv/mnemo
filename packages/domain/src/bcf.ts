export const bcfTopicStatuses = [
  "open",
  "in_progress",
  "resolved",
  "closed",
] as const;

export type BcfTopicStatus = (typeof bcfTopicStatuses)[number];

export const bcfTopicTypes = ["issue", "request", "comment"] as const;
export type BcfTopicType = (typeof bcfTopicTypes)[number];

export const bcfPriorities = ["low", "normal", "high", "critical"] as const;
export type BcfPriority = (typeof bcfPriorities)[number];
