"use client";

import {
  AYUDA,
  DESCRIPCION_PERFIL,
  ETIQUETA_ESTADO_ETAPA,
  ETIQUETA_ETAPA,
  ETIQUETA_PERFIL,
  ETIQUETA_RETENCION,
  formatoDuracion,
  formatoPorcentaje,
  haceCuanto,
  type DashboardOverview,
  type EtapaTecnica,
} from "@/lib/dashboard";
import {
  BarraProgreso,
  CLASE_TARJETA,
  COLOR_SERIE,
  Dato,
  EncabezadoSeccion,
  FilaBarra,
  Insignia,
  Leyenda,
  Panel,
  Vacio,
  type Abrir,
  type Tono,
} from "./componentes";
import { GraficoCombinado } from "./graficos";

/**
 * CALIDAD Y OPERACIÓN — qué evidencia tienen los casos, qué funciona y qué no.
 *
 * Aquí vive el detalle completo de la calidad del lote (el resumen muestra una
 * versión breve) y la separación entre incidencias técnicas ABIERTAS y fallos
 * HISTÓRICOS: nunca un «errores técnicos = 0» mientras haya incidencias vigentes.
 */

const ORDEN_PERFILES = ["CURRENT_SPECIALIST_REPORT", "LONGITUDINAL_CLINICAL_HISTORY", "ADMINISTRATIVE_DIAGNOSIS_ONLY", "UNKNOWN"];
const TONO_ETAPA: Record<EtapaTecnica["status"], Tono> = { OPERATIVE: "verde", WITH_INCIDENTS: "rojo", NO_DATA: "gris" };

