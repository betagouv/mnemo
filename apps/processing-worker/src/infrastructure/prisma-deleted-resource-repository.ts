import type { MnemoPrismaDatabase } from "@mnemo/database";

import type {
  DeletedResourceRepository,
  DeletionJobType,
} from "../application/delete-resource";

export class PrismaDeletedResourceRepository implements DeletedResourceRepository {
  constructor(private readonly database: MnemoPrismaDatabase) {}

  async deleteRecord(type: DeletionJobType, resourceId: string) {
    if (type === "delete_bcf_upload") {
      await this.database.bcf_snapshot_uploads.deleteMany({
        where: { id: resourceId },
      });
      return;
    }
    if (type === "delete_asset") {
      await this.database.assets.deleteMany({ where: { id: resourceId } });
      return;
    }
    await this.database.projects.deleteMany({ where: { id: resourceId } });
  }
}
