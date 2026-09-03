import { NextResponse, type NextRequest } from "next/server";
import { obtenerSesion } from "@/lib/session";
import { devolverCaso } from "@/lib/casos";

export const runtime = "nodejs";

// Control de calidad devuelve un caso al médico (uso esporádico). Solo calidad / admin.
export async function POST(req: NextRequest) {
  const s = await obtenerSesion();
  if (!s || (s.rol !== "calidad" && s.rol !== "admin")) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  let body: { casoId?: unknown; motivo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }

  const casoId = Number(body.casoId);
  const motivo = typeof body.motivo === "string" ? body.motivo : "";
  if (!Number.isInteger(casoId)) {
    return NextResponse.json({ ok: false, error: "Caso inválido." }, { status: 400 });
  }

  const r = devolverCaso(casoId, motivo, s.uid);
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
