import { NextResponse, type NextRequest } from "next/server";
import { obtenerSesion } from "@/lib/session";
import { enviarAlBot } from "@/lib/bot";
import { regionIdPorCodigo } from "@/lib/carga";

export const runtime = "nodejs";

// TSI-206 — POST: empaqueta y envía al bot las semanas seleccionadas. Solo admin.
export async function POST(req: NextRequest) {
  const s = await obtenerSesion();
  if (!s || s.rol !== "admin") return NextResponse.json({ ok: false }, { status: 403 });

  let semanas: number[] | undefined;
  try {
    const body = await req.json();
    if (Array.isArray(body?.semanas)) {
      semanas = body.semanas.map(Number).filter(Number.isInteger);
    }
  } catch {
    // sin body -> todas las habilitadas
  }

  const r = await enviarAlBot(semanas, s.uid, regionIdPorCodigo(s.region));
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
