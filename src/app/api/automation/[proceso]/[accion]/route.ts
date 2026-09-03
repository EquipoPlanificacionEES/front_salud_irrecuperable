import { NextResponse, type NextRequest } from "next/server";
import { obtenerSesion } from "@/lib/session";
import { estadoProceso, iniciarProceso, detenerProceso, type Proceso } from "@/lib/automation";

export const runtime = "nodejs";

// TSI-105 — modules/automation/ (mock)
//   POST /api/automation/ingest|analysis/start
//   POST /api/automation/ingest|analysis/stop
//   GET  /api/automation/ingest|analysis/status

const MAP: Record<string, Proceso> = { ingest: "INGEST", analysis: "ANALYSIS" };

async function esAdmin() {
  const s = await obtenerSesion();
  return !!s && s.rol === "admin";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ proceso: string; accion: string }> },
) {
  if (!(await esAdmin())) return NextResponse.json({ ok: false }, { status: 403 });
  const { proceso, accion } = await params;
  const p = MAP[proceso];
  if (!p || accion !== "status") {
    return NextResponse.json({ ok: false, error: "Ruta inválida." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...estadoProceso(p) });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ proceso: string; accion: string }> },
) {
  if (!(await esAdmin())) return NextResponse.json({ ok: false }, { status: 403 });
  const { proceso, accion } = await params;
  const p = MAP[proceso];
  if (!p) return NextResponse.json({ ok: false, error: "Proceso inválido." }, { status: 404 });

  if (accion === "start") return NextResponse.json({ ok: true, ...iniciarProceso(p) });
  if (accion === "stop") return NextResponse.json({ ok: true, ...detenerProceso(p) });
  return NextResponse.json({ ok: false, error: "Acción inválida." }, { status: 404 });
}
