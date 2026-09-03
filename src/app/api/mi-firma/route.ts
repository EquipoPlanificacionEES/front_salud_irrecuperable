import { NextResponse, type NextRequest } from "next/server";
import { obtenerSesion } from "@/lib/session";
import { obtenerFirma, guardarFirma } from "@/lib/firma";

export const runtime = "nodejs";

// TSI-303 — la firma del médico/admin.
export async function GET() {
  const s = await obtenerSesion();
  if (!s || s.rol !== "medico") {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  return NextResponse.json({ ok: true, firma: obtenerFirma(s.uid) });
}

export async function POST(req: NextRequest) {
  const s = await obtenerSesion();
  if (!s || s.rol !== "medico") {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  let body: { firma?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }
  if (typeof body.firma !== "string") {
    return NextResponse.json({ ok: false, error: "Falta la imagen." }, { status: 400 });
  }
  const r = guardarFirma(s.uid, body.firma);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
