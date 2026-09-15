"use client";

import { useEffect, useState } from "react";
import { useBatches } from "@/lib/queries";
import { useDashboardOverview } from "@/lib/dashboard-queries";
import {
  AYUDA,
  ETIQUETA_ATENCION,
  ETIQUETA_ESTADO,
  ETIQUETA_ORIENTACION,
  ETIQUETA_PERFIL,
  ETIQUETA_TRAMO,
  ORDEN_TRAMOS,
  etiquetaCampo,
  formatoDuracion,
  formatoN,
  formatoPorcentaje,
  type DashboardOverview,
  type FiltrosDashboard,
} from "@/lib/dashboard";
import { Barra, FilaTiempo, Seccion, Tarjeta, Vacio } from "./componentes";
import { DrawerCasos } from "./DrawerCasos";

/**
 * DASHBOARD ADMIN.
 *
 * Todo número sale de `GET /admin/dashboard/overview`, que agrega en SQL sobre
 * el ámbito activo. Esta pantalla no recalcula nada: formatea, nombra y abre el
 * drilldown. Las métricas son OPERACIONALES — nada aquí es un ranking clínico —.
 */

type Drill = { segmento: string; titulo: string } | null;

export function Dashboard() {
  const [filtros, setFiltros] = useState<FiltrosDashboard>({});
  const [drill, setDrill] = useState<Drill>(null);
  const { data, isPending, isFetching, error } = useDashboardOverview(filtros);
  const lotes = useBatches();

  const set = <K extends keyof FiltrosDashboard>(k: K, v: FiltrosDashboard[K] | "") =>
    setFiltros((f) => {
      const n = { ...f };
      if (v === "" || v === undefined) delete n[k];
      else n[k] = v as FiltrosDashboard[K];
      return n;
    });

  // Opciones de médico / perfil / versión: las del ámbito sin ese filtro aplicado.
  const [opciones, setOpciones] = useState<{ medicos: { id: string; nombre: string }[]; perfiles: string[]; versiones: string[] }>({
    medicos: [],
    perfiles: [],
    versiones: [],
  });
  useEffect(() => {
    if (!data) return;
    setOpciones((o) => ({
      medicos: filtros.doctorProfileId ? o.medicos : data.medicalOperations.map((d) => ({ id: d.doctorProfileId, nombre: d.doctorName ?? d.doctorProfileId })),
      perfiles: filtros.evidenceProfile ? o.perfiles : data.evidenceQuality.map((e) => e.profile),
      versiones: filtros.policyVersion ? o.versiones : data.policyVersions.map((v) => v.version),
    }));
  }, [data, filtros.doctorProfileId, filtros.evidenceProfile, filtros.policyVersion]);

  const abrir = (segmento: string, titulo: string) => setDrill({ segmento, titulo });

  return (
    <div className="space-y-4">
      <Filtros
        filtros={filtros}
        set={set}
        lotes={(lotes.data ?? []).map((b) => ({ id: b.batch.id, nombre: b.batch.name }))}
        opciones={opciones}
        onLimpiar={() => setFiltros({})}
        actualizando={isFetching && !isPending}
      />

      {error ? (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-[var(--atm-mal)]">
          No se pudo cargar el dashboard.
        </p>
      ) : isPending || !data ? (
        <p className="text-sm text-zinc-400">Cargando métricas…</p>
      ) : (
        <Contenido d={data} abrir={abrir} />
      )}

      {drill && <DrawerCasos filtros={filtros} segmento={drill.segmento} titulo={drill.titulo} onCerrar={() => setDrill(null)} />}
    </div>
  );
}

