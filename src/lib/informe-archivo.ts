import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";

// TSI-402 — genera el informe como PDF o DOCX a partir del JSON del bot.
// En producción el archivo final lo arma el backend (fusiona la firma PNG); esto es para "Ver / Descargar".

type Informe = Record<string, unknown>;

function lineas(informe: Informe): [string, string][] {
  const id = (informe.identificacion ?? {}) as Record<string, unknown>;
  const p = (informe.propuesta ?? {}) as Record<string, unknown>;
  const inf = (informe.informe ?? {}) as Record<string, unknown>;
  const s = (x: unknown) => (Array.isArray(x) ? x.join(", ") : x == null ? "—" : String(x));
  return [
    ["RUT", s(id.rut)],
    ["Nombre", s(id.nombre)],
    ["Edad", s(id.edad)],
    ["Previsión", s(id.prevision)],
    ["Comuna", s(id.comuna)],
    ["Diagnóstico principal", s(p.diagnostico_principal)],
    ["Diagnósticos secundarios", s(p.diagnosticos_secundarios)],
    ["Origen", s(p.origen)],
    ["Porcentaje sugerido", `${s(p.porcentaje_sugerido)} %`],
    ["Grado", s(p.grado)],
    ["Resumen", s(inf.resumen)],
  ];
}

export async function informePdf(informe: Informe): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 790;
  page.drawText("Informe de calificación (sugerido)", { x: 50, y, size: 16, font: bold });
  y -= 12;
  page.drawText("Plataforma Salud Irrecuperable", { x: 50, y: y - 6, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 36;

  for (const [k, val] of lineas(informe)) {
    page.drawText(`${k}:`, { x: 50, y, size: 10, font: bold });
    const wrapped = wrap(val, 78);
    wrapped.forEach((ln, i) => {
      page.drawText(ln, { x: 200, y: y - i * 13, size: 10, font });
    });
    y -= Math.max(20, wrapped.length * 13 + 7);
  }

  y -= 24;
  page.drawText("Firma del médico: __________________________", { x: 50, y, size: 10, font });
  return pdf.save();
}

export async function informeDocx(informe: Informe): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "Informe de calificación (sugerido)", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: "Plataforma Salud Irrecuperable", spacing: { after: 200 } }),
          ...lineas(informe).map(
            ([k, val]) =>
              new Paragraph({
                spacing: { after: 120 },
                children: [new TextRun({ text: `${k}: `, bold: true }), new TextRun(val)],
              }),
          ),
          new Paragraph({ text: "", spacing: { before: 300 } }),
          new Paragraph("Firma del médico: __________________________"),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max) {
      if (line) out.push(line);
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) out.push(line);
  return out.length ? out : ["—"];
}
