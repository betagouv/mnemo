CREATE TYPE "user_role" AS ENUM ('user', 'admin');
ALTER TABLE "users"
  ADD COLUMN "roles" "user_role"[] NOT NULL DEFAULT ARRAY['user']::"user_role"[],
  ADD COLUMN "approved_at" TIMESTAMPTZ(6),
  ADD COLUMN "approved_by" UUID;
-- Preserve access for accounts created before administrator approval existed.
UPDATE "users" SET "approved_at" = CURRENT_TIMESTAMP;
ALTER TABLE "users" ADD CONSTRAINT "users_approved_by_fkey"
  FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_roles_check" CHECK (
  'user'::"user_role" = ANY("roles")
  AND cardinality("roles") = CASE WHEN 'admin'::"user_role" = ANY("roles") THEN 2 ELSE 1 END
);
CREATE INDEX "users_approved_at_created_at_idx" ON "users"("approved_at", "created_at" DESC);
