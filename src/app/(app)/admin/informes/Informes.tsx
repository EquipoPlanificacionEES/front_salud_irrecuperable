"use client";

import { Fragment, useState } from "react";
import { ApiFallo } from "@/lib/api";
import { useBatches, useReports } from "@/lib/queries";
import {
  ORIENTATION_LABEL,
  ORIENTATION_REASON_FILTER_LABEL,
  WORKFLOW_FILTER_LABEL,
  WORKFLOW_LABEL,
  type Orientation,
  type OrientationReasonCategory,
  type ReportWorkflowStatus,
} from "@/lib/backend";
import { Refrescando, TablaSkeleton } from "@/components/Skeleton";
import { OrientacionCelda, OrientationReviewCard } from "@/components/OrientationReviewCard";
import { Aviso, Chip, FilaVacia, Select, Tabla, workflowTono } from "../ui";

// GET /api/v1/reports?batchId=&workflowStatus=&orientation=&limit=&offset=
// GET /api/v1/reports/:id/orientation-review  (fundamento de la orientación IA)
// GET /api/v1/reports/:id/download          (PRE_REPORT .docx)
// GET /api/v1/reports/:id/signed-document   (informe final firmado .docx)

const ORDEN: ReportWorkflowStatus[] = ["READY_FOR_REVIEW", "CHANGES_REQUESTED", "APPROVED", "SIGNING", "SIGNED", "SIGNING_FAILED"];
const ORIENTACIONES: Orientation[] = ["RECOVERABLE", "IRRECOVERABLE", "INDETERMINATE"];
const COLUMNAS = ["Nº trámite", "Semana", "Médico", "Versión", "Estado", "Orientación", ""];

