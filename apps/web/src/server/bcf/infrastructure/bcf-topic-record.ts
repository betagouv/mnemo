import {
  bcfExchangeMetadataSchema,
  bcfViewpointPayloadSchema,
} from "@mnemo/contracts/bcf";
import { Prisma } from "@mnemo/database";
import type { StoredBcfTopic } from "../application/bcf-topic-repository";

export const bcfTopicInclude = {
  users: true,
  bcf_topic_components: {
    include: { assets: { select: { original_file_name: true } } },
    orderBy: { created_at: "asc" },
  },
  bcf_comments: {
    include: { users: true },
    orderBy: { created_at: "asc" },
  },
  bcf_viewpoints: {
    include: { users: true },
    orderBy: { created_at: "asc" },
  },
} satisfies Prisma.bcf_topicsInclude;
type BcfTopicRow = Prisma.bcf_topicsGetPayload<{
  include: typeof bcfTopicInclude;
}>;
export function toStoredBcfTopic(row: BcfTopicRow): StoredBcfTopic {
  return {
    id: row.id,
    exchangeMetadata: {
      ...(row.exchange_metadata
        ? bcfExchangeMetadataSchema.parse(row.exchange_metadata)
        : {}),
      header: [
        ...new Map(
          [
            ...(row.exchange_metadata
              ? (bcfExchangeMetadataSchema.parse(row.exchange_metadata)
                  .header ?? [])
              : []),
            ...row.bcf_topic_components.flatMap((component) =>
              component.assets
                ? [
                    {
                      filename: component.assets.original_file_name,
                      reference: undefined,
                    },
                  ]
                : [],
            ),
          ].map((file) => [
            file.reference ?? file.filename ?? JSON.stringify(file),
            file,
          ]),
        ).values(),
      ],
    },
    bcfGuid: row.bcf_guid,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    type: row.type,
    status: row.status,
    priority: row.priority,
    authorName: row.external_author ?? row.users.display_name,
    authorEmail: row.external_author ?? row.users.email,
    modifiedAuthor: row.modified_author,
    number: row.number,
    assignedTo: row.assigned_to,
    dueDate: row.due_date?.toISOString().slice(0, 10) ?? null,
    labels: row.labels,
    components: row.bcf_topic_components.map((component) => ({
      id: component.id,
      assetId: component.asset_id,
      globalId: component.global_id,
      expressId: component.express_id,
    })),
    comments: row.bcf_comments.map((comment) => ({
      id: comment.id,
      bcfGuid: comment.bcf_guid,
      authorName: comment.external_author ?? comment.users.display_name,
      authorEmail: comment.external_author ?? comment.users.email,
      comment: comment.comment,
      createdAt: comment.created_at.toISOString(),
      viewpointBcfGuid: comment.viewpoint_bcf_guid,
    })),
    viewpoints: row.bcf_viewpoints.map((viewpoint) => ({
      id: viewpoint.id,
      bcfGuid: viewpoint.bcf_guid,
      topicId: viewpoint.topic_id,
      data: bcfViewpointPayloadSchema.parse(viewpoint.data),
      targetDistance: viewpoint.target_distance,
      snapshotObjectKey: viewpoint.snapshot_object_key,
      snapshotMediaType: viewpoint.snapshot_media_type,
      snapshotExpectedSize:
        viewpoint.snapshot_expected_size === null
          ? null
          : Number(viewpoint.snapshot_expected_size),
      snapshotUploadedAt: viewpoint.snapshot_uploaded_at?.toISOString() ?? null,
      authorName: viewpoint.external_author ?? viewpoint.users.display_name,
      createdAt: viewpoint.created_at.toISOString(),
    })),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
