import { NextResponse } from "next/server";
import { obtenerSesion } from "@/lib/session";
import { semanasProcesables } from "@/lib/bot";

export const runtime = "nodejs";

// Semanas 1..11 con cuántos expedientes hay listos por semana. Solo admin.
export async function GET() {
  const s = await obtenerSesion();
  if (!s || s.rol !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  return NextResponse.json({ ok: true, semanas: semanasProcesables() });
}
