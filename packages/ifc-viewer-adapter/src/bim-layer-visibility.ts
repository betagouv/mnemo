import type { IfcDataStore } from "@ifc-lite/parser";
import type { FederationRegistry } from "@ifc-lite/renderer";

import type { IfcBimIndex } from "./bim-index";
import type { BimLayerTarget, LayerVisibility } from "./viewer-types";

type BimLayerModel = {
  store: IfcDataStore;
  bimIndex: IfcBimIndex;
  meshIds: Set<number>;
};

/** Resolves inherited model/storey/class/element visibility for rendering. */
export class BimLayerVisibility {
  private readonly modes = new Map<string, LayerVisibility>();
  private readonly summaries = new Map<string, Map<LayerVisibility, number>>();
  readonly hiddenIds = new Set<number>();
  private readonly fadedIds = new Set<number>();
  ghostExceptIds: Set<number> | null = null;

  constructor(
    private readonly models: ReadonlyMap<string, BimLayerModel>,
    private readonly federation: FederationRegistry,
  ) {}

  get(assetId: string, target: BimLayerTarget): LayerVisibility {
    const summary = this.summaries.get(this.key(assetId, target));
    if (summary?.size === 1) return summary.keys().next().value!;
    return this.inheritedMode(assetId, target);
  }

  private inheritedMode(
    assetId: string,
    target: BimLayerTarget,
  ): LayerVisibility {
    const direct = this.modes.get(this.key(assetId, target));
    if (direct) return direct;
    if (target.kind === "model") return "show";
    if (target.kind === "element") {
      const model = this.models.get(assetId);
      if (!model) return "show";
      return this.inheritedMode(assetId, {
        kind: "class",
        storeyId:
          model.store.spatialHierarchy?.elementToStorey.get(target.expressId) ??
          null,
        ifcClass:
          model.store.entities.getTypeName(target.expressId) || "IfcEntity",
      });
    }
    if (target.kind === "class") {
      return this.inheritedMode(
        assetId,
        target.storeyId === null
          ? { kind: "unassigned" }
          : { kind: "storey", expressId: target.storeyId },
      );
    }
    return this.inheritedMode(assetId, { kind: "model" });
  }

  exceptionCount(assetId: string, target: BimLayerTarget): number {
    const summary = this.summaries.get(this.key(assetId, target));
    if (!summary || summary.size < 2) return 0;
    const counts = [...summary.values()];
    return counts.reduce((sum, count) => sum + count, 0) - Math.max(...counts);
  }

  set(assetId: string, target: BimLayerTarget, mode: LayerVisibility) {
    const model = this.models.get(assetId);
    if (!model) return false;
    // A group action replaces all overrides below it, including collapsed nodes.
    for (const key of this.modes.keys()) {
      if (this.isDescendant(assetId, target, key, model))
        this.modes.delete(key);
    }
    this.modes.set(this.key(assetId, target), mode);
    this.rebuild();
    return true;
  }

  private isDescendant(
    assetId: string,
    target: BimLayerTarget,
    key: string,
    model: BimLayerModel,
  ) {
    if (!key.startsWith(`${assetId}:`) || target.kind === "element")
      return false;
    if (target.kind === "model") return true;
    const storeyId =
      target.kind === "storey"
        ? target.expressId
        : target.kind === "unassigned"
          ? null
          : target.storeyId;
    if (
      target.kind !== "class" &&
      key.startsWith(`${assetId}:class:${storeyId ?? "none"}:`)
    )
      return true;
    const elementPrefix = `${assetId}:element:`;
    if (!key.startsWith(elementPrefix)) return false;
    const expressId = Number(key.slice(elementPrefix.length));
    return (
      (model.store.spatialHierarchy?.elementToStorey.get(expressId) ?? null) ===
        storeyId &&
      (target.kind !== "class" ||
        (model.store.entities.getTypeName(expressId) || "IfcEntity") ===
          target.ifcClass)
    );
  }

  private key(assetId: string, target: BimLayerTarget) {
    return target.kind === "model"
      ? assetId
      : target.kind === "unassigned"
        ? `${assetId}:unassigned`
        : target.kind === "class"
          ? `${assetId}:class:${target.storeyId ?? "none"}:${target.ifcClass}`
          : `${assetId}:${target.kind}:${target.expressId}`;
  }

  rebuild() {
    this.summaries.clear();
    this.hiddenIds.clear();
    this.fadedIds.clear();
    // Rendering and parent summaries must use the same hierarchy membership.
    for (const [assetId, model] of this.models) {
      for (const id of model.meshIds) {
        const local = this.federation.fromGlobalId(id);
        if (!local) continue;
        const storeyId =
          model.store.spatialHierarchy?.elementToStorey.get(local.expressId) ??
          null;
        const ifcClass =
          model.store.entities.getTypeName(local.expressId) || "IfcEntity";
        const mode = this.inheritedMode(assetId, {
          kind: "element",
          expressId: local.expressId,
        });
        if (mode === "hide") this.hiddenIds.add(id);
        if (mode === "opacity") this.fadedIds.add(id);
        const targets: BimLayerTarget[] = [
          { kind: "model" },
          storeyId === null
            ? { kind: "unassigned" }
            : { kind: "storey", expressId: storeyId },
          { kind: "class", storeyId, ifcClass },
        ];
        for (const target of targets) {
          const key = this.key(assetId, target);
          let counts = this.summaries.get(key);
          if (!counts) {
            counts = new Map();
            this.summaries.set(key, counts);
          }
          counts.set(mode, (counts.get(mode) ?? 0) + 1);
        }
      }
    }
    if (this.fadedIds.size) {
      this.ghostExceptIds = new Set<number>();
      for (const model of this.models.values()) {
        for (const id of model.meshIds) {
          if (!this.fadedIds.has(id) && !this.hiddenIds.has(id)) {
            this.ghostExceptIds.add(id);
          }
        }
      }
    } else {
      this.ghostExceptIds = null;
    }
  }
}
