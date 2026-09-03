import { NextResponse } from "next/server";
import { obtenerSesion } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const s = await obtenerSesion();
  if (!s) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, uid: s.uid, rol: s.rol, nombre: s.nombre, region: s.region });
}
