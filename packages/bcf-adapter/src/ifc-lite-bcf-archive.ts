import {
  readBCF,
  writeBCF,
  type BCFComment,
  type BCFProject,
  type BCFTopic,
  type BCFViewpoint,
} from "@ifc-lite/bcf";
import {
  bcfPrioritySchema,
  bcfTopicStatusSchema,
  bcfTopicTypeSchema,
  bcfViewpointPayloadSchema,
  type BcfPriority,
  type BcfTopicStatus,
  type BcfTopicType,
  type BcfViewpointPayload,
} from "@mnemo/contracts/bcf";
import { z } from "zod";

const uuidSchema = z.uuid();

type ResolvedBcfArchiveImportLimits = {
  maxArchiveBytes: number;
  maxEntries: number;
  maxExpandedBytes: number;
  maxTopics: number;
  maxComments: number;
  maxViewpoints: number;
  maxSnapshotBytes: number;
  maxSnapshotBytesTotal: number;
};

const defaultLimits: ResolvedBcfArchiveImportLimits = {
  maxArchiveBytes: 50 * 1024 * 1024,
  maxEntries: 10_000,
  maxExpandedBytes: 250 * 1024 * 1024,
  maxTopics: 2_000,
  maxComments: 25_000,
  maxViewpoints: 5_000,
  maxSnapshotBytes: 10 * 1024 * 1024,
  maxSnapshotBytesTotal: 100 * 1024 * 1024,
};

export type BcfArchiveImportLimits = Partial<typeof defaultLimits>;

export type BcfArchiveComment = {
  guid: string;
  authorName: string;
  comment: string;
  createdAt: string | null;
  viewpointGuid: string | null;
};

export type BcfArchiveViewpoint = {
  guid: string;
  data: BcfViewpointPayload;
  targetDistance: number;
  snapshot: {
    bytes: Uint8Array;
    mediaType: "image/png" | "image/jpeg";
  } | null;
};

export type BcfArchiveTopic = {
  guid: string;
  title: string;
  description: string | null;
  type: BcfTopicType;
  status: BcfTopicStatus;
  priority: BcfPriority;
  authorName: string;
  createdAt: string | null;
  updatedAt: string | null;
  componentGlobalIds: string[];
  comments: BcfArchiveComment[];
  viewpoints: BcfArchiveViewpoint[];
};

export type BcfArchiveDecodeResult = {
  version: "2.1" | "3.0";
  projectName: string | null;
  topics: BcfArchiveTopic[];
  warnings: string[];
};

export type BcfArchiveExportTopic = BcfArchiveTopic & {
  comments: BcfArchiveComment[];
  viewpoints: BcfArchiveViewpoint[];
};

export type BcfArchiveExportInput = {
  projectId: string;
  projectName: string;
  topics: BcfArchiveExportTopic[];
};

export class BcfArchiveLimitError extends Error {}

function validOrGeneratedGuid(
  value: string,
  warnings: string[],
  label: string,
) {
  if (uuidSchema.safeParse(value).success) return value;
  const generated = crypto.randomUUID();
  warnings.push(`${label} avait un GUID invalide et a reçu ${generated}.`);
  return generated;
}

function normalizedToken(value: string | undefined) {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_") ?? ""
  );
}

function topicStatus(value: string | undefined): BcfTopicStatus {
  const normalized = normalizedToken(value);
  const aliases: Record<string, BcfTopicStatus> = {
    active: "open",
    closed: "closed",
    completed: "resolved",
    in_progress: "in_progress",
    open: "open",
    reopened: "open",
    resolved: "resolved",
  };
  return bcfTopicStatusSchema.catch("open").parse(aliases[normalized]);
}

function topicType(value: string | undefined): BcfTopicType {
  const normalized = normalizedToken(value);
  const aliases: Record<string, BcfTopicType> = {
    comment: "comment",
    error: "issue",
    info: "comment",
    information: "comment",
    issue: "issue",
    request: "request",
    warning: "issue",
  };
  return bcfTopicTypeSchema.catch("issue").parse(aliases[normalized]);
}

function topicPriority(value: string | undefined): BcfPriority {
  const normalized = normalizedToken(value);
  const aliases: Record<string, BcfPriority> = {
    critical: "critical",
    high: "high",
    low: "low",
    medium: "normal",
    normal: "normal",
    urgent: "critical",
  };
  return bcfPrioritySchema.catch("normal").parse(aliases[normalized]);
}

