import type { FloorPlanLegendEntry } from "./floor-plan-pdf-legend";
import type { jsPDF } from "jspdf";
import { floorPlanHatches } from "./floor-plan-drawing";

export type FloorPlanPdfInfo = {
  title: string;
  projectName: string;
  sourceName: string;
  storeyName: string;
  storeyElevation: number | null;
  logo: Uint8Array;
  exportedAt?: Date;
};
const margin = 12;
const blue = "#000091";
const ink = "#161616";
const grey = "#666666";
const rowHeight = 11;

export function floorPlanPdfLayout(
  pageWidth: number,
  pageHeight: number,
  worldWidth: number,
  worldHeight: number,
  legendCount = 0,
) {
  const columns = pageWidth > pageHeight ? 3 : 2;
  const capacity = columns * 2;
  const legendHeight = legendCount
    ? 10 +
      Math.min(2, Math.ceil(legendCount / columns)) * rowHeight +
      (legendCount > capacity ? 5 : 0)
    : 0;
  const legendY = pageHeight - 55 - legendHeight;
  const plot = {
    x: margin,
    y: 42,
    width: pageWidth - margin * 2,
    height: (legendCount ? legendY - 6 : pageHeight - 56) - 42,
  };
  const required = Math.max(
    (worldWidth * 1000) / plot.width,
    (worldHeight * 1000) / plot.height,
  );
  const denominator =
    [
      10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000, 2000, 5000, 10000,
    ].find((scale) => scale >= required) ?? Math.ceil(required / 10000) * 10000;
  return {
    plot,
    denominator,
    scale: 1000 / denominator,
    legendY,
    legendColumns: columns,
    legendCapacity: capacity,
  };
}
export type FloorPlanPdfLayout = ReturnType<typeof floorPlanPdfLayout>;

function text(
  pdf: jsPDF,
  value: string,
  x: number,
  y: number,
  width: number,
  size: number,
  lines = 1,
  bold = false,
) {
  pdf.setFont("helvetica", bold ? "bold" : "normal");
  pdf.setFontSize(size);
  const wrapped: string[] = pdf.splitTextToSize(
    value.replace(/[\u202f\u00a0]/g, " "),
    width,
  );
  const visible = wrapped.slice(0, lines);
  if (wrapped.length > lines) {
    let last = visible[visible.length - 1];
    while (last && pdf.getTextWidth(`${last}...`) > width)
      last = last.slice(0, -1);
    visible[visible.length - 1] = `${last}...`;
  }
  pdf.text(visible, x, y, { lineHeightFactor: 1.2 });
}

function drawSheetFrame(
  pdf: jsPDF,
  info: FloorPlanPdfInfo,
  page: number,
  count: number,
  denominator: number,
) {
  const width = pdf.internal.pageSize.getWidth(),
    height = pdf.internal.pageSize.getHeight();
  pdf.setGState(pdf.GState({ opacity: 1, "stroke-opacity": 1 }));
  pdf.setLineDashPattern([], 0);
  pdf.setDrawColor(blue);
  pdf.setLineWidth(0.6);
  pdf.line(margin, 37, width - margin, 37);
  const logo = pdf.getImageProperties(info.logo);
  pdf.addImage(
    info.logo,
    "PNG",
    margin,
    12,
    48,
    (48 * logo.height) / logo.width,
    "mnemo-logo",
    "FAST",
  );
  pdf.setTextColor(blue);
  text(
    pdf,
    page === 1 ? "VUE EN PLAN" : "LÉGENDE DU PLAN",
    74,
    14,
    width - 86,
    7,
    1,
    true,
  );
  pdf.setTextColor(ink);
  text(pdf, info.title, 74, 22, width - 86, 16, 2, true);
  pdf.setTextColor(grey);
  text(
    pdf,
    `Niveau ${info.storeyName} · Coupe à +1,20 m`,
    74,
    34,
    width - 86,
    8,
  );

  const top = height - 49,
    cellWidth = (width - 2 * margin) / 4;
  pdf.setDrawColor("#cecece");
  pdf.setLineWidth(0.25);
  pdf.rect(margin, top, width - 2 * margin, 31);
  for (let column = 1; column < 4; column++)
    pdf.line(
      margin + cellWidth * column,
      top,
      margin + cellWidth * column,
      top + 31,
    );
  const elevation =
    info.storeyElevation === null
      ? "Altitude du niveau non renseignée"
      : `Altitude IFC du niveau ${info.storeyElevation.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} m`;
  const fields = [
    ["PROJET", info.projectName],
    ["MAQUETTE SOURCE", info.sourceName],
    [
      "NIVEAU ET COUPE",
      `${info.storeyName}\n${elevation}\nPlan de coupe à +1,20 m du niveau`,
    ],
    ["ÉCHELLE", `1:${denominator}`],
  ];
  for (let column = 0; column < fields.length; column++) {
    const x = margin + cellWidth * column + 4;
    pdf.setTextColor(grey);
    text(pdf, fields[column][0], x, top + 6, cellWidth - 8, 6.5, 1, true);
    pdf.setTextColor(ink);
    text(pdf, fields[column][1], x, top + 12, cellWidth - 8, 8, 4);
  }
  const scale = 1000 / denominator;
  const maxLength = Math.min(50, cellWidth - 12) / scale;
  const base = 10 ** Math.floor(Math.log10(maxLength));
  const length = [1, 2, 5]
    .map((factor) => factor * base)
    .filter((value) => value <= maxLength)
    .at(-1)!;
  const barX = margin + 3 * cellWidth + 4,
    barY = top + 23,
    barWidth = length * scale;
  pdf.setDrawColor(ink);
  pdf.setLineWidth(0.35);
  pdf.setLineDashPattern([], 0);
  pdf.line(barX, barY, barX + barWidth, barY);
  pdf.line(barX, barY - 1, barX, barY + 1);
  pdf.line(barX + barWidth, barY - 1, barX + barWidth, barY + 1);
  pdf.setTextColor(ink);
  text(pdf, "0", barX, barY + 5, 10, 6.5);
  text(
    pdf,
    `${length.toLocaleString("fr-FR")} m`,
    barX + barWidth - 2,
    barY + 5,
    20,
    6.5,
  );
  const date = (info.exportedAt ?? new Date()).toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  pdf.setTextColor(grey);
  text(
    pdf,
    `Export du ${date} · A3 · Échelle 1:${denominator} à l'impression à 100 %`,
    margin,
    height - 10,
    width - 48,
    6.5,
  );
  pdf.setFontSize(7);
  pdf.text(`${page} / ${count}`, width - margin, height - 10, {
    align: "right",
  });
}

