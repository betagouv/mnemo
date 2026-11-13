import { createEmptyViewerSnapshot } from "@mnemo/ifc-viewer-adapter";
import { describe, expect, it } from "vitest";

import { getActiveViewerModifiers } from "./viewer-active-modifiers";

describe("getActiveViewerModifiers", () => {
  it("shows nothing when no scene modifier is active", () => {
    const snapshot = createEmptyViewerSnapshot();
    expect(getActiveViewerModifiers(snapshot)).toEqual([]);
  });

  it("routes an active plane back to its editing panel", () => {
    const snapshot = createEmptyViewerSnapshot();
    snapshot.section.active = "plane";
    expect(getActiveViewerModifiers(snapshot)).toEqual([
      {
        id: "section",
        reset: "section",
        label: "Plan de coupe actif",
        icon: "fr-icon-crop-line",
        panel: "cut-plane",
        group: "cuts",
      },
    ]);
  });

  it("keeps filters and layer visibility visible independently", () => {
    const snapshot = createEmptyViewerSnapshot();
    snapshot.visual = {
      ...snapshot.visual,
      mode: "isolate",
      label: "R+2",
      matchCount: 25,
    };
    expect(getActiveViewerModifiers(snapshot, true)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "visual",
          label: "R+2",
          reset: "visual",
        }),
        expect.objectContaining({
          id: "visibility",
          panel: "layers",
          reset: "visibility",
        }),
      ]),
    );
  });
  it("removes temporary selection isolation through its dedicated command", () => {
    const snapshot = createEmptyViewerSnapshot();
    snapshot.selectionIsolationActive = true;
    snapshot.visual = {
      ...snapshot.visual,
      mode: "isolate",
      label: "Sélection isolée",
      matchCount: 1,
    };
    expect(getActiveViewerModifiers(snapshot)).toEqual([
      expect.objectContaining({
        id: "selection-isolation",
        reset: "selection-isolation",
        label: "Sélection isolée",
      }),
    ]);
  });

  it("routes a clipping box to its own controls, but hides the indicator when disabled", () => {
    const snapshot = createEmptyViewerSnapshot();
    snapshot.section.active = "box";
    expect(getActiveViewerModifiers(snapshot)[0]).toMatchObject({
      label: "Boîte de coupe active",
      panel: "cut-box",
    });
    snapshot.section.active = null;
    expect(getActiveViewerModifiers(snapshot)).toEqual([]);
  });
});
