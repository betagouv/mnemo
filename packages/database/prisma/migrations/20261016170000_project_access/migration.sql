CREATE TABLE "project_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_role_permissions" (
    "role_id" UUID NOT NULL,
    "permission" VARCHAR(80) NOT NULL,
    CONSTRAINT "project_role_permissions_pkey" PRIMARY KEY ("role_id","permission")
);

CREATE TABLE "project_member_roles" (
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    CONSTRAINT "project_member_roles_pkey" PRIMARY KEY ("project_id","user_id","role_id")
);

CREATE TABLE "project_member_permissions" (
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission" VARCHAR(80) NOT NULL,
    CONSTRAINT "project_member_permissions_pkey" PRIMARY KEY ("project_id","user_id","permission")
);

CREATE UNIQUE INDEX "project_roles_project_id_name_key" ON "project_roles"("project_id", "name");
CREATE UNIQUE INDEX "project_roles_project_id_id_key" ON "project_roles"("project_id", "id");

ALTER TABLE "project_roles" ADD CONSTRAINT "project_roles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_role_permissions" ADD CONSTRAINT "project_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "project_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_member_roles" ADD CONSTRAINT "project_member_roles_project_id_user_id_fkey" FOREIGN KEY ("project_id", "user_id") REFERENCES "project_members"("project_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_member_roles" ADD CONSTRAINT "project_member_roles_project_id_role_id_fkey" FOREIGN KEY ("project_id", "role_id") REFERENCES "project_roles"("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_member_permissions" ADD CONSTRAINT "project_member_permissions_project_id_user_id_fkey" FOREIGN KEY ("project_id", "user_id") REFERENCES "project_members"("project_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
