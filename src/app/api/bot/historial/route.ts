import { NextResponse } from "next/server";
import { obtenerSesion } from "@/lib/session";
import { historialBot } from "@/lib/bot";

export const runtime = "nodejs";

// TSI-208 — historial de corridas del bot del propio administrador.
export async function GET() {
  const s = await obtenerSesion();
  if (!s || s.rol !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  return NextResponse.json({ ok: true, corridas: historialBot(s.uid) });
}
