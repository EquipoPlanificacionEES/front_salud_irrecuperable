"use client";

import { Fragment, useEffect, useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import { useBatches, useInvalidarCorreccion, useReports, useVersionesInforme } from "@/lib/queries";
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
import { DescargasFirmadas } from "@/components/DescargasFirmadas";
import { Aviso, Chip, FilaVacia, Select, Tabla, workflowTono } from "../ui";

// GET /api/v1/reports?batchId=&workflowStatus=&orientation=&limit=&offset=
// GET /api/v1/reports/:id/orientation-review  (fundamento de la orientación IA)
// GET /api/v1/reports/:id/download          (PRE_REPORT .docx)
// GET /api/v1/reports/:id/signed-document?format=docx|pdf  (informe firmado; la ruta la trae `signedDocuments`)

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
  /** Nº de trámite pedido desde el dashboard («Ver expediente»). Filtro de CLIENTE. */
  const [fTramite, setFTramite] = useState("");
  /** Qué informe firmado tiene abierto el cuadro de «Habilitar corrección». */
  const [habilitando, setHabilitando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [accion, setAccion] = useState<{ ok: boolean; texto: string } | null>(null);
  /** Qué fila tiene desplegado el historial de versiones. */
  const [historial, setHistorial] = useState<string | null>(null);
  const invalidarCorreccion = useInvalidarCorreccion();

  /**
   * HABILITAR LA CORRECCIÓN DE UN INFORME FIRMADO.
   *
   * No modifica el informe ni crea ninguna versión: autoriza al médico asignado
   * a corregirlo. El documento firmado sigue siendo el vigente hasta que el
   * médico inicie y vuelva a firmar.
   */
  async function habilitarCorreccion(reportId: string) {
    if (motivo.trim().length < 10) {
      setAccion({ ok: false, texto: "El motivo debe tener al menos 10 caracteres." });
      return;
    }
    setBusy(true);
    setAccion(null);
    try {
      await api(`/reports/${reportId}/post-sign-correction`, { json: { reason: motivo.trim() } });
      setAccion({
        ok: true,
        texto: "Corrección habilitada. El médico asignado verá el aviso y podrá iniciarla.",
      });
      setHabilitando(null);
      setMotivo("");
      await invalidarCorreccion(reportId);
    } catch (e) {
      setAccion({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo habilitar." });
    } finally {
      setBusy(false);
    }
  }

  // Llegar desde «Ver expediente» del dashboard: `?semana=<lote>&tramite=<nº>`.
  // Se lee DESPUÉS de montar para que el servidor y el cliente pinten lo mismo.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const semana = p.get("semana");
    const tramite = p.get("tramite");
    if (semana) setFBatch(semana);
    if (tramite) setFTramite(tramite);
  }, []);

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
  const visibles = (motivoActivo
    ? reports.filter(
        (r) => r.orientationAssessment === "INDETERMINATE" && r.orientationReason?.category === motivoActivo,
      )
    : reports
  ).filter((r) => !fTramite || r.externalCaseId === fTramite);

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
        {fTramite && (
          <button
            type="button"
            onClick={() => setFTramite("")}
            title="Quitar el filtro por trámite"
            className="rounded-full border border-[var(--atm-linea)] px-2.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50"
          >
            Trámite {fTramite} ✕
          </button>
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
      {accion && <Aviso ok={accion.ok}>{accion.texto}</Aviso>}

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
                {/* LA ÚLTIMA VERSIÓN FIRMADA del expediente, en Word y PDF. Durante
                    una corrección no es la versión de esta fila: por eso la ruta
                    la trae el servidor y no se arma con `r.reportId`. */}
                {r.signedDocuments ? (
                  <span className="ml-1 inline-flex align-middle">
                    <DescargasFirmadas documentos={r.signedDocuments} compacto />
                  </span>
                ) : (
                  r.signedAt &&
                  r.signedDocuments === undefined && (
                    <a
                      href={`/api/v1/reports/${r.reportId}/signed-document`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1 rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs text-[var(--atm-azul)] hover:bg-blue-50"
                    >
                      Firmado
                    </a>
                  )
                )}
                <button
                  type="button"
                  aria-expanded={historial === r.reportId}
                  onClick={() => setHistorial((v) => (v === r.reportId ? null : r.reportId))}
                  className="ml-1 rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                >
                  Historial
                </button>
                {/* Corregir un informe FIRMADO exige habilitarlo antes: el
                    médico no puede reabrirlo por su cuenta. */}
                {r.signedAt && (
                  <button
                    type="button"
                    onClick={() => {
                      setHabilitando((v) => (v === r.reportId ? null : r.reportId));
                      setMotivo("");
                      setAccion(null);
                    }}
                    className="ml-1 rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs font-medium text-[var(--atm-obs)] hover:bg-amber-50"
                  >
                    Habilitar corrección
                  </button>
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
            {habilitando === r.reportId && (
              <tr className="border-t border-[var(--atm-linea)] bg-amber-50/40">
                <td colSpan={COLUMNAS.length} className="px-4 py-3">
                  <div className="max-w-2xl space-y-2">
                    <p className="text-sm font-medium text-zinc-800">
                      Corregir informe firmado · trámite {r.externalCaseId} · versión {r.version}
                    </p>
                    <p className="text-xs text-zinc-600">
                      Médico: {r.doctor?.fullName ?? "sin asignación vigente"}
                    </p>
                    <label className="block text-xs text-zinc-600" htmlFor={`motivo-${r.reportId}`}>
                      Motivo de corrección
                    </label>
                    <textarea
                      id={`motivo-${r.reportId}`}
                      rows={3}
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Motivo de la corrección (mín. 10 caracteres)"
                      className="w-full rounded-lg border border-[var(--atm-linea)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--atm-azul2)]"
                    />
                    <p className="text-xs text-zinc-600">
                      El informe firmado actual no será modificado ni eliminado. Si el médico inicia la
                      corrección, se generará una nueva versión. La versión anterior permanecerá disponible
                      en el historial.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setHabilitando(null);
                          setMotivo("");
                        }}
                        className="rounded-lg border border-[var(--atm-linea)] px-3 py-1 text-xs text-zinc-600"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => habilitarCorreccion(r.reportId)}
                        disabled={busy || motivo.trim().length < 10}
                        className="rounded-lg bg-[var(--atm-azul)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        {busy ? "Habilitando…" : "Habilitar corrección"}
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {historial === r.reportId && (
              <tr className="border-t border-[var(--atm-linea)] bg-[var(--atm-fondo)]">
                <td colSpan={COLUMNAS.length} className="px-4 py-3">
                  <HistorialVersiones reportId={r.reportId} />
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </Tabla>
    </div>
  );
}

/**
 * EL HISTORIAL DE VERSIONES DEL EXPEDIENTE.
 *
 * Una versión firmada que fue reemplazada NO desaparece: sigue aquí, con sus
 * documentos descargables. Es lo que permite explicar, meses después, por qué
 * hay dos informes firmados del mismo trámite y cuál vale.
 */
function HistorialVersiones({ reportId }: { reportId: string }) {
  const { data, isPending, error } = useVersionesInforme(reportId, true);
  if (isPending) return <p className="text-xs text-zinc-500">Cargando historial…</p>;
  if (error || !data) return <p className="text-xs text-[var(--atm-mal)]">No se pudo cargar el historial.</p>;

  return (
    <table className="w-full text-xs">
      <thead className="text-zinc-500">
        <tr>
          <th className="py-1 text-left font-medium">Versión</th>
          <th className="py-1 text-left font-medium">Estado</th>
          <th className="py-1 text-left font-medium">Pronunciamiento</th>
          <th className="py-1 text-left font-medium">Ratificada</th>
          <th className="py-1 text-left font-medium">Firmada</th>
          <th className="py-1 text-left font-medium">Médico</th>
          <th className="py-1 text-left font-medium">Motivo de corrección</th>
          <th className="py-1 text-right font-medium">Documentos</th>
        </tr>
      </thead>
      <tbody>
        {data.versions.map((v) => (
          <tr key={v.reportSnapshotId} className="border-t border-[var(--atm-linea)]">
            <td className="py-1.5 text-zinc-700">v{v.version}</td>
            <td className="py-1.5">
              {/* Una corrección abierta todavía no reemplaza a nadie: no está firmada. */}
              <Chip tono={v.current ? "ok" : "neutral"}>
                {v.current ? "Vigente" : v.signedAt ? "Reemplazada" : "Sin firmar"}
              </Chip>
            </td>
            <td className="py-1.5 text-zinc-600">{v.determination ?? "—"}</td>
            <td className="py-1.5 text-zinc-600">{v.approvedAt?.slice(0, 10) ?? "—"}</td>
            <td className="py-1.5 text-zinc-600">{v.signedAt?.slice(0, 10) ?? "—"}</td>
            <td className="py-1.5 text-zinc-600">{v.doctorName ?? "—"}</td>
            <td className="max-w-64 truncate py-1.5 text-zinc-600" title={v.correctionReason ?? undefined}>
              {v.correctionReason ?? "—"}
            </td>
            <td className="py-1.5 text-right whitespace-nowrap">
              {/* Los documentos de ESTA versión: una histórica baja la histórica,
                  nunca la vigente. Una versión sin firmar no ofrece nada. */}
              {v.signedDocuments !== undefined ? (
                v.signedDocuments ? (
                  <DescargasFirmadas documentos={v.signedDocuments} compacto conVersion />
                ) : (
                  <span className="text-zinc-400">—</span>
                )
              ) : (
                <>
              {/* API anterior: la URL la compone el backend igualmente. */}
              {v.finalArtifact && (
                <a
                  href={v.finalArtifact.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-[var(--atm-linea)] px-2 py-0.5 text-[var(--atm-azul)] hover:bg-blue-50"
                >
                  Word
                </a>
              )}
              {v.finalPdfArtifact && (
                <a
                  href={v.finalPdfArtifact.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 rounded-lg border border-[var(--atm-linea)] px-2 py-0.5 text-[var(--atm-azul)] hover:bg-blue-50"
                >
                  PDF
                </a>
              )}
              {!v.finalArtifact && !v.finalPdfArtifact && <span className="text-zinc-400">—</span>}
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
