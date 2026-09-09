import { assets, projects, type MnemoDatabase } from "@mnemo/database";
import { eq } from "drizzle-orm";

import type {
  DeletedResourceRepository,
  DeletionJobType,
} from "../application/delete-resource";

export class DrizzleDeletedResourceRepository implements DeletedResourceRepository {
  constructor(private readonly database: MnemoDatabase) {}

  async deleteRecord(type: DeletionJobType, resourceId: string) {
    if (type === "delete_asset") {
      await this.database.delete(assets).where(eq(assets.id, resourceId));
      return;
    }

    await this.database.delete(projects).where(eq(projects.id, resourceId));
  }
}
