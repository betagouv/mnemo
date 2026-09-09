import type { Metadata } from "next";

import { ProjectDetailScreen } from "@/screens/project-detail";

export const metadata: Metadata = {
  title: "Espace projet",
};

export default async function ProjectDetailPage({
  params,
}: PageProps<"/projets/[projectId]">) {
  const { projectId } = await params;
  return <ProjectDetailScreen projectId={projectId} />;
}
