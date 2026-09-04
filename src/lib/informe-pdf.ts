// Genera el PDF del informe EN EL NAVEGADOR, con el mismo diseño que el .docx
// del backend: encabezado SALUD 360 (logo + identificación + línea verde),
// título de marca y las secciones I–V.
//
// El backend sólo emite .docx del preinforme; este PDF es una comodidad de
// lectura para el médico y NO es un artefacto del expediente.
//
// DE DÓNDE SALE EL CONTENIDO, y es lo único importante de este archivo:
// EXCLUSIVAMENTE de `report.document`, la proyección que el backend compone con
// `buildClientReport` y que es la MISMA que imprime el .docx.
//
// NO de `report.sections`. Ese campo es el volcado interno del snapshot y lleva
// dentro los códigos de razón, los estados de política y los guardarraíles que
// la administración necesita ver. Mientras este archivo compuso el PDF con él,
// en un documento titulado "Informe TSI" salieron impresos "Criterio de
// período: Confirmado por el cliente", "[REC-1] Tratamiento activo" y "Ninguna
// cantidad de indicadores reemplaza el juicio profesional".
//
// Y NO se recalcula nada aquí: ni el desglose por año, ni los totales, ni el
// período. Todo eso viene ya resuelto y formateado en `document.sections`. Un
// segundo cómputo en el navegador es un segundo resultado posible.

export interface CampoDocumento {
  label: string;
  value: string;
}
export interface SeccionDocumento {
  id: string;
  title: string;
  fields: CampoDocumento[];
  paragraphs: string[];
}
export interface DocumentoInforme {
  documentKind: "PRE_REPORT" | "FINAL_SIGNED";
  branding: {
    documentTitle: string;
    institutionalHeading: string;
    institutionalSubheading: string;
    footerText: string;
  };
  caseReference: string;
  sections: SeccionDocumento[];
  proposal: { options: { label: string; checked: boolean }[]; note: string | null };
  draftNotice: string | null;
}
export interface InformePdf {
  caseReference: string;
  version: number;
  createdAt: string;
  document: DocumentoInforme;
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
  const marca = inf.document.branding;

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
    doc.text(marca.institutionalHeading, ANCHO - MARGEN, 18, { align: "right" });
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRIS);
    doc.text(marca.institutionalSubheading, ANCHO - MARGEN, 23, { align: "right" });
    doc.setDrawColor(...VERDE_LINEA).setLineWidth(0.8);
    doc.line(MARGEN, 27, ANCHO - MARGEN, 27);
    y = 36;
  }

  function pie() {
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRIS);
      doc.text(marca.footerText, MARGEN, ALTO - 10);
      doc.text(`Página ${p} de ${n}`, ANCHO / 2, ALTO - 10, { align: "center" });
    }
  }

  function espacio(alto: number) {
    if (y + alto > ALTO - 18) {
      doc.addPage();
      encabezado();
    }
  }

  function parrafo(
    texto: string,
    opts: { bold?: boolean; size?: number; color?: readonly number[]; sangria?: number } = {},
  ) {
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
  doc.text(marca.documentTitle, ANCHO / 2, y, { align: "center" });
  y += 9;

  parrafo(`Expediente: ${inf.document.caseReference}`, { bold: true, size: 10 });
  parrafo(
    `Versión ${inf.version} · ${new Date(inf.createdAt).toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })}`,
    { size: 8, color: GRIS },
  );
  if (inf.document.draftNotice) {
    y += 1;
    parrafo(inf.document.draftNotice, { size: 8, color: GRIS });
  }
  y += 3;

  for (const s of inf.document.sections) {
    y += 3;
    espacio(9);
    parrafo(s.title, { bold: true, size: 11, color: TINTA });
    y += 1;

    for (const f of s.fields) {
      const etiqueta = `${f.label}: `;
      doc.setFont("helvetica", "bold").setFontSize(9.5);
      const w = doc.getTextWidth(etiqueta);
      const valor = doc.splitTextToSize(f.value, UTIL - w) as string[];
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

    for (const p of s.paragraphs) parrafo(p);

    if (s.id === "V") {
      y += 2;
      for (const o of inf.document.proposal.options) {
        parrafo(`${o.checked ? "[X]" : "[  ]"}  ${o.label}`, { bold: true, size: 10 });
      }
      if (inf.document.proposal.note) parrafo(inf.document.proposal.note, { size: 9, color: GRIS });
    }
  }

  pie();
  doc.save(`Informe_TSI_${inf.document.caseReference}.pdf`);
}
