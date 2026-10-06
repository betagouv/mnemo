import type { Metadata } from "next";

import { ProjectViewerScreen } from "@/screens/project-viewer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Visionneuse du projet",
};

export default async function ProjectViewerPage({
  params,
}: PageProps<"/projets/[projectId]/viewer">) {
  const { projectId } = await params;
  return <ProjectViewerScreen projectId={projectId} />;
}