export function Informes() {
  const [fBatch, setFBatch] = useState("");
  const [fWf, setFWf] = useState("");
  const [fOri, setFOri] = useState("");
  /** Motivo de indeterminación: filtro de CLIENTE sobre las filas cargadas. */
  const [fMotivo, setFMotivo] = useState("");
  /** Qué fila tiene desplegado el fundamento. */
  const [abierto, setAbierto] = useState<string | null>(null);

  // Las semanas las comparten cinco pantallas. Cinco minutos de frescura: un
  // lote se abre o se cierra a mano, no cambia solo.
  const { data: semanas = [] } = useBatches();
  const filtros = {
    batchId: fBatch || undefined,
    workflowStatus: fWf || undefined,
    orientation: fOri || undefined,
    limit: 100,
  };
  const { data, error: fallo, isPending, isFetching } = useReports(filtros);

  const reports = data?.reports ?? [];
  const total = data?.total ?? 0;
  const counts = (data?.countsByWorkflowStatus ?? {}) as Partial<Record<ReportWorkflowStatus, number>>;
  const msg = fallo ? (fallo instanceof ApiFallo ? fallo.message : "No se pudo cargar.") : null;

  // Motivos presentes entre las indeterminadas cargadas.
  const indeterminadas = reports.filter((r) => r.orientationAssessment === "INDETERMINATE");
  const motivos = [
    ...new Set(
      indeterminadas.map((r) => r.orientationReason?.category).filter((c): c is OrientationReasonCategory => Boolean(c)),
    ),
  ];
  const motivoActivo = motivos.includes(fMotivo as OrientationReasonCategory) ? fMotivo : "";
  const visibles = motivoActivo
    ? reports.filter(
        (r) => r.orientationAssessment === "INDETERMINATE" && r.orientationReason?.category === motivoActivo,
      )
    : reports;

  /**
   * CONTADORES POR TEXTO VISIBLE. Tres estados se ven como «Ratificado»: una
   * chapa por estado repetiría el mismo texto tres veces. Se suman bajo su
   * texto, en el orden del circuito.
   */
  const porEstadoVisible: { etiqueta: string; total: number; tono: ReturnType<typeof workflowTono> }[] = [];
  for (const w of ORDEN) {
    const n = counts[w] ?? 0;
    if (n === 0) continue;
    const previo = porEstadoVisible.find((e) => e.etiqueta === WORKFLOW_LABEL[w]);
    if (previo) previo.total += n;
    else porEstadoVisible.push({ etiqueta: WORKFLOW_LABEL[w], total: n, tono: workflowTono(w) });
  }

  const porOrientacion = ORIENTACIONES.map((o) => [o, reports.filter((r) => r.orientationAssessment === o).length] as const)
    .filter(([, n]) => n > 0);
  const porMotivo = new Map<string, number>();
  for (const r of indeterminadas) {
    const l = r.orientationReason?.label;
    if (l) porMotivo.set(l, (porMotivo.get(l) ?? 0) + 1);
  }

  // Cambiar de filtro NO desmonta la tabla: `placeholderData` conserva el
  // resultado anterior mientras llega el nuevo.
  if (isPending) return <TablaSkeleton filas={10} columnas={6} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--atm-linea)] bg-white p-3 text-sm shadow-sm">
        <Select value={fBatch} onChange={(e) => setFBatch(e.target.value)}>
          <option value="">Todas las semanas</option>
          {semanas.map(({ batch }) => (
            <option key={batch.id} value={batch.id}>
              {batch.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Filtrar por estado" value={fWf} onChange={(e) => setFWf(e.target.value)}>
          <option value="">Cualquier estado</option>
          {ORDEN.map((w) => (
            <option key={w} value={w}>
              {WORKFLOW_FILTER_LABEL[w]}
            </option>
          ))}
        </Select>
        <Select aria-label="Filtrar por orientación IA" value={fOri} onChange={(e) => setFOri(e.target.value)}>
          <option value="">Todas las orientaciones</option>
          {ORIENTACIONES.map((o) => (
            <option key={o} value={o}>
              {ORIENTATION_LABEL[o]}
            </option>
          ))}
        </Select>
        {motivos.length > 0 && (
          <Select
            aria-label="Motivo de indeterminación"
            value={motivoActivo}
            onChange={(e) => setFMotivo(e.target.value)}
          >
            <option value="">Cualquier motivo (indeterminadas)</option>
            {motivos.map((c) => (
              <option key={c} value={c}>
                {ORIENTATION_REASON_FILTER_LABEL[c]}
              </option>
            ))}
          </Select>
        )}
        <span className="ml-auto flex items-center gap-3 text-zinc-400">
          <Refrescando visible={isFetching} />
          {total} informe(s)
        </span>
      </div>

      {porEstadoVisible.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {porEstadoVisible.map(({ etiqueta, total: n, tono }) => (
            <Chip key={etiqueta} tono={tono}>
              {etiqueta}: {n}
            </Chip>
          ))}
        </div>
      )}

      {porOrientacion.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>Orientación IA (filas cargadas):</span>
          {porOrientacion.map(([o, n]) => (
            <Chip key={o}>
              {ORIENTATION_LABEL[o]}: {n}
            </Chip>
          ))}
          {[...porMotivo].map(([l, n]) => (
            <span key={l} title={l} className="max-w-56 truncate rounded-full border border-[var(--atm-linea)] px-2 py-0.5">
              Indeterminada · {l}: {n}
            </span>
          ))}
        </div>
      )}

      {msg && <Aviso ok={false}>{msg}</Aviso>}

      <Tabla columnas={COLUMNAS}>
        {visibles.length === 0 && (
          <FilaVacia cols={COLUMNAS.length}>Sin informes. Aparecen cuando un caso se procesa.</FilaVacia>
        )}
        {visibles.map((r) => (
          <Fragment key={r.reportId}>
            <tr className="border-t border-[var(--atm-linea)] align-top hover:bg-[var(--atm-fondo)]">
              <td className="px-4 py-2.5 font-mono text-xs text-zinc-800">{r.externalCaseId}</td>
              <td className="px-4 py-2.5 text-zinc-600">{r.batch?.name ?? "—"}</td>
              <td className="min-w-44 px-4 py-2.5 text-zinc-600">{r.doctor?.fullName ?? "—"}</td>
              <td className="px-4 py-2.5 text-zinc-600">v{r.version}</td>
              <td className="px-4 py-2.5">
                <Chip tono={workflowTono(r.workflowStatus)}>{WORKFLOW_LABEL[r.workflowStatus]}</Chip>
              </td>
              <td className="px-4 py-2.5">
                <OrientacionCelda assessment={r.orientationAssessment} reason={r.orientationReason} />
              </td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                <button
                  type="button"
                  aria-expanded={abierto === r.reportId}
                  onClick={() => setAbierto((v) => (v === r.reportId ? null : r.reportId))}
                  className="mr-1 rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                >
                  {abierto === r.reportId ? "Ocultar fundamento" : "Ver fundamento"}
                </button>
                <a
                  href={`/api/v1/reports/${r.reportId}/download`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs text-[var(--atm-azul)] hover:bg-blue-50"
                >
                  Preinforme
                </a>
                {r.signedAt && (
                  <a
                    href={`/api/v1/reports/${r.reportId}/signed-document`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-1 rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs text-[var(--atm-azul)] hover:bg-blue-50"
                  >
                    Firmado
                  </a>
                )}
              </td>
            </tr>
            {abierto === r.reportId && (
              <tr className="border-t border-[var(--atm-linea)] bg-[var(--atm-fondo)]">
                <td colSpan={COLUMNAS.length} className="px-4 py-3">
                  <OrientationReviewCard reportId={r.reportId} enabled />
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </Tabla>
    </div>
  );
}
