"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import type { ExportJob } from "@/lib/backend";

// POST /api/v1/exports {type:"SIGNED_REPORTS_ZIP", filters:{}}
// GET  /api/v1/exports
// GET  /api/v1/exports/:id/download

const ESTADO: Record<ExportJob["status"], string> = {
  PENDING: "en cola",
  PROCESSING: "procesando",
  READY: "listo",
  FAILED: "falló",
  EXPIRED: "vencido",
};

export function Exportaciones() {
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const cargar = useCallback(async () => {
    try {
      const d = await api<{ exports: ExportJob[] }>("/exports?limit=50");
      setJobs(d.exports);
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo cargar." });
    }
  }, []);

  useEffect(() => {
    void cargar();
    timer.current = setInterval(cargar, 3000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [cargar]);

  async function generar() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/exports", { json: { type: "SIGNED_REPORTS_ZIP", filters: {} } });
      setMsg({ ok: true, texto: "Exportación encolada." });
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo generar." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        onClick={generar}
        disabled={busy}
        className="rounded-lg bg-[var(--atm-azul)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--atm-azul2)] disabled:opacity-40"
      >
        Generar ZIP de informes firmados
      </button>

      {msg && <p className={`text-sm ${msg.ok ? "text-[var(--atm-ok)]" : "text-[var(--atm-mal)]"}`}>{msg.texto}</p>}

      <div className="overflow-x-auto rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--atm-th)] text-left text-white">
              <th className="px-4 py-2 font-medium">Solicitada</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Avance</th>
              <th className="px-4 py-2 font-medium">Informes</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-400">Sin exportaciones todavía.</td></tr>
            )}
            {jobs.map((j) => (
              <tr key={j.id} className="border-t border-[var(--atm-linea)]">
                <td className="px-4 py-2 text-zinc-600">{new Date(j.createdAt).toLocaleString("es-CL")}</td>
                <td className="px-4 py-2 text-zinc-600">
                  {ESTADO[j.status]}
                  {j.error && <span className="ml-1 text-xs text-[var(--atm-mal)]">— {j.error.message}</span>}
                </td>
                <td className="px-4 py-2 text-zinc-600">{j.progressPercent}%</td>
                <td className="px-4 py-2 text-zinc-600">{j.processedItems}/{j.totalItems}</td>
                <td className="px-4 py-2 text-right">
                  {j.downloadAvailable ? (
                    <a
                      href={`/api/v1/exports/${j.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs font-medium text-[var(--atm-azul)] hover:bg-blue-50"
                    >
                      Descargar ZIP
                    </a>
                  ) : (
                    <span className="text-xs text-zinc-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