function Filtros({
  filtros,
  set,
  lotes,
  opciones,
  onLimpiar,
  actualizando,
}: {
  filtros: FiltrosDashboard;
  set: <K extends keyof FiltrosDashboard>(k: K, v: FiltrosDashboard[K] | "") => void;
  lotes: { id: string; nombre: string }[];
  opciones: { medicos: { id: string; nombre: string }[]; perfiles: string[]; versiones: string[] };
  onLimpiar: () => void;
  actualizando: boolean;
}) {
  const sel = "rounded-lg border border-[var(--atm-linea)] bg-white px-2 py-1.5 text-xs";
  const campo = (label: string, control: React.ReactNode) => (
    <label className="flex flex-col gap-0.5 text-[11px] text-zinc-500">
      {label}
      {control}
    </label>
  );
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--atm-linea)] bg-white p-3 shadow-sm" aria-label="Filtros">
      {campo("Semana", (
        <select aria-label="Semana" className={sel} value={filtros.batchId ?? ""} onChange={(e) => set("batchId", e.target.value)}>
          <option value="">Todas</option>
          {lotes.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>
      ))}
      {campo("Médico", (
        <select aria-label="Médico" className={sel} value={filtros.doctorProfileId ?? ""} onChange={(e) => set("doctorProfileId", e.target.value)}>
          <option value="">Todos</option>
          {opciones.medicos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
      ))}
      {campo("Estado", (
        <select aria-label="Estado" className={sel} value={filtros.status ?? ""} onChange={(e) => set("status", e.target.value as FiltrosDashboard["status"])}>
          <option value="">Todos</option>
          {(["FINALIZED", "PENDING", "HOLD"] as const).map((s) => <option key={s} value={s}>{ETIQUETA_ESTADO[s]}</option>)}
        </select>
      ))}
      {campo("Orientación presentada IA", (
        <select aria-label="Orientación presentada IA" className={sel} value={filtros.presentedOrientation ?? ""} onChange={(e) => set("presentedOrientation", e.target.value as FiltrosDashboard["presentedOrientation"])}>
          <option value="">Todas</option>
          {(["RECOVERABLE", "IRRECOVERABLE", "INDETERMINATE"] as const).map((o) => <option key={o} value={o}>{ETIQUETA_ORIENTACION[o]}</option>)}
        </select>
      ))}
      {campo("Pronunciamiento médico", (
        <select aria-label="Pronunciamiento médico" className={sel} value={filtros.doctorDetermination ?? ""} onChange={(e) => set("doctorDetermination", e.target.value as FiltrosDashboard["doctorDetermination"])}>
          <option value="">Todos</option>
          {(["RECOVERABLE", "IRRECOVERABLE"] as const).map((o) => <option key={o} value={o}>{ETIQUETA_ORIENTACION[o]}</option>)}
        </select>
      ))}
      {campo("Perfil de evidencia", (
        <select aria-label="Perfil de evidencia" className={sel} value={filtros.evidenceProfile ?? ""} onChange={(e) => set("evidenceProfile", e.target.value)}>
          <option value="">Todos</option>
          {opciones.perfiles.map((p) => <option key={p} value={p}>{ETIQUETA_PERFIL[p] ?? p}</option>)}
        </select>
      ))}
      {campo("Versión de política", (
        <select aria-label="Versión de política" className={sel} value={filtros.policyVersion ?? ""} onChange={(e) => set("policyVersion", e.target.value)}>
          <option value="">Todas</option>
          {opciones.versiones.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      ))}
      {campo("Asignado desde", (
        <input aria-label="Asignado desde" type="date" className={sel} value={filtros.from ?? ""} onChange={(e) => set("from", e.target.value)} />
      ))}
      {campo("Asignado hasta", (
        <input aria-label="Asignado hasta" type="date" className={sel} value={filtros.to ?? ""} onChange={(e) => set("to", e.target.value)} />
      ))}
      <button type="button" onClick={onLimpiar} className="rounded-lg border border-[var(--atm-linea)] px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50">
        Limpiar
      </button>
      {actualizando && <span className="text-xs text-zinc-400">Actualizando…</span>}
    </div>
  );
}

function Contenido({ d, abrir }: { d: DashboardOverview; abrir: (segmento: string, titulo: string) => void }) {
  const s = d.summary;
  const ct = d.cycleTimes;
  const celda = (ai: string, doctor: string) => d.concordance.matrix.find((m) => m.ai === ai && m.doctor === doctor)?.n ?? 0;

  return (
    <>
      {/* A · RESUMEN EJECUTIVO */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Tarjeta etiqueta="Casos" valor={String(s.total)} onClick={() => abrir("all", "Todos los casos")} />
        <Tarjeta etiqueta="Finalizados" valor={String(s.finalized)} detalle={`Avance ${formatoPorcentaje(s.progressPercent)}`} onClick={() => abrir("status:FINALIZED", "Finalizados")} tono="ok" />
        <Tarjeta etiqueta="Pendientes" valor={String(s.pending)} detalle={s.onHold > 0 ? `+ ${s.onHold} retenido${s.onHold === 1 ? "" : "s"}` : undefined} onClick={() => abrir("status:PENDING", "Pendientes")} />
        <Tarjeta etiqueta="Concordancia IA–Médico" valor={formatoPorcentaje(s.concordancePercent)} detalle={`${formatoN(s.concordanceN)} casos comparables finalizados`} ayuda={AYUDA.concordancia} />
        <Tarjeta etiqueta="Overrides médicos" valor={String(s.overrides)} detalle={`${formatoPorcentaje(s.overridePercent)} · ${formatoN(s.concordanceN)}`} ayuda={AYUDA.override} tono={s.overrides > 0 ? "obs" : "neutral"} />
        <Tarjeta etiqueta="Tasa de indeterminación" valor={formatoPorcentaje(s.indeterminateRatePercent)} detalle={`${s.indeterminate} de ${s.withOrientation} con orientación`} ayuda={AYUDA.indeterminacion} onClick={() => abrir("indeterminate:ALL", "Orientación presentada indeterminada")} />
        <Tarjeta
          etiqueta="Tiempo de ciclo médico (mediana)"
          valor={formatoDuracion(s.medicalCycleP50)}
          detalle={s.medicalCycleN > 0 ? `P90 ${formatoDuracion(s.medicalCycleP90)} · ${formatoN(s.medicalCycleN, s.medicalCycleEligible)} con inicio registrado` : `Sin inicio de revisión registrado · ${formatoN(0, s.medicalCycleEligible)}`}
          ayuda={AYUDA.cicloMedico}
        />
        <Tarjeta etiqueta="Tiempo técnico de firma (mediana)" valor={formatoDuracion(s.signatureP50)} detalle={formatoN(s.signatureN)} ayuda={AYUDA.firma} />
        <Tarjeta etiqueta="Retenciones activas" valor={String(s.holdsActive)} onClick={() => abrir("attention:HOLD_ACTIVE", "Retenciones activas")} tono={s.holdsActive > 0 ? "obs" : "neutral"} />
        <Tarjeta etiqueta="Errores técnicos" valor={String(s.technicalFailures)} onClick={() => abrir("technical_failure", "Casos con error técnico")} tono={s.technicalFailures > 0 ? "mal" : "neutral"} />
        <Tarjeta etiqueta="Preinformes ratificados sin modificación" valor={formatoPorcentaje(d.preReportUsable.percent)} detalle={`${d.preReportUsable.unmodified} de ${formatoN(d.preReportUsable.finalized)} finalizados`} ayuda={AYUDA.preinforme} onClick={() => abrir("intervention:UNMODIFIED", "Ratificados sin modificación")} />
        <Tarjeta etiqueta="Requirió pronunciamiento explícito" valor={formatoPorcentaje(d.resolutionPath.finalizedExplicitPercent)} detalle={`${d.resolutionPath.finalizedExplicit} finalizados · ${d.resolutionPath.pendingExplicit} pendientes`} ayuda={AYUDA.resolucion} onClick={() => abrir("resolution:EXPLICIT", "Requirió pronunciamiento explícito")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* B · CONCORDANCIA */}
        <Seccion titulo="Concordancia IA–Médico" ayuda={`${AYUDA.concordancia} ${formatoN(d.concordance.comparable)}.`}>
          <table className="w-full text-sm" aria-label="Matriz de concordancia">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-1 text-left font-medium">Orientación presentada IA ↓ · Médico →</th>
                <th className="py-1 font-medium">Recuperable</th>
                <th className="py-1 font-medium">No recuperable</th>
              </tr>
            </thead>
            <tbody>
              {(["RECOVERABLE", "IRRECOVERABLE", "INDETERMINATE"] as const).map((ai) => {
                const indet = ai === "INDETERMINATE";
                return (
                  <tr key={ai} className={indet ? "bg-zinc-50 text-zinc-500" : ""} data-fila={ai}>
                    <td className="py-1.5 pr-2 text-xs">
                      {ETIQUETA_ORIENTACION[ai]}
                      {indet && <span className="block text-[11px] italic">resuelta por el médico · fuera de la concordancia</span>}
                    </td>
                    {(["RECOVERABLE", "IRRECOVERABLE"] as const).map((doc) => {
                      const n = celda(ai, doc);
                      const coincide = !indet && ai === doc;
                      return (
                        <td key={doc} className="py-1 text-center">
                          <button
                            type="button"
                            disabled={n === 0}
                            onClick={() => abrir(`matrix:${ai}:${doc}`, `IA ${ETIQUETA_ORIENTACION[ai]} → Médico ${ETIQUETA_ORIENTACION[doc]}`)}
                            aria-label={`IA ${ETIQUETA_ORIENTACION[ai]}, médico ${ETIQUETA_ORIENTACION[doc]}: ${n}`}
                            className={`w-full rounded px-2 py-1.5 font-medium ${
                              indet ? "text-zinc-500" : coincide ? "bg-green-50 text-[var(--atm-ok)]" : n > 0 ? "bg-amber-50 text-[var(--atm-obs)]" : "text-zinc-400"
                            } disabled:cursor-default`}
                          >
                            {n}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Seccion>

        {/* C · OVERRIDES */}
        <Seccion titulo="Overrides médicos" ayuda={AYUDA.override}>
          <Barra etiqueta={`Recuperable → No recuperable · ${formatoPorcentaje(d.overrides.recoverableToIrrecoverablePercent)}`} n={d.overrides.recoverableToIrrecoverable} total={d.overrides.comparable} onClick={() => abrir("override:RECOVERABLE_TO_IRRECOVERABLE", "Override Recuperable → No recuperable")} />
          <Barra etiqueta={`No recuperable → Recuperable · ${formatoPorcentaje(d.overrides.irrecoverableToRecoverablePercent)}`} n={d.overrides.irrecoverableToRecoverable} total={d.overrides.comparable} onClick={() => abrir("override:IRRECOVERABLE_TO_RECOVERABLE", "Override No recuperable → Recuperable")} />
          <p className="mt-2 text-xs text-zinc-500">{formatoN(d.overrides.comparable)} casos comparables finalizados.</p>
        </Seccion>

        {/* D · INDETERMINADOS */}
        <Seccion titulo="Orientaciones indeterminadas">
          <div className="mb-3 grid grid-cols-4 gap-2 text-center">
            {[
              ["Total", d.indeterminateResolution.total, "indeterminate:ALL"],
              ["→ Recuperable", d.indeterminateResolution.resolvedToRecoverable, "indeterminate:RESOLVED_RECOVERABLE"],
              ["→ No recuperable", d.indeterminateResolution.resolvedToIrrecoverable, "indeterminate:RESOLVED_IRRECOVERABLE"],
              ["Pendientes", d.indeterminateResolution.pending, "indeterminate:PENDING"],
            ].map(([label, n, seg]) => (
              <button key={String(seg)} type="button" onClick={() => abrir(String(seg), `Indeterminadas · ${label}`)} className="rounded-lg border border-[var(--atm-linea)] px-2 py-2 hover:border-[var(--atm-azul2)]">
                <p className="text-lg font-semibold text-zinc-900">{n}</p>
                <p className="text-[11px] text-zinc-500">{label}</p>
              </button>
            ))}
          </div>
          <p className="mb-1 text-xs font-medium text-zinc-600">Motivos y bloqueadores</p>
          {d.indeterminateResolution.reasons.length === 0 ? (
            <Vacio>Sin motivos registrados.</Vacio>
          ) : (
            d.indeterminateResolution.reasons.slice(0, 10).map((r) => (
              <Barra key={r.code} etiqueta={r.code} n={r.n} total={d.indeterminateResolution.total} onClick={() => abrir(`reason:${r.code}`, `Motivo ${r.code}`)} />
            ))
          )}
        </Seccion>

        {/* E · EVOLUCIÓN DEL MOTOR */}
        <Seccion titulo="Cambio de orientación durante el procesamiento" ayuda={AYUDA.evolucion}>
          <p className="mb-2 text-xs text-zinc-600">
            Sin cambio: <strong>{d.orientationEvolution.unchanged}</strong> · Con cambio: <strong>{d.orientationEvolution.changed}</strong> · {formatoN(d.orientationEvolution.total)}
          </p>
          {d.orientationEvolution.transitions
            .filter((t) => t.first !== t.presented)
            .map((t) => (
              <Barra
                key={`${t.first}-${t.presented}`}
                etiqueta={`${ETIQUETA_ORIENTACION[t.first] ?? t.first} → ${ETIQUETA_ORIENTACION[t.presented] ?? t.presented}`}
                n={t.n}
                total={d.orientationEvolution.total}
                onClick={() => abrir(`evolution:${t.first}:${t.presented}`, "Cambio de orientación durante el procesamiento")}
              />
            ))}
          {d.orientationEvolution.changed === 0 && <Vacio>Ningún caso cambió de orientación antes de la revisión.</Vacio>}
        </Seccion>
      </div>

      {/* H · TIEMPOS */}
      <Seccion
        titulo="Tiempos del ciclo"
        ayuda={`Inicio de revisión registrado en ${ct.reviewStartCoverage.withValidStart} de ${ct.reviewStartCoverage.eligibleFinalized} finalizados (${formatoPorcentaje(ct.reviewStartCoverage.coveragePercent)}). Los casos sin registro no se estiman.`}
      >
        <div className="overflow-x-auto">
          <table className="w-full" aria-label="Tiempos del ciclo">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-1 font-medium">Etapa</th>
                <th className="px-3 py-1 font-medium">Mediana</th>
                <th className="px-3 py-1 font-medium">P75</th>
                <th className="px-3 py-1 font-medium">P90</th>
                <th className="px-3 py-1 font-medium">n</th>
                <th className="px-3 py-1 font-medium">Promedio</th>
              </tr>
            </thead>
            <tbody>
              <FilaTiempo etiqueta="Tiempo operacional hasta ratificación" metrica={ct.assignmentToRatification} ayuda={AYUDA.operacional} />
              <FilaTiempo etiqueta="Asignación → inicio de revisión" metrica={ct.assignmentToReviewStart} conCobertura />
              <FilaTiempo etiqueta="Tiempo de ciclo médico" metrica={ct.reviewStartToRatification} ayuda={AYUDA.cicloMedico} conCobertura />
              <FilaTiempo etiqueta="Tiempo técnico de firma" metrica={ct.ratificationToSignature} ayuda={AYUDA.firma} />
              <FilaTiempo etiqueta="Ciclo total desde revisión hasta informe firmado" metrica={ct.reviewStartToSignature} conCobertura />
              <FilaTiempo etiqueta="Tiempo operacional total" metrica={ct.assignmentToSignature} />
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(
            [
              ["reviewStartToRatification", "rs2r", "Distribución · tiempo de ciclo médico"],
              ["assignmentToRatification", "a2r", "Distribución · tiempo operacional hasta ratificación"],
            ] as const
          ).map(([clave, col, titulo]) => {
            const dist = ct.distribution[clave];
            const total = ORDEN_TRAMOS.reduce((t, k) => t + (dist[k] ?? 0), 0);
            return (
              <div key={clave}>
                <p className="mb-1 text-xs font-medium text-zinc-600">
                  {titulo} · {formatoN(total)}
                </p>
                {total === 0 ? (
                  <Vacio>Sin datos registrados.</Vacio>
                ) : (
                  ORDEN_TRAMOS.map((k) => (
                    <Barra key={k} etiqueta={ETIQUETA_TRAMO[k]} n={dist[k] ?? 0} total={total} onClick={() => abrir(`bucket:${col}:${k}`, `${titulo} · ${ETIQUETA_TRAMO[k]}`)} />
                  ))
                )}
              </div>
            );
          })}
        </div>
      </Seccion>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* F · EVIDENCIA */}
        <Seccion titulo="Calidad de evidencia">
          <TablaSimple
            columnas={["Perfil", "Casos", "Concordancia", "Override", "Indeterminación", "Ciclo médico"]}
            filas={d.evidenceQuality.map((e) => ({
              clave: e.profile,
              onClick: () => abrir(`evidence:${e.profile}`, ETIQUETA_PERFIL[e.profile] ?? e.profile),
              celdas: [
                ETIQUETA_PERFIL[e.profile] ?? e.profile,
                String(e.cases),
                `${formatoPorcentaje(e.concordancePercent)} · ${formatoN(e.comparable)}`,
                `${e.overrides} · ${formatoPorcentaje(e.overridePercent)}`,
                formatoPorcentaje(e.indeterminatePercent),
                e.cycleN > 0 ? `${formatoDuracion(e.cycleP50)} · ${formatoN(e.cycleN)}` : "—",
              ],
            }))}
          />
        </Seccion>

        {/* I · INTERVENCIÓN MÉDICA */}
        <Seccion titulo="Intervención médica">
          <Barra etiqueta="Ratificados sin modificación" n={d.interventions.unmodified} total={d.interventions.finalized} onClick={() => abrir("intervention:UNMODIFIED", "Ratificados sin modificación")} />
          <Barra etiqueta="Ratificados con corrección" n={d.interventions.corrected} total={d.interventions.finalized} onClick={() => abrir("intervention:CORRECTED", "Ratificados con corrección")} />
          <Barra etiqueta="Cambio de pronunciamiento" n={d.interventions.changedPronouncement} total={d.interventions.finalized} onClick={() => abrir("intervention:CHANGED_PRONOUNCEMENT", "Cambio de pronunciamiento")} />
          <Barra etiqueta="Sólo modificación textual" n={d.interventions.textOnly} total={d.interventions.finalized} onClick={() => abrir("intervention:TEXT_ONLY", "Sólo modificación textual")} />
          <p className="mt-2 text-xs text-zinc-500">
            {formatoN(d.interventions.finalized)} finalizados. Detalle de campos disponible en {d.interventions.fieldDetailCoverage.withFieldDetail} de{" "}
            {d.interventions.fieldDetailCoverage.corrected} corregidos ({formatoPorcentaje(d.interventions.fieldDetailCoverage.coveragePercent)}); las correcciones antiguas no registran campos.
          </p>
          {d.interventions.modifiedFields.length > 0 && (
            <div className="mt-2">
              {d.interventions.modifiedFields.map((f) => (
                <Barra key={f.field} etiqueta={etiquetaCampo(f.field)} n={f.n} total={d.interventions.fieldDetailCoverage.withFieldDetail} />
              ))}
            </div>
          )}
        </Seccion>
      </div>

      {/* G · OPERACIÓN MÉDICA */}
      <Seccion titulo="Operación médica" ayuda="Indicadores operacionales por médico. No son un ranking profesional.">
        <TablaSimple
          columnas={["Médico", "Asignados", "Finalizados", "Pendientes", "Avance", "Ciclo médico (P50 / P75 / P90)", "Firma (P50)", "Concordancia", "Overrides"]}
          filas={d.medicalOperations.map((m) => ({
            clave: m.doctorProfileId,
            onClick: () => abrir(`doctor:${m.doctorProfileId}`, m.doctorName ?? "Médico"),
            celdas: [
              m.doctorName ?? "—",
              String(m.assigned),
              String(m.finalized),
              String(m.pending + m.onHold),
              formatoPorcentaje(m.progressPercent),
              m.cycleN > 0
                ? `${formatoDuracion(m.cycleP50)} / ${formatoDuracion(m.cycleP75)} / ${formatoDuracion(m.cycleP90)} · ${formatoN(m.cycleN, m.cycleEligible)}`
                : `— · ${formatoN(0, m.cycleEligible)}`,
              m.signatureN > 0 ? formatoDuracion(m.signatureP50) : "—",
              `${formatoPorcentaje(m.concordancePercent)} · ${formatoN(m.comparable)}`,
              `${m.overrides} · ${formatoPorcentaje(m.overridePercent)}`,
            ],
          }))}
        />
      </Seccion>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Versiones */}
        <Seccion titulo="Versión de política de orientación" ayuda="Comparar versiones sólo con muestras comparables: mismo tipo de casos y n suficiente.">
          <TablaSimple
            columnas={["Versión", "Casos", "Concordancia", "Override", "Indet."]}
            filas={d.policyVersions.map((v) => ({
              clave: v.version,
              onClick: () => abrir(`version:${v.version}`, `Versión ${v.version}`),
              celdas: [v.version, String(v.cases), `${formatoPorcentaje(v.concordancePercent)} · ${formatoN(v.comparable)}`, `${v.overrides}`, formatoPorcentaje(v.indeterminatePercent)],
            }))}
          />
        </Seccion>

        {/* L · CALIDAD OPERACIONAL */}
        <Seccion titulo="Calidad operacional">
          <p className="mb-1 text-xs font-medium text-zinc-600">Validación contra planilla</p>
          {d.operationalQuality.preAssignment.map((p) => <Barra key={p.status} etiqueta={p.status} n={p.n} total={s.total} />)}
          <p className="mb-1 mt-3 text-xs font-medium text-zinc-600">Retenciones activas por motivo</p>
          {d.operationalQuality.activeHoldsByReason.length === 0 ? <Vacio>Sin retenciones activas.</Vacio> : d.operationalQuality.activeHoldsByReason.map((h) => <Barra key={h.reason} etiqueta={h.reason} n={h.n} total={s.total} />)}
          <p className="mt-2 text-xs text-zinc-500">{d.operationalQuality.casesWithResolvedHolds} casos con retenciones ya resueltas.</p>
        </Seccion>

        {/* M · CALIDAD TÉCNICA */}
        <Seccion titulo="Calidad técnica">
          {(
            [
              ["Último procesamiento", d.technicalQuality.latestProcessingRun],
              ["Lectura del expediente", d.technicalQuality.extractionQuality],
              ["Informe firmado (Word)", d.technicalQuality.signedDocx],
              ["Informe firmado (PDF)", d.technicalQuality.signedPdf],
            ] as const
          ).map(([titulo, filas]) => (
            <div key={titulo} className="mb-2">
              <p className="text-xs font-medium text-zinc-600">{titulo}</p>
              {filas.length === 0 ? <Vacio>—</Vacio> : filas.map((f) => <Barra key={f.status} etiqueta={f.status} n={f.n} total={Math.max(1, filas.reduce((t, x) => t + x.n, 0))} />)}
            </div>
          ))}
        </Seccion>
      </div>

      {/* N · CASOS QUE REQUIEREN ATENCIÓN */}
      <Seccion
        titulo="Casos que requieren atención"
        ayuda={`${d.attentionCases.total} en total. Se muestran los 50 más urgentes.`}
        acciones={
          d.attentionCases.total > 0 ? (
            <button type="button" onClick={() => abrir("attention", "Casos que requieren atención")} className="rounded-lg border border-[var(--atm-linea)] px-3 py-1 text-xs text-[var(--atm-azul)] hover:bg-blue-50">
              Ver todos
            </button>
          ) : undefined
        }
      >
        {d.attentionCases.cases.length === 0 ? (
          <Vacio>Ningún caso requiere atención con los filtros actuales.</Vacio>
        ) : (
          <TablaSimple
            columnas={["Trámite", "Semana", "Médico", "Orientación", "Estado", "Motivo", "Severidad"]}
            filas={d.attentionCases.cases.map((c) => ({
              clave: c.caseId,
              onClick: () => abrir(`attention:${c.reason}`, ETIQUETA_ATENCION[c.reason] ?? c.reason),
              celdas: [
                c.externalCaseId,
                c.batchName ?? "—",
                c.doctorName ?? "—",
                c.presentedOrientation ? ETIQUETA_ORIENTACION[c.presentedOrientation] ?? c.presentedOrientation : "—",
                ETIQUETA_ESTADO[c.status],
                ETIQUETA_ATENCION[c.reason] ?? c.reason,
                { HIGH: "Alta", MEDIUM: "Media", INFO: "Informativa" }[c.severity],
              ],
            }))}
          />
        )}
      </Seccion>

      <p className="text-right text-[11px] text-zinc-400">
        Actualizado {new Date(d.generatedAt).toLocaleString("es-CL")} · fuente: orientación presentada al médico
      </p>
    </>
  );
}

function TablaSimple({ columnas, filas }: { columnas: string[]; filas: { clave: string; celdas: string[]; onClick?: () => void }[] }) {
  if (filas.length === 0) return <Vacio>Sin datos.</Vacio>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left text-zinc-500">
          <tr>{columnas.map((c) => <th key={c} className="py-1 pr-3 font-medium whitespace-nowrap">{c}</th>)}</tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave} className={`border-t border-[var(--atm-linea)] ${f.onClick ? "cursor-pointer hover:bg-blue-50" : ""}`} onClick={f.onClick}>
              {f.celdas.map((c, i) => <td key={i} className="py-1.5 pr-3 text-zinc-700">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
