"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// TSI-207 + TSI-105 — estado del BOT: dos procesos (Ingesta / Análisis) con Iniciar / Detener.

interface Estado {
  proceso: string;
  estado: "DETENIDO" | "CORRIENDO" | "COMPLETADO" | "ERROR";
  progreso: number;
  encontrados: number;
  procesados: number;
  errores: number;
}

const PROCESOS = [
  { slug: "ingest", titulo: "Ingesta (descarga de expedientes)", etiquetaProcesados: "Descargados" },
  { slug: "analysis", titulo: "Análisis (IA)", etiquetaProcesados: "Analizados" },
] as const;

function colorEstado(e: Estado["estado"]) {
  return e === "CORRIENDO"
    ? "bg-blue-100 text-[var(--atm-azul)]"
    : e === "COMPLETADO"
      ? "bg-green-100 text-[var(--atm-ok)]"
      : e === "ERROR"
        ? "bg-red-100 text-[var(--atm-mal)]"
        : "bg-zinc-100 text-zinc-600";
}

function Panel({
  slug,
  titulo,
  etiquetaProcesados,
}: {
  slug: string;
  titulo: string;
  etiquetaProcesados: string;
}) {
  const [est, setEst] = useState<Estado | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const status = useCallback(async () => {
    const r = await fetch(`/api/automation/${slug}/status`);
    const d = await r.json();
    if (d.ok) setEst(d);
  }, [slug]);

  useEffect(() => {
    status();
    timer.current = setInterval(status, 3000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [status]);

  async function accion(a: "start" | "stop") {
    setBusy(true);
    try {
      const r = await fetch(`/api/automation/${slug}/${a}`, { method: "POST" });
      const d = await r.json();
      if (d.ok) setEst(d);
    } finally {
      setBusy(false);
    }
  }

  const corriendo = est?.estado === "CORRIENDO";

  return (
    <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <h3 className="font-semibold text-zinc-900">{titulo}</h3>
        {est && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colorEstado(est.estado)}`}>
            {est.estado}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => accion("start")}
            disabled={busy || corriendo}
            className="rounded-lg bg-[var(--atm-azul)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Iniciar
          </button>
          <button
            onClick={() => accion("stop")}
            disabled={busy || !corriendo}
            className="rounded-lg border border-[var(--atm-linea)] px-3 py-1.5 text-sm font-medium text-zinc-700 disabled:opacity-40"
          >
            Detener
          </button>
        </div>
      </div>

      <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
        <div
          className="h-full bg-[var(--atm-azul2)] transition-all"
          style={{ width: `${est?.progreso ?? 0}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          ["Encontrados", est?.encontrados ?? 0],
          [etiquetaProcesados, est?.procesados ?? 0],
          ["Errores", est?.errores ?? 0],
        ].map(([label, val]) => (
          <div key={label as string} className="rounded-lg border border-[var(--atm-linea)] p-3">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{val}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Automation() {
  return (
    <div className="space-y-6">
      {PROCESOS.map((p) => (
        <Panel key={p.slug} {...p} />
      ))}
      <p className="text-xs text-zinc-400">
        Módulo <code>automation</code> (TSI-105) — endpoints{" "}
        <code>/api/automation/&#123;ingest|analysis&#125;/&#123;start|stop|status&#125;</code>.
      </p>
    </div>
  );
}
