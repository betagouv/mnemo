import type { MeshData } from "@ifc-lite/geometry";
import {
  boundsEmpty,
  boundsExtendLine,
  createSectionConfig,
  Drawing2DGenerator,
  type Drawing2D,
} from "@ifc-lite/drawing-2d";
import { extractFloorPlanOutline } from "./floor-plan-outline";
import { floorPlanProjectionDepth } from "./floor-plan-meshes";

/** IFC-Lite owns section cuts, projection clipping, visibility and line merging. */
export async function generateFloorPlanDrawing(
  meshes: MeshData[],
  elevation: number,
): Promise<Drawing2D> {
  const generator = new Drawing2DGenerator();
  try {
    await generator.initialize();
    const drawing = await generator.generate(
      meshes,
      createSectionConfig("y", elevation, {
        projectionDepth: floorPlanProjectionDepth,
        // The printable plan uses the below-cut band only.
        projectionAboveDepth: 0,
        clipProjectionBands: true,
      }),
      {
        includeProjection: true,
        includeHiddenLines: false,
        outlineProvider: extractFloorPlanOutline,
      },
    );
    // Keep framing and export bounds limited to visible lines.
    drawing.lines = drawing.lines.filter(
      (line) => line.visibility !== "hidden",
    );
    drawing.bounds = drawing.lines.reduce(
      (bounds, line) => boundsExtendLine(bounds, line.line),
      boundsEmpty(),
    );
    drawing.stats.hiddenLineCount = 0;
    drawing.stats.projectionLineCount = drawing.lines.filter(
      (line) => line.category === "projection",
    ).length;
    return drawing;
  } finally {
    generator.dispose();
  }
}