function drawLegendEntry(
  pdf: jsPDF,
  entry: FloorPlanLegendEntry,
  x: number,
  y: number,
  width: number,
) {
  const { style } = entry;
  pdf.saveGraphicsState();
  pdf.setGState(
    pdf.GState({ opacity: style.opacity, "stroke-opacity": style.opacity }),
  );
  pdf.setDrawColor(style.strokeColor);
  pdf.setFillColor(style.fillColor);
  pdf.setLineWidth(style.lineWeight);
  pdf.setLineDashPattern(style.dashPattern, 0);
  if (entry.filled) {
    pdf.rect(x, y - 3, 12, 5, "FD");
    const polygon = {
      entityId: 0,
      ifcType: "IfcWall",
      modelIndex: 0,
      isCut: true,
      polygon: {
        outer: [
          { x: 0, y: 0 },
          { x: 1.2, y: 0 },
          { x: 1.2, y: 0.5 },
          { x: 0, y: 0.5 },
        ],
        holes: [],
      },
    };
    pdf.setDrawColor(style.hatchColor);
    pdf.setLineWidth(style.hatchLineWeight);
    pdf.setLineDashPattern([], 0);
    for (const { line } of floorPlanHatches(polygon, style))
      pdf.line(
        x + line.start.x * 10,
        y - 3 + line.start.y * 10,
        x + line.end.x * 10,
        y - 3 + line.end.y * 10,
      );
  } else pdf.line(x, y - 0.5, x + 12, y - 0.5);
  pdf.restoreGraphicsState();
  pdf.setTextColor(ink);
  text(pdf, entry.label, x + 16, y - 1, width - 16, 7.5, 1, true);
  pdf.setTextColor(grey);
  text(pdf, entry.detail, x + 16, y + 3, width - 16, 6.2, 2);
}

export function drawFloorPlanSheet(
  pdf: jsPDF,
  info: FloorPlanPdfInfo,
  legend: FloorPlanLegendEntry[],
  layout: FloorPlanPdfLayout,
) {
  const width = pdf.internal.pageSize.getWidth(),
    height = pdf.internal.pageSize.getHeight();
  const {
    legendY,
    legendColumns,
    legendCapacity: capacity,
    denominator,
  } = layout;
  if (legend.length) {
    pdf.setDrawColor("#cecece");
    pdf.setLineWidth(0.25);
    pdf.line(margin, legendY - 3, width - margin, legendY - 3);
    pdf.setTextColor(blue);
    text(
      pdf,
      "LÉGENDE DES RÈGLES PERSONNALISÉES",
      margin,
      legendY + 2,
      width - 2 * margin,
      8,
      1,
      true,
    );
    const columnWidth = (width - 2 * margin) / legendColumns;
    legend
      .slice(0, capacity)
      .forEach((entry, index) =>
        drawLegendEntry(
          pdf,
          entry,
          margin + (index % legendColumns) * columnWidth,
          legendY + 10 + Math.floor(index / legendColumns) * rowHeight,
          columnWidth - 8,
        ),
      );
    if (legend.length > capacity) {
      pdf.setTextColor(grey);
      text(
        pdf,
        "Suite de la légende en page 2",
        margin,
        legendY + 10 + 2 * rowHeight,
        width - 2 * margin,
        6.5,
      );
    }
  }
  let next = capacity;
  while (next < legend.length) {
    pdf.addPage();
    const columns = width > height ? 3 : 2;
    const columnWidth = (width - 2 * margin) / columns;
    const rows = Math.floor((height - 106) / rowHeight);
    for (let column = 0; column < columns && next < legend.length; column++) {
      for (let row = 0; row < rows && next < legend.length; row++, next++)
        drawLegendEntry(
          pdf,
          legend[next],
          margin + column * columnWidth,
          49 + row * rowHeight,
          columnWidth - 8,
        );
    }
  }
  const count = pdf.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    pdf.setPage(page);
    drawSheetFrame(pdf, info, page, count, denominator);
  }
  pdf.setPage(1);
}
