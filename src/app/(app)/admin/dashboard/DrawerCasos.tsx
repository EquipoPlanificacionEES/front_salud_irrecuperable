"use client";

import { useState } from "react";
import { useDashboardCases } from "@/lib/dashboard-queries";
import {
  ETIQUETA_ATENCION,
  ETIQUETA_ESTADO,
  ETIQUETA_ORIENTACION,
  ETIQUETA_PERFIL,
  type FiltrosDashboard,
} from "@/lib/dashboard";

/**
 * LOS CASOS DETRÁS DE UN NÚMERO — panel lateral paginado.
 *
 * Lo pide al backend por segmento (`GET /admin/dashboard/cases`), con los MISMOS
 * filtros del panel: lo que se ve aquí es exactamente lo que se contó.
 */

const POR_PAGINA = 25;

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export function DrawerCasos({
  filtros,
  segmento,
  titulo,
  onCerrar,
}: {
  filtros: FiltrosDashboard;
  segmento: string;
  titulo: string;
  onCerrar: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const { data, isPending, error } = useDashboardCases(filtros, segmento, { limit: POR_PAGINA, offset });

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={onCerrar}>
      <aside
        role="dialog"
        aria-label={titulo}
        className="flex h-full w-full max-w-4xl flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[var(--atm-linea)] px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">{titulo}</h3>
            {data && <p className="text-xs text-zinc-500">{data.total} caso{data.total === 1 ? "" : "s"}</p>}
          </div>
          <button type="button" onClick={onCerrar} className="rounded-lg border border-[var(--atm-linea)] px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-50">
            Cerrar
          </button>
        </header>

        <div className="flex-1 overflow-auto px-5 py-3">
          {error ? (
            <p role="alert" className="text-sm text-[var(--atm-mal)]">No se pudieron cargar los casos.</p>
          ) : isPending || !data ? (
            <p className="text-sm text-zinc-400">Cargando…</p>
          ) : data.cases.length === 0 ? (
            <p className="text-sm text-zinc-400">Sin casos en este segmento.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left text-zinc-500">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Trámite</th>
                  <th className="py-1.5 pr-3 font-medium">Semana</th>
                  <th className="py-1.5 pr-3 font-medium">Médico</th>
                  <th className="py-1.5 pr-3 font-medium">Orientación presentada</th>
                  <th className="py-1.5 pr-3 font-medium">Pronunciamiento</th>
                  <th className="py-1.5 pr-3 font-medium">Estado</th>
                  <th className="py-1.5 pr-3 font-medium">Inicio revisión</th>
                  <th className="py-1.5 pr-3 font-medium">Ratificado</th>
                  <th className="py-1.5 pr-3 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {data.cases.map((c) => (
                  <tr key={c.caseId} className="border-t border-[var(--atm-linea)] align-top">
                    <td className="py-1.5 pr-3 font-mono text-zinc-800">{c.externalCaseId}</td>
                    <td className="py-1.5 pr-3 text-zinc-600">{c.batchName ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-zinc-600">{c.doctorName ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-zinc-700">
                      {c.presentedOrientation ? ETIQUETA_ORIENTACION[c.presentedOrientation] ?? c.presentedOrientation : "—"}
                      {c.firstOrientation && c.firstOrientation !== c.presentedOrientation && (
                        <span className="block text-[11px] text-zinc-400">
                          antes: {ETIQUETA_ORIENTACION[c.firstOrientation] ?? c.firstOrientation}
                        </span>
                      )}
                      {c.evidenceProfile && <span className="block text-[11px] text-zinc-400">{ETIQUETA_PERFIL[c.evidenceProfile] ?? c.evidenceProfile}</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-zinc-700">
                      {c.doctorDetermination ? ETIQUETA_ORIENTACION[c.doctorDetermination] : "—"}
                      {c.corrections > 0 && <span className="block text-[11px] text-zinc-400">con corrección</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-zinc-700">{ETIQUETA_ESTADO[c.status]}</td>
                    <td className="py-1.5 pr-3 text-zinc-600">{c.reviewStartedAt ? fecha(c.reviewStartedAt) : "sin registro"}</td>
                    <td className="py-1.5 pr-3 text-zinc-600">{fecha(c.ratifiedAt)}</td>
                    <td className="py-1.5 pr-3 text-zinc-600">{c.attentionReason ? ETIQUETA_ATENCION[c.attentionReason] ?? c.attentionReason : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {data && data.total > POR_PAGINA && (
          <footer className="flex items-center justify-between border-t border-[var(--atm-linea)] px-5 py-2 text-xs text-zinc-600">
            <span>
              {offset + 1}–{Math.min(offset + POR_PAGINA, data.total)} de {data.total}
            </span>
            <span className="flex gap-2">
              <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - POR_PAGINA))} className="rounded border border-[var(--atm-linea)] px-2 py-1 disabled:opacity-40">
                Anterior
              </button>
              <button type="button" disabled={offset + POR_PAGINA >= data.total} onClick={() => setOffset(offset + POR_PAGINA)} className="rounded border border-[var(--atm-linea)] px-2 py-1 disabled:opacity-40">
                Siguiente
              </button>
            </span>
          </footer>
        )}
      </aside>
    </div>
  );
}
