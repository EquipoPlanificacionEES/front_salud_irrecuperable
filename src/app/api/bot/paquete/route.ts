import { NextResponse, type NextRequest } from "next/server";
import { obtenerSesion } from "@/lib/session";
import { armarPaquete } from "@/lib/bot";

export const runtime = "nodejs";

// TSI-206 — GET: expedientes listos empaquetados. ?semanas=1,2,3 filtra por semana. Solo admin.
export async function GET(req: NextRequest) {
  const s = await obtenerSesion();
  if (!s || s.rol !== "admin") return NextResponse.json({ ok: false }, { status: 403 });

  const raw = req.nextUrl.searchParams.get("semanas");
  const semanas = raw
    ? raw.split(",").map(Number).filter(Number.isInteger)
    : undefined;
  return NextResponse.json({ ok: true, paquete: armarPaquete(semanas) });
}
