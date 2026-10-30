import type { Metadata } from "next";

import { ProjectAccessScreen } from "@/screens/project-access";

export const metadata: Metadata = { title: "Accès au dossier" };
export const dynamic = "force-dynamic";

export default async function ProjectAccessPage({
  params,
}: PageProps<"/projets/[projectId]/acces">) {
  const { projectId } = await params;
  return <ProjectAccessScreen projectId={projectId} />;
}
