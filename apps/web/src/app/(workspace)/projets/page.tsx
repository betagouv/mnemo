import type { Metadata } from "next";

import { ProjectsScreen } from "@/screens/projects";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Projets",
};

export default function ProjectsPage() {
  return <ProjectsScreen />;
}
