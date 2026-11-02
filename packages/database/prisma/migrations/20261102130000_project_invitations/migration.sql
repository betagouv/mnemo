CREATE TABLE "project_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "base_role" "project_role" NOT NULL,
    "role_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invited_by" UUID NOT NULL,
    CONSTRAINT "project_invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_invitations_non_owner_role" CHECK ("base_role" <> 'owner'::"project_role")
);

CREATE UNIQUE INDEX "project_invitations_token_hash_key" ON "project_invitations"("token_hash");
CREATE UNIQUE INDEX "project_invitations_project_id_email_key" ON "project_invitations"("project_id", "email");
CREATE INDEX "project_invitations_expires_at_idx" ON "project_invitations"("expires_at");

ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
