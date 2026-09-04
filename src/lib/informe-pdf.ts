// Genera el PDF del informe EN EL NAVEGADOR, con el mismo diseño que el .docx
// del backend: encabezado SALUD 360 (logo + identificación + línea verde),
// título "PROPUESTA DE EVALUACIÓN TSI" y las secciones I–V. Sin anexo.
//
// El backend sólo emite .docx; el PDF es una comodidad de lectura para el
// médico y NO es un artefacto del expediente.

import { es } from "./backend";
import { desglosarLicencias, fraseAnio, descDx, type LicenciaBackend } from "./licencias";

export interface CampoPdf {
  label: string;
  value: string;
}
export interface SeccionPdf {
  id: string;
  title: string;
  narrative: string;
  fields: CampoPdf[];
  items: string[];
}
export interface InformePdf {
  caseReference: string;
  version: number;
  createdAt: string;
  sections: SeccionPdf[];
  proposal: { recoverableChecked: boolean; irrecoverableChecked: boolean };
  licenses?: LicenciaBackend[];
}

const VERDE = [31, 122, 77] as const;
const VERDE_LINEA = [108, 191, 63] as const;
const GRIS = [91, 107, 123] as const;
const TINTA = [31, 56, 100] as const;

const MARGEN = 16;
const ANCHO = 210; // A4 mm
const ALTO = 297;
const UTIL = ANCHO - MARGEN * 2;

async function logoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch("/logoSALUD360.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => resolve("");
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function descargarInformePdf(inf: InformePdf): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await logoDataUrl();

  let y = 0;

  function encabezado() {
    if (logo) {
      // 570×149 → 42×11 mm conserva la proporción.
      doc.addImage(logo, "PNG", MARGEN, 12, 42, 11);
    } else {
      doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...VERDE);
      doc.text("SALUD 360", MARGEN, 20);
    }
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...VERDE);
    doc.text("Evaluación de Salud Irrecuperable", ANCHO - MARGEN, 18, { align: "right" });
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRIS);
    doc.text("del funcionario público · COMPIN Valparaíso", ANCHO - MARGEN, 23, { align: "right" });
    doc.setDrawColor(...VERDE_LINEA).setLineWidth(0.8);
    doc.line(MARGEN, 27, ANCHO - MARGEN, 27);
    y = 36;
  }

  function pie() {
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRIS);
      doc.text(`Página ${p} de ${n}`, ANCHO / 2, ALTO - 10, { align: "center" });
    }
  }

  function espacio(alto: number) {
    if (y + alto > ALTO - 18) {
      doc.addPage();
      encabezado();
    }
  }

  function parrafo(texto: string, opts: { bold?: boolean; size?: number; color?: readonly number[]; sangria?: number } = {}) {
    const size = opts.size ?? 10;
    doc.setFont("helvetica", opts.bold ? "bold" : "normal").setFontSize(size);
    doc.setTextColor(...((opts.color ?? [40, 40, 40]) as [number, number, number]));
    const x = MARGEN + (opts.sangria ?? 0);
    const lineas = doc.splitTextToSize(texto, UTIL - (opts.sangria ?? 0)) as string[];
    for (const l of lineas) {
      espacio(size * 0.42 + 1.5);
      doc.text(l, x, y);
      y += size * 0.42 + 1.5;
    }
  }

  encabezado();

  doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(...TINTA);
  espacio(10);
  doc.text("PROPUESTA DE EVALUACIÓN TSI", ANCHO / 2, y, { align: "center" });
  y += 9;

  parrafo(`Expediente: ${inf.caseReference}`, { bold: true, size: 10 });
  parrafo(
    `Versión ${inf.version} · ${new Date(inf.createdAt).toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })}`,
    { size: 8, color: GRIS },
  );
  y += 3;

  const desglose = desglosarLicencias(inf.licenses ?? []);

  for (const s of inf.sections) {
    if (s.id === "ANEXO") continue;
    y += 3;
    espacio(9);
    parrafo(s.title, { bold: true, size: 11, color: TINTA });
    y += 1;

    if (s.id === "II" && desglose) {
      if (desglose.periodo) parrafo(`Período evaluado: ${desglose.periodo}`, { bold: true });
      for (const a of desglose.porAnio) parrafo(fraseAnio(a, descDx), { sangria: 2, size: 9.5 });
      const td = desglose.totalDiasCompletos ? `${desglose.totalDiasAutorizados}` : `≥ ${desglose.totalDiasAutorizados}`;
      parrafo(`Total licencias evaluadas (autorizadas): ${desglose.totalAutorizadas} · Total días: ${td}`, { bold: true });
      if (desglose.rechazadas.length > 0) {
        parrafo(
          `Licencias rechazadas (no computadas): ${desglose.rechazadas.length} — ` +
            desglose.rechazadas.map((r) => `Folio ${r.folio}, ${r.periodo}, ${r.dias} día(s), ${r.cie10} ${descDx(r.cie10)}`).join("; ") + ".",
          { size: 9, color: GRIS },
        );
      }
      for (const f of s.fields.filter((x) => /FULME|TPI|Criterio/.test(x.label))) {
        parrafo(`${f.label}: ${es(f.value)}`, { size: 9.5 });
      }
      continue;
    }

    if (s.narrative) parrafo(s.narrative);

    for (const f of s.fields) {
      const etiqueta = `${f.label}: `;
      doc.setFont("helvetica", "bold").setFontSize(9.5);
      const w = doc.getTextWidth(etiqueta);
      const valor = doc.splitTextToSize(es(f.value), UTIL - w) as string[];
      espacio(5);
      doc.setTextColor(...GRIS);
      doc.text(etiqueta, MARGEN, y);
      doc.setFont("helvetica", "normal").setTextColor(40, 40, 40);
      doc.text(valor[0] ?? "", MARGEN + w, y);
      y += 4.6;
      for (const extra of valor.slice(1)) {
        espacio(4.6);
        doc.text(extra, MARGEN + w, y);
        y += 4.6;
      }
    }

    for (const it of s.items) parrafo(`•  ${es(it)}`, { sangria: 3, size: 9.5 });

    if (s.id === "V") {
      y += 2;
      const marca = (activo: boolean) => (activo ? "[X]" : "[  ]");
      parrafo(`${marca(inf.proposal.recoverableChecked)}  Salud recuperable`, { bold: true, size: 10 });
      parrafo(`${marca(inf.proposal.irrecoverableChecked)}  Salud irrecuperable`, { bold: true, size: 10 });
    }
  }

  pie();
  doc.save(`Informe_TSI_${inf.caseReference}.pdf`);
}
