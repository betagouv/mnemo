import type { CreateBcfTopicInput } from "@mnemo/contracts/bcf";

export type BcfObject = CreateBcfTopicInput["components"][number] & {
  name: string;
};
