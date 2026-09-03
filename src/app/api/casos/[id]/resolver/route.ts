import { NextResponse, type NextRequest } from "next/server";
import { obtenerSesion } from "@/lib/session";
import { resolverCaso } from "@/lib/casos";
import { obtenerFirma } from "@/lib/firma";

export const runtime = "nodejs";

// TSI-402 — el médico ratifica o modifica el informe y sube su firma PNG. Solo médico.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await obtenerSesion();
  if (!s || s.rol !== "medico") return NextResponse.json({ ok: false }, { status: 403 });

  const { id } = await params;
  let body: {
    decision?: unknown;
    calificacionFinal?: unknown;
    campos?: unknown;
    firmaPng?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }

  const decision = body.decision === "MODIFICA" ? "MODIFICA" : body.decision === "RATIFICA" ? "RATIFICA" : null;
  if (!decision) {
    return NextResponse.json({ ok: false, error: "Decisión inválida." }, { status: 400 });
  }

  // firma explícita en el body, o la firma guardada del médico (TSI-303)
  const firmaPng =
    typeof body.firmaPng === "string" && body.firmaPng ? body.firmaPng : obtenerFirma(s.uid);

  const r = resolverCaso({
    casoId: Number(id),
    medicoId: s.uid,
    decision,
    calificacionFinal: typeof body.calificacionFinal === "string" ? body.calificacionFinal : null,
    campos:
      body.campos && typeof body.campos === "object" ? (body.campos as Record<string, unknown>) : {},
    firmaPng,
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
