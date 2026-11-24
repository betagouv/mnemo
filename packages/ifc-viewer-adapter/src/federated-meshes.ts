import type { MeshData } from "@ifc-lite/geometry";
import type { FederationRegistry, Renderer } from "@ifc-lite/renderer";

/** One model's meshes in the shared scene, under their federated IDs. */
export class FederatedMeshes {
  readonly ids = new Set<number>();
  private offset: number | null = null;

  constructor(
    private readonly scene: {
      renderer: Renderer;
      federation: FederationRegistry;
    },
    private readonly assetId: string,
    readonly modelIndex: number,
  ) {}

  /** Reserve a range that no other model uses. */
  reserveIds(maxExpressId: number) {
    this.offset = this.scene.federation.registerModel(
      this.assetId,
      maxExpressId,
    );
  }

  add(meshes: readonly MeshData[]) {
    if (!meshes.length) return;
    this.scene.renderer.addMeshes(
      meshes.map((mesh) => this.federate(mesh)),
      true,
    );
    this.scene.renderer.requestRender();
  }

  expressIds() {
    const offset = this.reservedOffset();
    return [...this.ids].map((id) => id - offset);
  }

  discard() {
    if (this.ids.size)
      this.scene.renderer.getScene().removeMeshesForEntities(this.ids);
    if (this.offset !== null)
      this.scene.federation.unregisterModel(this.assetId);
  }

  private reservedOffset() {
    if (this.offset === null)
      throw new Error("La plage d’identifiants IFC n’est pas réservée.");
    return this.offset;
  }

  private federate(mesh: MeshData): MeshData {
    const offset = this.reservedOffset();
    const expressId = mesh.expressId + offset;
    this.ids.add(expressId);
    return {
      ...mesh,
      expressId,
      modelIndex: this.modelIndex,
      ...(mesh.geometryItemId !== undefined
        ? { geometryItemId: mesh.geometryItemId + offset }
        : {}),
      ...(mesh.entityIds
        ? { entityIds: mesh.entityIds.map((id) => id + offset) }
        : {}),
      ...(mesh.textureRef
        ? {
            textureRef: {
              ...mesh.textureRef,
              textureId: mesh.textureRef.textureId + offset,
            },
          }
        : {}),
    };
  }
}