export function TabCalidad({ d, abrir }: { d: DashboardOverview; abrir: Abrir }) {
  const perfiles = [...d.evidenceQuality].sort((a, b) => ORDEN_PERFILES.indexOf(a.profile) - ORDEN_PERFILES.indexOf(b.profile));
  return (
    <div className="space-y-5">
      <EncabezadoSeccion antetitulo="Evidencia clínica" titulo="Calidad de evidencia" subtitulo="Cómo cambian concordancia e indeterminación según la evidencia del expediente" />
      {perfiles.length === 0 ? (
        <Vacio>Sin casos en la selección.</Vacio>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {perfiles.map((p) => (
            <div key={p.profile} role="group" aria-label={`Perfil ${ETIQUETA_PERFIL[p.profile] ?? p.profile}`} className={`${CLASE_TARJETA} relative p-5`}>
              <p className="text-[15px] font-semibold text-slate-900">{ETIQUETA_PERFIL[p.profile] ?? p.profile}</p>
              <p className="text-[12px] text-slate-500">{DESCRIPCION_PERFIL[p.profile] ?? ""}</p>
              <p className="mt-3 text-3xl font-semibold tabular-nums text-slate-900">{p.cases}</p>
              <p className="text-[12px] text-slate-500">casos · {p.comparable} comparables finalizados</p>
              <div className="mt-4 space-y-3 text-[13px]">
                <div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-700">Concordancia</span>
                    <span className="font-semibold tabular-nums">
                      {p.comparable > 0 ? `${formatoPorcentaje(p.concordancePercent)} · ${p.matches}/${p.comparable}` : "Sin casos comparables"}
                    </span>
                  </div>
                  <BarraProgreso valor={p.concordancePercent} tono="oscuro" etiqueta={`Concordancia ${ETIQUETA_PERFIL[p.profile] ?? p.profile}`} className="mt-1" />
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-700">Override</span>
                  <span className="font-semibold tabular-nums">{p.comparable > 0 ? `${formatoPorcentaje(p.overridePercent)} · ${p.overrides}/${p.comparable}` : "—"}</span>
                </div>
                <div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-700">Indeterminación</span>
                    <span className="font-semibold tabular-nums">
                      {formatoPorcentaje(p.indeterminatePercent)} · {p.indeterminate}/{p.withOrientation}
                    </span>
                  </div>
                  <BarraProgreso valor={p.indeterminatePercent} tono="violeta" etiqueta={`Indeterminación ${ETIQUETA_PERFIL[p.profile] ?? p.profile}`} className="mt-1" />
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-700">Tiempo médico</span>
                  <span className="font-semibold tabular-nums">{p.cycleN > 0 ? `${formatoDuracion(p.cycleP50)} · n = ${p.cycleN}` : "Sin registro"}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => abrir(`evidence:${p.profile}`, `Perfil de evidencia · ${ETIQUETA_PERFIL[p.profile] ?? p.profile}`)}
                aria-label={`Ver casos: perfil ${ETIQUETA_PERFIL[p.profile] ?? p.profile}`}
                className="absolute inset-0 rounded-2xl outline-none hover:ring-1 hover:ring-blue-200 focus-visible:ring-2 focus-visible:ring-blue-300"
              />
            </div>
          ))}
        </div>
      )}

      {perfiles.length > 0 && (
        <Panel titulo="Concordancia e indeterminación por perfil de evidencia" subtitulo="Barras: concordancia. Línea: indeterminación. Sólo datos calculados.">
          <GraficoCombinado
            etiqueta="Concordancia e indeterminación por perfil de evidencia"
            colorBarra={COLOR_SERIE.concordancia}
            colorLinea={COLOR_SERIE.indeterminacion}
            categorias={perfiles.map((p) => ({
              clave: p.profile,
              etiqueta: ETIQUETA_PERFIL[p.profile] ?? p.profile,
              barra: p.comparable > 0 ? p.concordancePercent : null,
              linea: p.indeterminatePercent,
              sinBarra: "Sin casos comparables",
              detalle: [
                `Casos: ${p.cases}`,
                `Comparables: ${p.comparable}`,
                `Concordancia: ${p.comparable > 0 ? formatoPorcentaje(p.concordancePercent) : "sin casos comparables"}`,
                `Indeterminación: ${formatoPorcentaje(p.indeterminatePercent)}`,
                `Override: ${p.comparable > 0 ? formatoPorcentaje(p.overridePercent) : "—"}`,
              ],
            }))}
          />
          <div className="mt-3">
            <Leyenda
              items={[
                { etiqueta: "Concordancia", color: COLOR_SERIE.concordancia },
                { etiqueta: "Indeterminación", color: COLOR_SERIE.indeterminacion },
              ]}
            />
          </div>
        </Panel>
      )}

      <EncabezadoSeccion antetitulo="Operación" titulo="Procesamiento, incidencias y calidad del lote" />
      <div className="grid gap-4 lg:grid-cols-12">
        <Panel titulo="Procesamiento técnico" subtitulo="Estado de alto nivel, derivado de las métricas de la selección" className="lg:col-span-7">
          <div className="grid gap-2 sm:grid-cols-2">
            {d.processingHealth.map((e) => (
              <Etapa key={e.stage} etapa={e} abrir={abrir} />
            ))}
          </div>
        </Panel>
        <Panel titulo="Incidencias técnicas" subtitulo="Abiertas actuales frente a fallos registrados" className="lg:col-span-5">
          <Incidencias d={d} abrir={abrir} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel titulo="Calidad del lote" subtitulo="Validación contra la planilla, identidad y marcas de revisión" className="lg:col-span-7">
          <CalidadLote d={d} abrir={abrir} />
        </Panel>
        <Panel
          titulo="Retenciones e incidencias"
          subtitulo="Retenciones operacionales activas: el caso no es accionable por el médico"
          className="lg:col-span-5"
        >
          {d.operationalQuality.activeHoldsByReason.length === 0 ? (
            <Vacio compacto icono="pausa">
              Sin retenciones activas en la selección actual.
            </Vacio>
          ) : (
            d.operationalQuality.activeHoldsByReason.map((h) => (
              <FilaBarra
                key={h.reason}
                etiqueta={ETIQUETA_RETENCION[h.reason] ?? h.reason}
                n={h.n}
                total={d.batchQuality.holdsActive}
                tono="ambar"
                onClick={() => abrir("status:HOLD", "Retenidos")}
              />
            ))
          )}
          {d.operationalQuality.casesWithResolvedHolds > 0 && (
            <p className="mt-2 text-[12px] text-slate-500">{d.operationalQuality.casesWithResolvedHolds} casos con retenciones ya resueltas.</p>
          )}
          <a
            href="/admin/retenidos"
            className="mt-3 inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Ver módulo de Retenidos
          </a>
        </Panel>
      </div>

      <Panel
        titulo="Versiones del motor"
        subtitulo="Comparar sólo muestras comparables: mismo tipo de casos y n suficiente. No se afirma una mejora sin ese contexto."
      >
        <Versiones d={d} abrir={abrir} />
      </Panel>
    </div>
  );
}

function detalleEtapa(e: EtapaTecnica): string {
  const c = e.counts;
  const n = (k: string) => c[k] ?? 0;
  switch (e.stage) {
    case "AI_PROCESSING":
      return e.openIncidents > 0
        ? `${e.openIncidents} con último procesamiento fallido · ${n("completed")} completados`
        : `${n("completed")} completados${n("inProgress") > 0 ? ` · ${n("inProgress")} en curso` : ""}`;
    case "EXTRACTION":
      return `${n("assessed")} evaluadas · ${n("degraded")} degradadas · ${n("rejected")} no promovidas por calidad`;
    case "WORKER":
      return e.openIncidents > 0
        ? `${e.openIncidents} trabajos detenidos`
        : `${n("succeeded")} trabajos completados${e.lastActivityAt ? ` · último ${haceCuanto(e.lastActivityAt)}` : ""}`;
    case "DOCUMENTS":
      return `PDF firmados: ${n("signedPdf")} listos · ${n("pdfFailed")} fallidos${n("preReportFailed") > 0 ? ` · ${n("preReportFailed")} preinformes fallidos` : ""}`;
    case "SIGNATURE":
      return `${n("signed")} firmados${n("inProgress") > 0 ? ` · ${n("inProgress")} en curso` : ""}${n("failed") > 0 ? ` · ${n("failed")} fallidos` : ""}`;
  }
}

