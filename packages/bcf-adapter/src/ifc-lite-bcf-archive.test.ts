import {
  createBCFProject,
  createBCFTopic,
  createViewpoint,
  writeBCF,
} from "@ifc-lite/bcf";
import { describe, expect, it } from "vitest";

import {
  BcfArchiveLimitError,
  decodeBcfArchive,
  encodeBcfArchive,
} from "./ifc-lite-bcf-archive";

const projectId = "d14ccec4-b8c9-437e-89af-0690c9c9682b";
const topicGuid = "a805b627-40b3-45c1-9d13-91042c67f025";
const viewpointGuid = "9f313504-b442-4df1-97d5-c6451f5d8c80";

describe("IFC-Lite BCF archive adapter", () => {
  it("round-trips Mnemo topics, comments, viewpoints and snapshots", async () => {
    const bytes = await encodeBcfArchive({
      projectId,
      projectName: "Coordination",
      topics: [
        {
          guid: topicGuid,
          title: "Porte à vérifier",
          description: "Contrôler le dégagement",
          type: "issue",
          status: "in_progress",
          priority: "high",
          authorName: "architecte@example.fr",
          createdAt: "2026-09-09T10:00:00.000Z",
          updatedAt: "2026-09-09T11:00:00.000Z",
          componentGlobalIds: ["0YvctA6Hn0pgmBdv0cPwH6"],
          comments: [
            {
              guid: "69dc0daf-a573-483b-bde2-32d4ac20f704",
              authorName: "controle@example.fr",
              comment: "À reprendre",
              createdAt: "2026-09-09T10:30:00.000Z",
              viewpointGuid,
            },
          ],
          viewpoints: [
            {
              guid: viewpointGuid,
              data: {
                guid: viewpointGuid,
                perspectiveCamera: {
                  cameraViewPoint: { x: 1, y: 2, z: 3 },
                  cameraDirection: { x: 0, y: 1, z: 0 },
                  cameraUpVector: { x: 0, y: 0, z: 1 },
                  fieldOfView: 50,
                  aspectRatio: 16 / 9,
                },
                components: {
                  selection: [{ ifcGuid: "0YvctA6Hn0pgmBdv0cPwH6" }],
                },
              },
              targetDistance: 15,
              snapshot: {
                bytes: new Uint8Array([137, 80, 78, 71]),
                mediaType: "image/png",
              },
            },
          ],
        },
      ],
    });

    const decoded = await decodeBcfArchive(bytes);

    expect(decoded).toMatchObject({
      version: "3.0",
      projectName: "Coordination",
      topics: [
        {
          guid: topicGuid,
          title: "Porte à vérifier",
          status: "in_progress",
          priority: "high",
          comments: [{ viewpointGuid }],
          viewpoints: [{ guid: viewpointGuid }],
        },
      ],
    });
    expect(decoded.topics[0]?.viewpoints[0]?.snapshot?.bytes).toEqual(
      new Uint8Array([137, 80, 78, 71]),
    );
  });

  it("preserves foreign vocabulary without linking context-only objects", async () => {
    const project = createBCFProject({ name: "Import", version: "3.0" });
    const topic = createBCFTopic({
      title: "Collision",
      author: "coordination@example.fr",
      topicType: "Warning",
      topicStatus: "Active",
      priority: "Urgent",
    });
    topic.guid = topicGuid;
    const viewpoint = createViewpoint({
      camera: {
        position: { x: 10, y: 5, z: 3 },
        target: { x: 0, y: 0, z: 0 },
        up: { x: 0, y: 1, z: 0 },
        fov: Math.PI / 3,
        aspectRatio: 16 / 9,
      },
      visibleGuids: ["0YvctA6Hn0pgmBdv0cPwH6"],
    });
    viewpoint.guid = viewpointGuid;
    topic.viewpoints.push(viewpoint);
    project.topics.set(topic.guid, topic);

    const blob = await writeBCF(project);
    const decoded = await decodeBcfArchive(
      new Uint8Array(await blob.arrayBuffer()),
    );

    expect(decoded.topics[0]).toMatchObject({
      type: "Warning",
      status: "Active",
      priority: "Urgent",
      componentGlobalIds: [],
    });
  });

  it("rejects archives that exceed application collection limits", async () => {
    const bytes = await encodeBcfArchive({
      projectId,
      projectName: "Coordination",
      topics: [],
    });

    await expect(
      decodeBcfArchive(bytes, { maxTopics: -1 }),
    ).rejects.toBeInstanceOf(BcfArchiveLimitError);
  });
});

describe("loss-aware BCF exchange", () => {
  it("preserves 2.1 camera semantics, clipping planes, assignment and headers", async () => {
    const project = createBCFProject({ name: "Coordination", version: "2.1" });
    const topic = createBCFTopic({
      title: "Contrôle",
      author: "author@example.fr",
      topicType: "Custom type",
      topicStatus: "À contrôler",
      priority: "P1",
    });
    topic.assignedTo = "external@example.fr";
    topic.dueDate = "2026-12-15T00:00:00Z";
    topic.labels = ["Sécurité"];
    topic.header = [
      { filename: "architecture.ifc", reference: "source-model" },
    ];
    topic.stage = "Conception";
    const view = createViewpoint({
      camera: {
        position: { x: 5, y: 6, z: 7 },
        target: { x: 0, y: 0, z: 0 },
        up: { x: 0, y: 1, z: 0 },
        fov: Math.PI / 3,
      },
      selectedGuids: ["0YvctA6Hn0pgmBdv0cPwH6"],
    });
    view.clippingPlanes = [
      { location: { x: 1, y: 2, z: 3 }, direction: { x: 0, y: 0, z: 1 } },
    ];
    topic.viewpoints = [view];
    project.topics.set(topic.guid, topic);
    const archive = await decodeBcfArchive(
      new Uint8Array(await (await writeBCF(project)).arrayBuffer()),
    );
    const output = await decodeBcfArchive(
      await encodeBcfArchive({
        projectId,
        projectName: "Coordination",
        topics: archive.topics,
      }),
    );
    expect(output.version).toBe("2.1");
    expect(output.topics[0]).toMatchObject({
      type: "Custom type",
      status: "À contrôler",
      priority: "P1",
      assignedTo: "external@example.fr",
      dueDate: "2026-12-15",
      labels: ["Sécurité"],
      metadata: {
        stage: "Conception",
        header: [{ filename: "architecture.ifc" }],
      },
      viewpoints: [{ data: { clippingPlanes: view.clippingPlanes } }],
    });
    expect(
      output.topics[0]?.viewpoints[0]?.data.perspectiveCamera?.aspectRatio,
    ).toBeUndefined();
  });
  it("exports subject objects without altering existing viewpoint selections", async () => {
    const output = await decodeBcfArchive(
      await encodeBcfArchive({
        projectId,
        projectName: "Coordination",
        topics: [
          {
            guid: topicGuid,
            title: "Remarque",
            description: null,
            type: "Issue",
            status: "Open",
            priority: "Normal",
            authorName: "author@example.fr",
            createdAt: "2026-11-03T10:00:00Z",
            updatedAt: null,
            componentGlobalIds: ["0YvctA6Hn0pgmBdv0cPwH6"],
            comments: [],
            viewpoints: [],
          },
        ],
      }),
    );
    expect(output.topics[0]?.componentGlobalIds).toEqual([
      "0YvctA6Hn0pgmBdv0cPwH6",
    ]);
    expect(
      output.topics[0]?.viewpoints[0]?.data.perspectiveCamera,
    ).toBeUndefined();
  });
});
