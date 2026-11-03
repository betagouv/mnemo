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
  bcfExchangeMetadataSchema,
  type BcfExchangeMetadata,
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
  assignedTo?: string | null;
  dueDate?: string | null;
  labels?: string[];
  modifiedAuthor?: string | null;
  header?: BCFTopic["header"];
  metadata?: BcfExchangeMetadata;
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

function collectComponentGlobalIds(viewpoints: BCFViewpoint[]) {
  const globalIds = new Set<string>();

  for (const viewpoint of viewpoints) {
    const componentGroups = [viewpoint.components?.selection];
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
    ...viewpoint,
    guid,
  });
  if (!data.success) {
    warnings.push(
      `Le point de vue ${viewpoint.guid} sans caméra valide a été ignoré.`,
    );
    return null;
  }

  if (viewpoint.bitmaps?.length)
    warnings.push(
      `La vue ${viewpoint.guid} contient des annotations bitmap non prises en charge. Elles ne seront pas réexportées.`,
    );
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
  if (
    topic.bimSnippet?.isExternal === false ||
    topic.documentReferences?.some(
      (reference) => reference.documentGuid || reference.isExternal === false,
    )
  )
    warnings.push(
      `La remarque « ${topic.title} » référence des pièces jointes embarquées non prises en charge. Leurs références sont conservées, leurs fichiers ne sont pas réexportés.`,
    );
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
    type: bcfTopicTypeSchema.parse(topic.topicType?.trim() || "Issue"),
    status: bcfTopicStatusSchema.parse(topic.topicStatus?.trim() || "Open"),
    priority: bcfPrioritySchema.parse(topic.priority?.trim() || "Normal"),
    authorName: topic.creationAuthor?.trim() || "Auteur BCF inconnu",
    assignedTo: topic.assignedTo ?? null,
    dueDate: topic.dueDate?.slice(0, 10) ?? null,
    labels: topic.labels ?? [],
    modifiedAuthor: topic.modifiedAuthor ?? null,
    header: topic.header,
    metadata: bcfExchangeMetadataSchema.parse(topic),
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
  const warnings: string[] = [];

  try {
    project = await readBCF(bytes, {
      maxArchiveBytes: limits.maxArchiveBytes,
      maxEntries: limits.maxEntries,
      maxExpandedBytes: limits.maxExpandedBytes,
      onWarning: (message) => {
        if (warnings.length < 500) warnings.push(message);
      },
    });
  } catch (error) {
    if (error instanceof Error && /exceeds cap|zip bomb/i.test(error.message)) {
      throw new BcfArchiveLimitError(error.message);
    }
    throw error;
  }

  assertCollectionLimits(project, limits);
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
    warnings: warnings.slice(0, 500),
  };
}

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
  return {
    ...viewpoint.data,
    guid: viewpoint.guid,

    snapshot: viewpoint.snapshot
      ? `data:${viewpoint.snapshot.mediaType};base64,`
      : undefined,
    snapshotData: viewpoint.snapshot?.bytes,
  };
}

function encodeTopic(topic: BcfArchiveExportTopic): BCFTopic {
  const viewpoints = topic.viewpoints.map(encodeViewpoint);
  const selected = new Set(
    viewpoints.flatMap(
      (view) =>
        view.components?.selection?.flatMap((component) =>
          component.ifcGuid ? [component.ifcGuid] : [],
        ) ?? [],
    ),
  );
  const additional = topic.componentGlobalIds.filter(
    (guid) => !selected.has(guid),
  );
  if (additional.length)
    viewpoints.push({
      guid: crypto.randomUUID(),
      components: { selection: additional.map((ifcGuid) => ({ ifcGuid })) },
    });
  return {
    ...topic.metadata,
    guid: topic.guid,
    title: topic.title,
    description: topic.description ?? undefined,
    topicType: topic.type,
    topicStatus: topic.status,
    priority: topic.priority,
    creationDate: topic.createdAt ?? undefined,
    creationAuthor: topic.authorName,
    modifiedDate: topic.updatedAt ?? undefined,
    modifiedAuthor: topic.modifiedAuthor ?? undefined,
    assignedTo: topic.assignedTo ?? undefined,
    dueDate: topic.dueDate ? `${topic.dueDate}T00:00:00Z` : undefined,
    labels: topic.labels,
    header: topic.header ?? topic.metadata?.header,
    comments: topic.comments.map(encodeComment),
    viewpoints,
  };
}

export async function encodeBcfArchive(input: BcfArchiveExportInput) {
  const topics = input.topics.map(encodeTopic);
  // Selection-only views are legal in 2.1, while 3.0 requires exactly one camera.
  // A missing aspect ratio must never be replaced with an invented value either.
  const needs21 = topics.some((topic) =>
    topic.viewpoints.some((view) => {
      const camera = view.perspectiveCamera ?? view.orthogonalCamera;
      return !camera || !camera.aspectRatio;
    }),
  );
  const project: BCFProject = {
    version: needs21 ? "2.1" : "3.0",
    projectId: input.projectId,
    name: input.projectName,
    topics: new Map(topics.map((topic) => [topic.guid, topic])),
  };
  const blob = await writeBCF(project);
  return new Uint8Array(await blob.arrayBuffer());
}
