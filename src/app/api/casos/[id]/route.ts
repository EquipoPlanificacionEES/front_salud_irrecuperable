import { NextResponse, type NextRequest } from "next/server";
import { obtenerSesion } from "@/lib/session";
import { obtenerCaso } from "@/lib/casos";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await obtenerSesion();
  if (!s) return NextResponse.json({ ok: false }, { status: 401 });

  const { id } = await params;
  const caso = obtenerCaso(Number(id));
  if (!caso) return NextResponse.json({ ok: false, error: "No encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, caso });
}
