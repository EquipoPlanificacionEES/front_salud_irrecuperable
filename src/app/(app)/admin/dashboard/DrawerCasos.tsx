"use client";

import { useEffect, useRef, useState } from "react";
import { useDashboardCases } from "@/lib/dashboard-queries";
import {
  DETALLE_ATENCION,
  ETIQUETA_ATENCION,
  ETIQUETA_CAUSA,
  ETIQUETA_ESTADO,
  ETIQUETA_ORIENTACION,
  ETIQUETA_PERFIL,
  ETIQUETA_PRONUNCIAMIENTO,
  formatoDuracion,
  nombreSemana,
  type CasoDashboard,
  type FiltrosDashboard,
} from "@/lib/dashboard";
import { Boton, Esqueleto, Icono, Insignia, Vacio, type Tono } from "./componentes";

/**
 * LOS CASOS DETRÁS DE UN NÚMERO — panel lateral paginado.
 *
 * Lo pide al backend por segmento (`GET /admin/dashboard/cases`), con los MISMOS
 * filtros del panel: lo que se ve aquí es exactamente lo que se contó.
 *
 * «Ver expediente» es un enlace a Informes filtrado por el trámite: no llama a
 * ningún comando. Desde administración NO se registra inicio de revisión médica;
 * eso sólo ocurre con el «Revisar» del médico en su bandeja.
 */

const POR_PAGINA = 25;

export const TONO_ORIENTACION: Record<string, Tono> = { RECOVERABLE: "verde", IRRECOVERABLE: "gris", INDETERMINATE: "violeta" };

export function InsigniaOrientacion({ valor }: { valor: string | null }) {
  if (!valor) return <span className="text-slate-400">—</span>;
  return (
    <Insignia tono={TONO_ORIENTACION[valor] ?? "gris"} punto>
      {ETIQUETA_ORIENTACION[valor] ?? valor}
    </Insignia>
  );
}

function tipoDeCierre(c: CasoDashboard): string {
  if (!c.reportId) return "—";
  if (c.status === "FINALIZED") return c.requiresExplicitPronouncement ? "Pronunciamiento explícito" : "Ratificación directa";
  return c.requiresExplicitPronouncement ? "Requiere pronunciamiento explícito" : "Ratificación directa posible";
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-slate-500">{etiqueta}</dt>
      <dd className="mt-0.5 text-[13px] font-medium text-slate-800">{children}</dd>
    </div>
  );
}

