import { NextResponse, type NextRequest } from "next/server";
import { obtenerSesion } from "@/lib/session";
import { registrarCarga, regionIdPorCodigo } from "@/lib/carga";

export const runtime = "nodejs";

// TSI-206 — el administrador dispara la carga de una semana habilitada.
// Registra Case (`casos`) + CaseDocument (`caso_documentos`). Mock del BOT + PostgreSQL.
export async function POST(req: NextRequest) {
  const s = await obtenerSesion();
  if (!s || s.rol !== "admin") return NextResponse.json({ ok: false }, { status: 403 });

  let body: { semanaId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }

  const semanaId = Number(body.semanaId);
  if (!Number.isInteger(semanaId)) {
    return NextResponse.json({ ok: false, error: "Semana inválida." }, { status: 400 });
  }

  const r = registrarCarga(semanaId, regionIdPorCodigo(s.region));
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