function collectComponentGlobalIds(viewpoints: BCFViewpoint[]) {
  const globalIds = new Set<string>();

  for (const viewpoint of viewpoints) {
    const componentGroups = [
      viewpoint.components?.selection,
      viewpoint.components?.visibility?.exceptions,
      ...(viewpoint.components?.coloring?.map((group) => group.components) ??
        []),
    ];
    for (const components of componentGroups) {
      for (const component of components ?? []) {
        if (component.ifcGuid) globalIds.add(component.ifcGuid);
      }
    }
  }

  return [...globalIds];
}

function decodeViewpoint(
  viewpoint: BCFViewpoint,
  warnings: string[],
  maxSnapshotBytes: number,
): BcfArchiveViewpoint | null {
  const guid = validOrGeneratedGuid(
    viewpoint.guid,
    warnings,
    "Un point de vue",
  );
  const data = bcfViewpointPayloadSchema.safeParse({
    guid,
    perspectiveCamera: viewpoint.perspectiveCamera,
    orthogonalCamera: viewpoint.orthogonalCamera,
    components: viewpoint.components,
  });
  if (!data.success) {
    warnings.push(
      `Le point de vue ${viewpoint.guid} sans caméra valide a été ignoré.`,
    );
    return null;
  }

  const snapshotBytes = viewpoint.snapshotData;
  let snapshot: BcfArchiveViewpoint["snapshot"] = null;
  if (snapshotBytes && snapshotBytes.byteLength <= maxSnapshotBytes) {
    snapshot = {
      bytes: snapshotBytes,
      mediaType: viewpoint.snapshot?.startsWith("data:image/jpeg")
        ? "image/jpeg"
        : "image/png",
    };
  } else if (snapshotBytes) {
    warnings.push(
      `La capture du point de vue ${viewpoint.guid} dépasse la limite et a été ignorée.`,
    );
  }

  return { guid, data: data.data, targetDistance: 10, snapshot };
}

function decodeComment(
  comment: BCFComment,
  viewpointGuidMap: Map<string, string>,
  warnings: string[],
): BcfArchiveComment {
  return {
    guid: validOrGeneratedGuid(comment.guid, warnings, "Un commentaire"),
    authorName: comment.author?.trim() || "Auteur BCF inconnu",
    comment: comment.comment,
    createdAt: comment.date ?? null,
    viewpointGuid: comment.viewpointGuid
      ? (viewpointGuidMap.get(comment.viewpointGuid) ?? null)
      : null,
  };
}

function decodeTopic(
  topic: BCFTopic,
  limits: ResolvedBcfArchiveImportLimits,
  warnings: string[],
) {
  const decodedViewpoints = topic.viewpoints.map((source) => ({
    sourceGuid: source.guid,
    viewpoint: decodeViewpoint(source, warnings, limits.maxSnapshotBytes),
  }));
  const viewpoints = decodedViewpoints.flatMap(({ viewpoint }) =>
    viewpoint ? [viewpoint] : [],
  );
  const viewpointGuidMap = new Map(
    decodedViewpoints.flatMap(({ sourceGuid, viewpoint }) =>
      viewpoint ? [[sourceGuid, viewpoint.guid] as const] : [],
    ),
  );

  return {
    guid: validOrGeneratedGuid(topic.guid, warnings, "Une remarque"),
    title: topic.title.trim() || "Remarque BCF sans titre",
    description: topic.description?.trim() || null,
    type: topicType(topic.topicType),
    status: topicStatus(topic.topicStatus),
    priority: topicPriority(topic.priority),
    authorName: topic.creationAuthor?.trim() || "Auteur BCF inconnu",
    createdAt: topic.creationDate ?? null,
    updatedAt: topic.modifiedDate ?? null,
    componentGlobalIds: collectComponentGlobalIds(topic.viewpoints),
    comments: topic.comments.map((comment) =>
      decodeComment(comment, viewpointGuidMap, warnings),
    ),
    viewpoints,
  } satisfies BcfArchiveTopic;
}

function assertCollectionLimits(
  project: BCFProject,
  limits: ResolvedBcfArchiveImportLimits,
) {
  const topics = [...project.topics.values()];
  const commentCount = topics.reduce(
    (total, topic) => total + topic.comments.length,
    0,
  );
  const viewpointCount = topics.reduce(
    (total, topic) => total + topic.viewpoints.length,
    0,
  );

  if (topics.length > limits.maxTopics) {
    throw new BcfArchiveLimitError(
      `L’archive contient ${topics.length} remarques, au-delà de la limite de ${limits.maxTopics}.`,
    );
  }
  if (commentCount > limits.maxComments) {
    throw new BcfArchiveLimitError(
      `L’archive contient ${commentCount} commentaires, au-delà de la limite de ${limits.maxComments}.`,
    );
  }
  if (viewpointCount > limits.maxViewpoints) {
    throw new BcfArchiveLimitError(
      `L’archive contient ${viewpointCount} points de vue, au-delà de la limite de ${limits.maxViewpoints}.`,
    );
  }
}