export function TarjetaCaso({ caso: c }: { caso: CasoDashboard }) {
  const avisos: { texto: string; detalle?: string; tono: Tono }[] = c.attentionReasons.map((r) => ({
    texto: ETIQUETA_ATENCION[r] ?? r,
    detalle: DETALLE_ATENCION[r],
    tono: r === "SIGNING_FAILED" || r === "PROCESSING_FAILED" || r === "PRE_REPORT_FAILED" || r === "PDF_FAILED" || r === "PROCESSING_RETRY_FAILED" ? "rojo" : r === "REQUIRES_PRONOUNCEMENT" ? "violeta" : "ambar",
  }));
  if (c.specialReview && !c.attentionReasons.includes("CONTRADICTORY_EVIDENCE")) avisos.push({ texto: "Revisión especial", tono: "ambar" });
  if (c.identitySeverity === "INFORMATIONAL") avisos.push({ texto: "Nombre con diferencia informativa respecto de la planilla", tono: "gris" });
  const href = `/admin/informes?${new URLSearchParams({ ...(c.batchId ? { semana: c.batchId } : {}), tramite: c.externalCaseId })}`;

  return (
    <article aria-label={`Caso ${c.externalCaseId}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-slate-500">#{c.externalCaseId}</p>
          <p className="truncate text-sm font-semibold text-slate-900">{c.doctorName ?? "Sin médico asignado"}</p>
        </div>
        <InsigniaOrientacion valor={c.presentedOrientation} />
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
        <Campo etiqueta="Orientación IA presentada">
          {c.presentedOrientation ? ETIQUETA_ORIENTACION[c.presentedOrientation] : "—"}
          {c.firstOrientation && c.firstOrientation !== c.presentedOrientation && (
            <span className="block text-[11px] font-normal text-slate-500">
              primera: {ETIQUETA_ORIENTACION[c.firstOrientation] ?? c.firstOrientation}
            </span>
          )}
        </Campo>
        <Campo etiqueta="Pronunciamiento médico">{c.doctorDetermination ? ETIQUETA_PRONUNCIAMIENTO[c.doctorDetermination] : "Pendiente"}</Campo>
        <Campo etiqueta="Semana">{nombreSemana(c.batchName)}</Campo>
        <Campo etiqueta="Estado">{ETIQUETA_ESTADO[c.status]}</Campo>
        <Campo etiqueta="Perfil de evidencia">{c.evidenceProfile ? (ETIQUETA_PERFIL[c.evidenceProfile] ?? c.evidenceProfile) : "—"}</Campo>
        <Campo etiqueta="Tipo de cierre">{tipoDeCierre(c)}</Campo>
        <Campo etiqueta="Tiempo operacional">{c.operationalSeconds === null ? "—" : formatoDuracion(c.operationalSeconds)}</Campo>
        <Campo etiqueta="Tiempo médico">{c.medicalCycleSeconds === null ? "Sin registro" : formatoDuracion(c.medicalCycleSeconds)}</Campo>
        {c.orientationReason && c.presentedOrientation === "INDETERMINATE" && (
          <Campo etiqueta="Motivo de indeterminación">{ETIQUETA_CAUSA[c.orientationReason.category] ?? c.orientationReason.label}</Campo>
        )}
      </dl>

      {avisos.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {avisos.map((a) => (
            <li key={a.texto} className="flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-700">
              <Insignia tono={a.tono}>{a.texto}</Insignia>
              {a.detalle && <span className="pt-0.5 text-slate-500">{a.detalle}</span>}
            </li>
          ))}
        </ul>
      )}

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Ver expediente
        <Icono nombre="flecha" className="h-3.5 w-3.5" />
      </a>
    </article>
  );
}

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
  const { data, isPending, error, refetch, isFetching } = useDashboardCases(filtros, segmento, { limit: POR_PAGINA, offset });
  const cerrar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cerrar.current?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/25 backdrop-blur-[2px]" onClick={onCerrar}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="flex h-full w-full max-w-xl flex-col bg-slate-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">{titulo}</h3>
            <p className="mt-0.5 text-[13px] text-slate-500">
              {data ? `${data.total} caso${data.total === 1 ? "" : "s"} en la selección` : "Cargando casos…"} · los filtros globales se mantienen
              activos
            </p>
          </div>
          <button ref={cerrar} type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <Icono nombre="cerrar" />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4" aria-busy={isFetching}>
          {error ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              No se pudieron cargar los casos.
              <Boton className="ml-3" onClick={() => void refetch()}>
                Reintentar
              </Boton>
            </div>
          ) : isPending || !data ? (
            [0, 1, 2].map((i) => <Esqueleto key={i} className="h-44" />)
          ) : data.cases.length === 0 ? (
            <Vacio>Sin casos en este segmento con los filtros actuales.</Vacio>
          ) : (
            data.cases.map((c) => <TarjetaCaso key={c.caseId} caso={c} />)
          )}
        </div>

        {data && data.total > POR_PAGINA && (
          <footer className="flex items-center justify-between border-t border-slate-200 bg-white px-5 py-2.5 text-[13px] text-slate-600">
            <span className="tabular-nums">
              {offset + 1}–{Math.min(offset + POR_PAGINA, data.total)} de {data.total}
            </span>
            <span className="flex gap-2">
              <Boton disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - POR_PAGINA))}>
                Anterior
              </Boton>
              <Boton disabled={offset + POR_PAGINA >= data.total} onClick={() => setOffset(offset + POR_PAGINA)}>
                Siguiente
              </Boton>
            </span>
          </footer>
        )}
      </aside>
    </div>
  );
}
