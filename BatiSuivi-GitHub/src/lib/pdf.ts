import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { aptPct, blocPct, floorPct, fmt, workSummary, type Bloc, type Project } from "./batiment";

/** Une capture 3D : image + ratio largeur/hauteur + libellé de l'angle. */
export interface Shot { url: string; aspect: number; label: string }

type RGB = [number, number, number];

const GREEN: RGB = [22, 163, 74];
const AMBER: RGB = [234, 140, 10];
const RED: RGB = [220, 38, 38];
const GRAY: RGB = [100, 116, 139];

const rateRGB = (p: number | null): RGB => (p === null ? GRAY : p >= 100 ? GREEN : p <= 0 ? RED : AMBER);

const rateCell = (p: number | null) => ({
  content: fmt(p),
  styles: {
    fillColor: rateRGB(p),
    textColor: [255, 255, 255] as RGB,
    fontStyle: "bold" as const,
    halign: "center" as const,
  },
});

const fit = (aspect: number, maxW: number, maxH: number) => {
  const aw = Number.isFinite(aspect) && aspect > 0 ? Math.max(0.5, aspect) : 1.6;
  const s = Math.min(maxW / aw, maxH);
  return { w: aw * s, h: s };
};

/**
 * PDF en deux pages :
 * 1) le bâtiment vu de tous les côtés (5 angles) + légende des couleurs ;
 * 2) l'avancement : tableau par étage et tableau des travaux saisis (cellules colorées).
 */
export function buildPdf(project: Project, bloc: Bloc, shots: Shot[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 12;
  const w = pw - m * 2;

  /* ---------------- Page 1 : vues 3D ---------------- */
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.text(`${project.name} — ${bloc.name}`, m, 15);

  doc.setFontSize(9);
  doc.setTextColor(100);
  const nApts = bloc.floors.reduce((s, f) => s + f.apts.filter((a) => !a.common).length, 0);
  const nCommon = bloc.floors.reduce((s, f) => s + f.apts.filter((a) => a.common).length, 0);
  doc.text(
    `${bloc.floors.length > 1 ? `R+${bloc.floors.length - 1} · ${bloc.floors.length} niveaux` : "RDC"}   •   ` +
      `${nApts} appartements${nCommon ? ` + ${nCommon} espace${nCommon > 1 ? "s" : ""} commun${nCommon > 1 ? "s" : ""}` : ""}   •   ${new Date().toLocaleDateString("fr-FR")}`,
    m,
    21,
  );

  const blocRate = blocPct(bloc);
  doc.setFillColor(...rateRGB(blocRate));
  doc.roundedRect(pw - m - 44, 8, 44, 14, 3, 3, "F");
  doc.setTextColor(255);
  doc.setFontSize(13);
  doc.text(`Taux bloc ${fmt(blocRate)}`, pw - m - 22, 17.5, { align: "center" });

  const usable = shots.filter((s) => s.url);
  const iso = usable.find((s) => s.label === "Vue 3D") ?? usable[0];
  const sides = usable.filter((s) => s !== iso).slice(0, 4);

  let y = 27;
  if (iso) {
    const box = fit(iso.aspect, w, 76);
    doc.addImage(iso.url, "PNG", m + (w - box.w) / 2, y, box.w, box.h, undefined, "FAST");
    y += box.h + 5;
  }
  if (sides.length) {
    const gap = 4;
    const cw = (w - gap) / 2;
    const ch = 37;
    sides.forEach((s, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = m + col * (cw + gap);
      const yy = y + row * (ch + 9);
      const box = fit(s.aspect, cw, ch);
      doc.addImage(s.url, "PNG", x + (cw - box.w) / 2, yy, box.w, box.h, undefined, "FAST");
      doc.setFontSize(8);
      doc.setTextColor(70);
      doc.text(s.label, x + cw / 2, yy + box.h + 3.6, { align: "center" });
    });
    y += Math.ceil(sides.length / 2) * (ch + 9) + 1;
  }

  /* Légende des couleurs + résumé */
  y = Math.max(y, 205);
  doc.setDrawColor(220);
  doc.line(m, y, pw - m, y);
  y += 6;
  doc.setFontSize(8.5);
  doc.setTextColor(55);
  let x = m;
  const legend: [string, RGB][] = [
    ["Terminé · 100%", GREEN],
    ["En cours", AMBER],
    ["Non démarré · 0%", RED],
    ["Non saisi", GRAY],
  ];
  for (const [text, color] of legend) {
    doc.setFillColor(...color);
    doc.rect(x, y - 3, 3, 3, "F");
    doc.text(text, x + 4.5, y);
    x += 4.5 + doc.getTextWidth(text) + 6;
  }

  y += 8;
  const floorRates = bloc.floors.map((f) => floorPct(f)).filter((v): v is number => v !== null);
  const avgFloors = floorRates.length ? floorRates.reduce((s, v) => s + v, 0) / floorRates.length : null;
  doc.setFontSize(9.5);
  doc.setTextColor(40);
  doc.text(
    `Taux bloc : ${fmt(blocRate)}   •   Moyenne des étages saisis : ${fmt(avgFloors)}`,
    m,
    y,
  );

  /* ---------------- Page 2 : avancement ---------------- */
  doc.addPage();
  doc.setFontSize(14);
  doc.setTextColor(17, 24, 39);
  doc.text("Avancement par appartement", m, 16);

  const maxApts = Math.max(1, ...bloc.floors.map((f) => f.apts.length));
  const headNames = Array.from({ length: maxApts }, (_, i) => {
    const counts = new Map<string, number>();
    for (const f of bloc.floors) {
      const name = f.apts[i]?.name?.trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : `A${i + 1}`;
  });

  autoTable(doc, {
    startY: 20,
    head: [["Étage", ...headNames, "Taux"]],
    body: bloc.floors.map((f) => [
      f.label,
      ...Array.from({ length: maxApts }, (_, i) => {
        const apt = f.apts[i];
        return apt ? rateCell(aptPct(apt)) : { content: "—", styles: { textColor: [150, 150, 150] as RGB, halign: "center" as const } };
      }),
      rateCell(floorPct(f)),
    ]),
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 1.8, halign: "center" },
    headStyles: { fillColor: [29, 78, 216], textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 22, halign: "left", fontStyle: "bold" }, [maxApts + 1]: { cellWidth: 22, fontStyle: "bold" } },
  });

  const afterMatrix = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.setTextColor(17, 24, 39);
  doc.text("Travaux saisis (tout le bloc)", m, afterMatrix - 3);

  const rows = workSummary(bloc);
  autoTable(doc, {
    startY: afterMatrix,
    head: [["Travaux", "Appartements", "Avancement"]],
    body: rows.length
      ? rows.map((r) => [r.name, String(r.count), rateCell(r.pct)])
      : [["Aucun travail saisi", "—", rateCell(null)]],
    foot: [["Taux global", "", rateCell(blocRate)]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.2 },
    headStyles: { fillColor: [29, 78, 216], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 92 }, 1: { cellWidth: 30, halign: "center" }, 2: { cellWidth: 34 } },
  });

  /* Pieds de page */
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(`${project.name} — ${bloc.name}`, m, ph - 7);
    doc.text(`${i} / ${pages}`, pw - m, ph - 7, { align: "right" });
  }

  doc.save(`${project.name}-${bloc.name}.pdf`.replace(/\s+/g, "_"));
}
