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
        label: "Plan de coupe actif",
        icon: "fr-icon-crop-line",
        panel: "cut-plane",
        group: "cuts",
      },
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