const SEGMENTO_ETAPA: Partial<Record<EtapaTecnica["stage"], string>> = {
  AI_PROCESSING: "incident:PROCESSING",
  DOCUMENTS: "incident:PDF",
  SIGNATURE: "incident:SIGNING",
};

function Etapa({ etapa: e, abrir }: { etapa: EtapaTecnica; abrir: Abrir }) {
  const segmento = SEGMENTO_ETAPA[e.stage];
  return (
    <div role="group" aria-label={ETIQUETA_ETAPA[e.stage]} className="relative rounded-xl border border-slate-200 px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-slate-800">{ETIQUETA_ETAPA[e.stage]}</p>
        <Insignia tono={TONO_ETAPA[e.status]} punto>
          {ETIQUETA_ESTADO_ETAPA[e.status]}
        </Insignia>
      </div>
      <p className="mt-1 text-[12px] text-slate-500">{e.status === "NO_DATA" ? "Sin registros en la selección" : detalleEtapa(e)}</p>
      {segmento && e.openIncidents > 0 && (
        <button
          type="button"
          onClick={() => abrir(segmento, `${ETIQUETA_ETAPA[e.stage]} · incidencias abiertas`)}
          aria-label={`Ver casos: ${ETIQUETA_ETAPA[e.stage]} con incidencias`}
          className="absolute inset-0 rounded-xl outline-none hover:bg-slate-50/50 focus-visible:ring-2 focus-visible:ring-blue-300"
        />
      )}
    </div>
  );
}

function Incidencias({ d, abrir }: { d: DashboardOverview; abrir: Abrir }) {
  const { open, historical } = d.technicalIncidents;
  const filas = [
    { etiqueta: "Procesamiento", n: open.processing, segmento: "incident:PROCESSING" },
    { etiqueta: "PDF del informe firmado", n: open.pdf, segmento: "incident:PDF" },
    { etiqueta: "Preinforme", n: open.preReport, segmento: "incident:PRE_REPORT" },
    { etiqueta: "Firma", n: open.signing, segmento: "incident:SIGNING" },
  ];
  return (
    <div className="space-y-4">
      <div role="group" aria-label="Incidencias técnicas abiertas">
        <div className="flex items-baseline justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
            Incidencias técnicas abiertas
          </p>
          <p className={`text-2xl font-semibold tabular-nums ${open.cases > 0 ? "text-red-700" : "text-slate-900"}`}>{open.cases}</p>
        </div>
        <p className="text-[12px] text-slate-500">{AYUDA.incidenciasAbiertas}</p>
        <div className="mt-2 space-y-0.5">
          {filas.map((f) => (
            <FilaBarra key={f.etiqueta} etiqueta={f.etiqueta} n={f.n} total={Math.max(open.cases, 1)} tono="rojo" onClick={() => abrir(f.segmento, `Incidencias abiertas · ${f.etiqueta}`)} />
          ))}
        </div>
        {open.processing > 0 && open.processingWithoutReport === 0 && (
          <p className="mt-1 px-2 text-[12px] text-slate-500">Los casos con procesamiento fallido conservan su informe vigente.</p>
        )}
      </div>
      <div role="group" aria-label="Fallos técnicos registrados" className="border-t border-slate-100 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] font-medium text-slate-700">Fallos técnicos registrados (históricos)</p>
          <p className="text-2xl font-semibold tabular-nums text-slate-900">{historical.failures}</p>
        </div>
        <p className="text-[12px] text-slate-500">{AYUDA.fallosHistoricos}</p>
        <p className="mt-2 text-[12px] text-slate-600">
          {historical.processingRuns} ejecuciones de procesamiento · {historical.artifacts} documentos · {historical.cases} casos, {historical.resolvedCases} ya sin
          incidencia abierta.
        </p>
        {historical.extractionsRejected > 0 && (
          <p className="mt-1 text-[12px] text-slate-500">
            {historical.extractionsRejected} lecturas no promovidas por la compuerta de calidad: no son fallos técnicos.
          </p>
        )}
        {historical.cases > 0 && (
          <button type="button" onClick={() => abrir("incident:HISTORICAL", "Casos con fallos técnicos registrados")} className="mt-2 text-[12px] font-medium text-blue-700 hover:underline">
            Ver casos con fallos registrados
          </button>
        )}
      </div>
    </div>
  );
}

