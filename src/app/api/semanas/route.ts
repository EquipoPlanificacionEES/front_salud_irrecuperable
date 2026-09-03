import { NextResponse } from "next/server";
import { obtenerSesion } from "@/lib/session";
import { listarSemanas } from "@/lib/carga";

export const runtime = "nodejs";

// Bandeja de semanas para la carga del administrador.
export async function GET() {
  const s = await obtenerSesion();
  if (!s || s.rol !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  return NextResponse.json({ ok: true, semanas: listarSemanas() });
}
