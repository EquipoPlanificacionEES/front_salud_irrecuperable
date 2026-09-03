import { type NextRequest } from "next/server";
import { obtenerSesion } from "@/lib/session";
import { obtenerCaso } from "@/lib/casos";
import { informePdf, informeDocx } from "@/lib/informe-archivo";

export const runtime = "nodejs";

// TSI-402 — Ver PDF / Descargar DOCX del informe. Solo médico.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await obtenerSesion();
  if (!s || s.rol !== "medico") return new Response("No autorizado", { status: 403 });

  const { id } = await params;
  const caso = obtenerCaso(Number(id));
  if (!caso || !caso.informe) return new Response("Informe no disponible", { status: 404 });

  const formato = req.nextUrl.searchParams.get("formato") === "docx" ? "docx" : "pdf";
  const informe = caso.informe as Record<string, unknown>;
  const nombre = `informe_${caso.id_tramite}`;

  if (formato === "docx") {
    const buf = await informeDocx(informe);
    return new Response(new Uint8Array(buf) as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${nombre}.docx"`,
      },
    });
  }

  const pdf = await informePdf(informe);
  return new Response(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre}.pdf"`,
    },
  });
}