export async function decodeBcfArchive(
  bytes: Uint8Array,
  overrides: BcfArchiveImportLimits = {},
): Promise<BcfArchiveDecodeResult> {
  const limits = { ...defaultLimits, ...overrides };
  let project: BCFProject;

  try {
    project = await readBCF(bytes, {
      maxArchiveBytes: limits.maxArchiveBytes,
      maxEntries: limits.maxEntries,
      maxExpandedBytes: limits.maxExpandedBytes,
    });
  } catch (error) {
    if (error instanceof Error && /exceeds cap|zip bomb/i.test(error.message)) {
      throw new BcfArchiveLimitError(error.message);
    }
    throw error;
  }

  assertCollectionLimits(project, limits);
  const warnings: string[] = [];
  const topics = [...project.topics.values()].map((topic) =>
    decodeTopic(topic, limits, warnings),
  );
  const snapshotBytes = topics.reduce(
    (total, topic) =>
      total +
      topic.viewpoints.reduce(
        (viewpointTotal, viewpoint) =>
          viewpointTotal + (viewpoint.snapshot?.bytes.byteLength ?? 0),
        0,
      ),
    0,
  );
  if (snapshotBytes > limits.maxSnapshotBytesTotal) {
    throw new BcfArchiveLimitError(
      `Les captures occupent ${snapshotBytes} octets, au-delà de la limite de ${limits.maxSnapshotBytesTotal}.`,
    );
  }

  return {
    version: project.version,
    projectName: project.name?.trim() || null,
    topics,
    warnings,
  };
}

const statusToBcf: Record<BcfTopicStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const typeToBcf: Record<BcfTopicType, string> = {
  issue: "Issue",
  request: "Request",
  comment: "Comment",
};

const priorityToBcf: Record<BcfPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  critical: "Critical",
};

function encodeComment(comment: BcfArchiveComment): BCFComment {
  return {
    guid: comment.guid,
    author: comment.authorName,
    comment: comment.comment,
    date: comment.createdAt ?? undefined,
    viewpointGuid: comment.viewpointGuid ?? undefined,
  };
}

function encodeViewpoint(viewpoint: BcfArchiveViewpoint): BCFViewpoint {
  const perspectiveCamera = viewpoint.data.perspectiveCamera
    ? {
        ...viewpoint.data.perspectiveCamera,
        aspectRatio: viewpoint.data.perspectiveCamera.aspectRatio ?? 1,
      }
    : undefined;
  const orthogonalCamera = viewpoint.data.orthogonalCamera
    ? {
        ...viewpoint.data.orthogonalCamera,
        aspectRatio: viewpoint.data.orthogonalCamera.aspectRatio ?? 1,
      }
    : undefined;
  return {
    ...viewpoint.data,
    guid: viewpoint.guid,
    perspectiveCamera,
    orthogonalCamera,
    snapshot: viewpoint.snapshot
      ? `data:${viewpoint.snapshot.mediaType};base64,`
      : undefined,
    snapshotData: viewpoint.snapshot?.bytes,
  };
}

function encodeTopic(topic: BcfArchiveExportTopic): BCFTopic {
  const viewpoints = topic.viewpoints.map(encodeViewpoint);
  const firstViewpoint = viewpoints[0];
  if (firstViewpoint && topic.componentGlobalIds.length) {
    const selection = new Map(
      (firstViewpoint.components?.selection ?? []).flatMap((component) =>
        component.ifcGuid ? [[component.ifcGuid, component] as const] : [],
      ),
    );
    for (const ifcGuid of topic.componentGlobalIds) {
      selection.set(ifcGuid, { ifcGuid });
    }
    firstViewpoint.components = {
      ...firstViewpoint.components,
      selection: [...selection.values()],
    };
  }

  return {
    guid: topic.guid,
    title: topic.title,
    description: topic.description ?? undefined,
    topicType: typeToBcf[topic.type],
    topicStatus: statusToBcf[topic.status],
    priority: priorityToBcf[topic.priority],
    creationDate: topic.createdAt ?? undefined,
    creationAuthor: topic.authorName,
    modifiedDate: topic.updatedAt ?? undefined,
    modifiedAuthor: topic.authorName,
    comments: topic.comments.map(encodeComment),
    viewpoints,
  };
}

export async function encodeBcfArchive(input: BcfArchiveExportInput) {
  const project: BCFProject = {
    version: "3.0",
    projectId: input.projectId,
    name: input.projectName,
    topics: new Map(
      input.topics.map((topic) => [topic.guid, encodeTopic(topic)]),
    ),
  };
  const blob = await writeBCF(project);
  return new Uint8Array(await blob.arrayBuffer());
}
