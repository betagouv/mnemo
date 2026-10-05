import type { Metadata } from "next";

import { IfcViewerScreen } from "@/screens/ifc-viewer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Visionneuse IFC",
};

export default async function IfcViewerPage({
  params,
}: PageProps<"/projets/[projectId]/viewer/[assetId]">) {
  const { assetId, projectId } = await params;
  return <IfcViewerScreen assetId={assetId} projectId={projectId} />;
}
