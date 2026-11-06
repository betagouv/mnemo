import { buildFloorPlanLegend } from "./floor-plan-pdf-legend";
import type { jsPDF } from "jspdf";
import type { FloorPlanRule } from "@mnemo/contracts/floor-plans";
import {
  createFloorPlanStyleResolver,
  floorPlanHatches,
  type FloorPlanDrawing,
  type FloorPlanPresetId,
  type FloorPlanStyle,
} from "@mnemo/ifc-viewer-adapter";

import {
  drawFloorPlanSheet,
  floorPlanPdfLayout,
  type FloorPlanPdfInfo,
} from "./floor-plan-pdf-sheet";

/** Export the complete drawing as vectors, using the same rule resolver as the canvas. */
export async function createFloorPlanPdf(
  drawing: FloorPlanDrawing,
  preset: FloorPlanPresetId,
  rules: readonly FloorPlanRule[],
  info: FloorPlanPdfInfo,
) {
  const { jsPDF } = await import("jspdf");
  const { min, max } = drawing.bounds;
  const width = max.x - min.x;
  const height = max.y - min.y;
  if (
    ![min.x, min.y, max.x, max.y, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error("Les dimensions du plan ne permettent pas son export.");
  const pdf = new jsPDF({
    orientation: width >= height ? "landscape" : "portrait",
    unit: "mm",
    format: "a3",
    compress: true,
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const resolve = createFloorPlanStyleResolver(drawing, preset, rules);
  const elements = [
    ...drawing.cutPolygons.map((source) => ({
      kind: "polygon" as const,
      source,
      style: resolve(source),
    })),
    ...drawing.lines
      .filter((line) => line.visibility !== "hidden")
      .map((source) => ({
        kind: "line" as const,
        source,
        style: resolve(source, source.category === "cut" ? 0.4 : 0.2),
      })),
  ].sort((a, b) => a.style.drawOrder - b.style.drawOrder);
  const legend = buildFloorPlanLegend(elements, rules);
  const layout = floorPlanPdfLayout(
    pageWidth,
    pageHeight,
    width,
    height,
    legend.length,
  );
  const { scale, plot } = layout;
  const offsetX = plot.x + (plot.width - width * scale) / 2;
  const offsetY = plot.y + (plot.height - height * scale) / 2;
  const point = (p: { x: number; y: number }) => [
    offsetX + (p.x - min.x) * scale,
    offsetY + (p.y - min.y) * scale,
  ];
  for (const element of elements) {
    if (!element.style.visible) continue;
    pdf.saveGraphicsState();
    applyStyle(pdf, element.style);
    if (element.kind === "polygon")
      drawPolygon(pdf, element.source, element.style, point);
    else drawLine(pdf, element.source.line, point);
    pdf.restoreGraphicsState();
  }
  drawFloorPlanSheet(
    pdf,
    { ...info, exportedAt: info.exportedAt ?? new Date() },
    legend,
    layout,
  );
  pdf.setProperties({
    title: info.title,
    subject: `Vue en plan - ${info.projectName} - ${info.storeyName}`,
    creator: "Mnemo",
  });
  return pdf.output("blob");
}

type Point = { x: number; y: number };
type PdfPoint = (point: Point) => number[];
function applyStyle(pdf: jsPDF, style: FloorPlanStyle) {
  pdf.setGState(
    pdf.GState({ opacity: style.opacity, "stroke-opacity": style.opacity }),
  );
  pdf.setDrawColor(style.strokeColor);
  pdf.setFillColor(style.fillColor);
  pdf.setLineWidth(style.lineWeight);
  pdf.setLineCap(style.lineCap);
  pdf.setLineJoin(style.lineJoin);
  pdf.setLineDashPattern(style.dashPattern, 0);
}
function drawLine(
  pdf: jsPDF,
  line: { start: Point; end: Point },
  point: PdfPoint,
) {
  const [x1, y1] = point(line.start);
  const [x2, y2] = point(line.end);
  pdf.line(x1, y1, x2, y2);
}
function drawPolygon(
  pdf: jsPDF,
  polygon: FloorPlanDrawing["cutPolygons"][number],
  style: FloorPlanStyle,
  point: PdfPoint,
) {
  for (const ring of [polygon.polygon.outer, ...polygon.polygon.holes]) {
    if (!ring.length) continue;
    const [x, y] = point(ring[0]);
    pdf.moveTo(x, y);
    for (const vertex of ring.slice(1)) {
      const [px, py] = point(vertex);
      pdf.lineTo(px, py);
    }
    pdf.close();
  }
  pdf.fillStrokeEvenOdd();
  pdf.setDrawColor(style.hatchColor);
  pdf.setLineWidth(style.hatchLineWeight);
  pdf.setLineDashPattern([], 0);
  for (const { line } of floorPlanHatches(polygon, style))
    drawLine(pdf, line, point);
}
