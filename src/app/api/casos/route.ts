import { NextResponse, type NextRequest } from "next/server";
import { obtenerSesion } from "@/lib/session";
import { listarCasos } from "@/lib/casos";

export const runtime = "nodejs";

// Bandejas de casos. Filtros: ?estado= ?flujo= ?documento= ?decision=
export async function GET(req: NextRequest) {
  const s = await obtenerSesion();
  if (!s) return NextResponse.json({ ok: false }, { status: 401 });

  const q = req.nextUrl.searchParams;
  const casos = listarCasos({
    estado: q.get("estado") ?? undefined,
    flujo: q.get("flujo") ?? undefined,
    documento: q.get("documento") ?? undefined,
    decision: q.get("decision") ?? undefined,
  });
  return NextResponse.json({ ok: true, casos });
}
