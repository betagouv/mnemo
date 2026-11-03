import type { BCFComponent } from "@ifc-lite/bcf";
export type BcfSceneComponent = {
  assetId: string;
  expressId: number;
  globalId: string;
};
/** Resolve GUIDs across the federation without choosing an arbitrary duplicate. */
export function indexBcfComponents(
  components: BcfSceneComponent[],
  toRenderId: (assetId: string, expressId: number) => number,
) {
  const byGuid = new Map<string, BcfSceneComponent[]>();
  const byToolId = new Map<string, BcfSceneComponent>();
  const byRenderId = new Map<number, BcfSceneComponent>();
  for (const component of components) {
    const list = byGuid.get(component.globalId) ?? [];
    list.push(component);
    byGuid.set(component.globalId, list);
    byToolId.set(`${component.assetId}:${component.expressId}`, component);
    byRenderId.set(
      toRenderId(component.assetId, component.expressId),
      component,
    );
  }
  const reference = (component: BcfSceneComponent): BCFComponent => ({
    ifcGuid: component.globalId,
    originatingSystem: "Mnemo",
    authoringToolId: `${component.assetId}:${component.expressId}`,
  });
  const encode = (ids: Iterable<number>) =>
    [...ids].flatMap((id) => {
      const entry = byRenderId.get(id);
      return entry ? [reference(entry)] : [];
    });
  const resolve = (references: BCFComponent[]) => {
    const ids: number[] = [];
    const unresolved: string[] = [];
    for (const ref of references) {
      const known =
        ref.originatingSystem === "Mnemo" && ref.authoringToolId
          ? byToolId.get(ref.authoringToolId)
          : undefined;
      const candidates = ref.ifcGuid ? (byGuid.get(ref.ifcGuid) ?? []) : [];
      const entry =
        known && (!ref.ifcGuid || known.globalId === ref.ifcGuid)
          ? known
          : candidates.length === 1
            ? candidates[0]
            : undefined;
      if (entry) ids.push(toRenderId(entry.assetId, entry.expressId));
      else
        unresolved.push(
          ref.ifcGuid ?? ref.authoringToolId ?? "Objet sans identifiant",
        );
    }
    return { ids: [...new Set(ids)], unresolved: [...new Set(unresolved)] };
  };
  return { encode, reference, resolve };
}
