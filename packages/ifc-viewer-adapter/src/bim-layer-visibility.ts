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
  readonly hiddenIds = new Set<number>();
  private readonly fadedIds = new Set<number>();
  ghostExceptIds: Set<number> | null = null;

  constructor(
    private readonly models: ReadonlyMap<string, BimLayerModel>,
    private readonly federation: FederationRegistry,
  ) {}

  get(assetId: string, target: BimLayerTarget): LayerVisibility {
    const direct = this.modes.get(this.key(assetId, target));
    if (direct) return direct;
    if (target.kind === "model") return "show";
    if (target.kind === "element") {
      const model = this.models.get(assetId);
      if (!model) return "show";
      return this.get(assetId, {
        kind: "class",
        storeyId:
          model.store.spatialHierarchy?.elementToStorey.get(target.expressId) ??
          null,
        ifcClass:
          model.store.entities.getTypeName(target.expressId) || "IfcEntity",
      });
    }
    if (target.kind === "class") {
      return this.get(
        assetId,
        target.storeyId === null
          ? { kind: "unassigned" }
          : { kind: "storey", expressId: target.storeyId },
      );
    }
    return this.get(assetId, { kind: "model" });
  }

  exceptionCount(assetId: string, target: BimLayerTarget): number {
    if (target.kind === "element") return 0;
    const model = this.models.get(assetId);
    if (!model) return 0;
    const parentMode = this.get(assetId, target);
    let count = 0;
    for (const [key, mode] of this.modes) {
      if (mode === parentMode || !key.startsWith(`${assetId}:`)) continue;
      if (target.kind === "model") {
        count++;
        continue;
      }
      const classPrefix = `${assetId}:class:${target.kind === "unassigned" ? "none" : target.kind === "storey" ? target.expressId : (target.storeyId ?? "none")}:`;
      if (target.kind !== "class" && key.startsWith(classPrefix)) {
        count++;
        continue;
      }
      const elementPrefix = `${assetId}:element:`;
      if (!key.startsWith(elementPrefix)) continue;
      const expressId = Number(key.slice(elementPrefix.length));
      const storeyId =
        model.store.spatialHierarchy?.elementToStorey.get(expressId) ?? null;
      if (target.kind === "storey" && storeyId === target.expressId) count++;
      if (target.kind === "unassigned" && storeyId === null) count++;
      if (
        target.kind === "class" &&
        storeyId === target.storeyId &&
        model.store.entities.getTypeName(expressId) === target.ifcClass
      )
        count++;
    }
    return count;
  }

  set(assetId: string, target: BimLayerTarget, mode: LayerVisibility) {
    if (!this.models.has(assetId)) return false;
    this.modes.set(this.key(assetId, target), mode);
    this.rebuild();
    return true;
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
    this.hiddenIds.clear();
    this.fadedIds.clear();
    for (const [assetId, model] of this.models) {
      const modelMode = this.get(assetId, { kind: "model" });
      const apply = (ids: Iterable<number>, mode: LayerVisibility) => {
        for (const id of ids) {
          this.hiddenIds.delete(id);
          this.fadedIds.delete(id);
          if (mode === "hide") this.hiddenIds.add(id);
          if (mode === "opacity") this.fadedIds.add(id);
        }
      };
      apply(model.meshIds, modelMode);
      for (const storey of model.bimIndex.catalog.storeys) {
        const mode = this.modes.get(
          this.key(assetId, { kind: "storey", expressId: storey.expressId }),
        );
        if (!mode) continue;
        apply(
          model.bimIndex
            .findIds({ storeyId: storey.expressId })
            .map((id) => this.federation.toGlobalId(assetId, id)),
          mode,
        );
      }
      const unassignedMode = this.modes.get(`${assetId}:unassigned`);
      if (unassignedMode) {
        for (const id of model.meshIds) {
          const local = this.federation.fromGlobalId(id);
          if (
            local?.modelId === assetId &&
            !model.store.spatialHierarchy?.elementToStorey.has(local.expressId)
          ) {
            apply([id], unassignedMode);
          }
        }
      }
      const classPrefix = `${assetId}:class:`;
      for (const [key, mode] of this.modes) {
        if (!key.startsWith(classPrefix)) continue;
        const remainder = key.slice(classPrefix.length);
        const separator = remainder.indexOf(":");
        const storeyId =
          remainder.slice(0, separator) === "none"
            ? null
            : Number(remainder.slice(0, separator));
        const ifcClass = remainder.slice(separator + 1);
        const count =
          model.bimIndex
            .classesForStorey(storeyId)
            .find((entry) => entry.ifcClass === ifcClass)?.elementCount ?? 0;
        apply(
          model.bimIndex
            .queryPage(storeyId, 0, count, ifcClass)
            .map((element) =>
              this.federation.toGlobalId(assetId, element.expressId),
            ),
          mode,
        );
      }
      for (const [key, mode] of this.modes) {
        const prefix = `${assetId}:element:`;
        if (!key.startsWith(prefix)) continue;
        const id = Number(key.slice(prefix.length));
        const globalId = this.federation.toGlobalId(assetId, id);
        if (model.meshIds.has(globalId)) apply([globalId], mode);
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
