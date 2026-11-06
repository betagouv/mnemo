import type { Ref } from "react";
import type {
  BcfTopic,
  BcfTopicSummary,
  BcfMarkerTopic,
  CreateBcfTopicInput,
} from "@mnemo/contracts/bcf";
import type { CapturedBcfViewpoint } from "@mnemo/ifc-viewer-adapter";
import type { BcfPermissions } from "./bcf-permissions";
import type { BcfObject } from "./bcf-object";

export type BcfWorkspaceProps = {
  projectId: string;
  initialTopics: BcfTopicSummary[];
  permissions: BcfPermissions;
  selection: BcfObject | null;
  queryObjects: () => BcfObject[];
  previewObjects: (objects: CreateBcfTopicInput["components"]) => void;
  capture: (
    objects?: CreateBcfTopicInput["components"],
  ) => Promise<CapturedBcfViewpoint>;
  canCapture: boolean;
  applyViewpoint: (view: BcfTopic["viewpoints"][number]) => string[];
  focusObject: (component: BcfTopic["components"][number]) => boolean;
  onTopicsChange: (count: number) => void;
  onActiveTopicChange: (id: string | null) => void;
  onMarkersChange: (topics: BcfMarkerTopic[]) => void;
  ref?: Ref<{ open: (id: string) => Promise<void> }>;
};