function CalidadLote({ d, abrir }: { d: DashboardOverview; abrir: Abrir }) {
  const q = d.batchQuality;
  const degradadas = d.processingHealth.find((e) => e.stage === "EXTRACTION")?.counts["degraded"] ?? 0;
  return (
    <div className="grid grid-cols-2 gap-1 md:grid-cols-3">
      <Dato
        etiqueta="Validación fuente"
        valor={q.sourceChecked > 0 ? `${q.sourceValidated} / ${q.sourceChecked}` : "Sin validación"}
        detalle={q.sourceNotChecked > 0 ? `${q.sourceNotChecked} sin validación previa` : "Todos validados contra la planilla"}
        onClick={q.sourceValidated > 0 ? () => abrir("precheck:PASS", "Validados contra la planilla") : undefined}
      />
      <Dato
        etiqueta="RUT coincidente"
        valor={q.rutCompared > 0 ? `${q.rutMatched} / ${q.rutCompared}` : "—"}
        detalle="RUT del expediente igual al de la planilla"
        onClick={q.rutMatched > 0 ? () => abrir("identity:RUT_MATCHED", "RUT coincidente con la planilla") : undefined}
      />
      <Dato
        etiqueta="Advertencias de identidad"
        valor={String(q.identityWarnings)}
        ayuda={AYUDA.advertenciasIdentidad}
        detalle={`${q.identityInformational} diferencias informativas de nombre`}
        valorClase={q.identityWarnings > 0 ? "text-amber-700" : "text-slate-900"}
        onClick={q.identityWarnings > 0 ? () => abrir("identity:WARNING", "Advertencias de identidad") : undefined}
      />
      <Dato
        etiqueta="Revisión especial"
        valor={String(q.specialReview)}
        ayuda={AYUDA.revisionEspecial}
        detalle={q.contradictoryEvidence > 0 ? `${q.contradictoryEvidence} con evidencia contradictoria` : undefined}
        onClick={q.specialReview > 0 ? () => abrir("flag:SPECIAL_REVIEW", "Revisión especial") : undefined}
      />
      <Dato
        etiqueta="Retenciones activas"
        valor={String(q.holdsActive)}
        valorClase={q.holdsActive > 0 ? "text-amber-700" : "text-slate-900"}
        onClick={q.holdsActive > 0 ? () => abrir("status:HOLD", "Retenidos") : undefined}
      />
      <Dato
        etiqueta="Incidencias técnicas abiertas"
        valor={String(q.openTechnicalIncidents)}
        ayuda={AYUDA.incidenciasAbiertas}
        valorClase={q.openTechnicalIncidents > 0 ? "text-red-700" : "text-slate-900"}
        onClick={q.openTechnicalIncidents > 0 ? () => abrir("incident:OPEN", "Incidencias técnicas abiertas") : undefined}
      />
      <Dato etiqueta="Lecturas degradadas" valor={String(degradadas ?? 0)} detalle="Calidad de extracción parcial" />
    </div>
  );
}

function Versiones({ d, abrir }: { d: DashboardOverview; abrir: Abrir }) {
  if (d.policyVersions.length === 0) return <Vacio>Sin casos con versión registrada en la selección.</Vacio>;
  const columnas = ["Versión", "Casos", "Comparables", "Concordancia", "Override", "Indeterminación", "Ciclo médico", "Tiempo operacional (mediana)"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-[13px]" aria-label="Versiones del motor">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[12px] text-slate-500">
            {columnas.map((c) => (
              <th key={c} className="whitespace-nowrap py-2 pr-4 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.policyVersions.map((v) => (
            <tr key={v.version} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50" onClick={() => abrir(`version:${v.version}`, `Versión del motor ${v.version}`)}>
              <td className="py-2.5 pr-4 font-medium text-slate-900">v{v.version}</td>
              <td className="py-2.5 pr-4 tabular-nums">{v.cases}</td>
              <td className="py-2.5 pr-4 tabular-nums">{v.comparable}</td>
              <td className="py-2.5 pr-4 tabular-nums">{v.comparable > 0 ? formatoPorcentaje(v.concordancePercent) : "Sin casos comparables"}</td>
              <td className="py-2.5 pr-4 tabular-nums">{v.comparable > 0 ? formatoPorcentaje(v.overridePercent) : "—"}</td>
              <td className="py-2.5 pr-4 tabular-nums">
                {formatoPorcentaje(v.indeterminatePercent)} · {v.indeterminate}/{v.withOrientation}
              </td>
              <td className="py-2.5 pr-4 tabular-nums">{v.cycleN > 0 ? `${formatoDuracion(v.cycleP50)} · n = ${v.cycleN}` : "—"}</td>
              <td className="py-2.5 pr-4 tabular-nums">{formatoDuracion(v.operationalP50)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
