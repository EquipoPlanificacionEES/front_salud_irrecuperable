"use client";

import {
  AYUDA,
  ETIQUETA_TRAMO,
  ORDEN_TRAMOS,
  etiquetaCampo,
  formatoDuracion,
  formatoDuracionPrecisa,
  formatoN,
  formatoPorcentaje,
  type DashboardOverview,
  type MetricaTiempo,
} from "@/lib/dashboard";
import { BarraApilada, BarraProgreso, COLOR_SERIE, Dato, FilaBarra, Kpi, Panel, Vacio, type Abrir } from "./componentes";
import { Histograma } from "./graficos";

/**
 * TIEMPOS DEL CICLO — qué parte del tiempo es médica y qué parte técnica.
 *
 * El ciclo médico empieza en el primer «Revisar» registrado; sin ese registro no
 * hay tiempo médico que mostrar, y se dice así («—», «Sin datos todavía»), nunca
 * «0 min». El tiempo operacional incluye la cola desde la asignación y NO es
 * tiempo médico.
 */

const percentiles = (m: MetricaTiempo, precisa = false) => {
  const f = precisa ? formatoDuracionPrecisa : formatoDuracion;
  return `P75 ${f(m.p75)} · P90 ${f(m.p90)}`;
};

export function TabTiempos({ d, abrir }: { d: DashboardOverview; abrir: Abrir }) {
  const ct = d.cycleTimes;
  const medico = ct.reviewStartToRatification;
  const cobertura = ct.reviewStartCoverage;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi
          etiqueta="Tiempo de ciclo médico"
          valor={formatoDuracion(medico.p50)}
          detalle={medico.n === 0 ? "Sin datos todavía" : `Mediana · ${formatoN(medico.n, medico.eligible)}`}
          secundario={
            <>
              {medico.n === 0 && <span className="block">Disponible para revisiones iniciadas desde la incorporación de la telemetría.</span>}
              <span className="block">
                Cobertura: {cobertura.withValidStart} / {cobertura.eligibleFinalized} finalizados
              </span>
            </>
          }
          ayuda={AYUDA.cicloMedico}
          alinearAyuda="inicio"
          icono="estetoscopio"
          tono="azul"
        />
        <Kpi
          etiqueta="P75 / P90 · ciclo médico"
          valor={`${formatoDuracion(medico.p75)} / ${formatoDuracion(medico.p90)}`}
          detalle={medico.n === 0 ? "Sin datos todavía" : formatoN(medico.n, medico.eligible)}
          ayuda={AYUDA.percentilesMedicos}
          icono="actividad"
          tono="violeta"
        />
        <Kpi
          etiqueta="Tiempo operacional hasta ratificación"
          valor={formatoDuracion(ct.assignmentToRatification.p50)}
          detalle={ct.assignmentToRatification.n > 0 ? percentiles(ct.assignmentToRatification) : "Sin casos ratificados"}
          secundario={`Mediana · ${formatoN(ct.assignmentToRatification.n)}`}
          ayuda={AYUDA.operacional}
          icono="reloj"
          tono="gris"
        />
        <Kpi
          etiqueta="Tiempo técnico de firma"
          valor={formatoDuracion(ct.ratificationToSignature.p50)}
          detalle={ct.ratificationToSignature.n > 0 ? `P50 ${formatoDuracionPrecisa(ct.ratificationToSignature.p50)} · ${percentiles(ct.ratificationToSignature, true)}` : "Sin firmas registradas"}
          secundario={formatoN(ct.ratificationToSignature.n)}
          ayuda={AYUDA.firma}
          icono="escudo"
          tono="ambar"
        />
        <Kpi
          etiqueta="Tiempo operacional total"
          valor={formatoDuracion(ct.assignmentToSignature.p50)}
          detalle={ct.assignmentToSignature.n > 0 ? percentiles(ct.assignmentToSignature) : "Sin informes firmados"}
          secundario={`Mediana · ${formatoN(ct.assignmentToSignature.n)}`}
          ayuda={AYUDA.operacionalTotal}
          alinearAyuda="fin"
          icono="documento"
          tono="gris"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel titulo="Desglose del ciclo" subtitulo="Tiempo calendario por etapa, en mediana" className="lg:col-span-7">
          <Desglose d={d} />
        </Panel>
        <Panel titulo="Cobertura de inicio de revisión" ayuda={AYUDA.cobertura} className="lg:col-span-5">
          <div role="group" aria-label="Cobertura de inicio de revisión">
            <p className="text-3xl font-semibold tabular-nums text-slate-900">
              {cobertura.withValidStart} / {cobertura.eligibleFinalized}
            </p>
            <p className="mt-1 text-[13px] text-slate-500">
              finalizados con inicio registrado · {formatoPorcentaje(cobertura.coveragePercent)}
            </p>
            <BarraProgreso valor={cobertura.coveragePercent} tono="azul" etiqueta="Cobertura de inicio de revisión" className="mt-3" />
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
              Sin dato no es cero minutos: los casos sin inicio registrado no se estiman.
            </p>
            {cobertura.recordedNotValid > 0 && (
              <p className="mt-2 text-[12px] text-slate-500">
                {cobertura.recordedNotValid} inicio{cobertura.recordedNotValid === 1 ? "" : "s"} registrado{cobertura.recordedNotValid === 1 ? "" : "s"} no
                válido{cobertura.recordedNotValid === 1 ? "" : "s"}: hubo trabajo previo del médico o fue posterior a la ratificación.
              </p>
            )}
            {cobertura.pendingWithStart > 0 && (
              <p className="mt-1 text-[12px] text-slate-500">{cobertura.pendingWithStart} pendiente(s) ya tienen inicio registrado.</p>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel titulo="Distribución del tiempo médico" subtitulo="Inicio de revisión → ratificación · clic en una barra para ver los casos" className="lg:col-span-7">
          {medico.n === 0 ? (
            <Vacio icono="reloj">Aún no existen suficientes revisiones con inicio registrado.</Vacio>
          ) : (
            <Histograma
              etiqueta="Distribución del tiempo de ciclo médico"
              color={COLOR_SERIE.concordancia}
              barras={ORDEN_TRAMOS.map((k) => ({ clave: k, etiqueta: ETIQUETA_TRAMO[k] ?? k, n: ct.distribution.reviewStartToRatification[k] ?? 0 }))}
              onClick={(k) => abrir(`bucket:rs2r:${k}`, `Tiempo de ciclo médico · ${ETIQUETA_TRAMO[k]}`)}
            />
          )}
        </Panel>
        <Panel titulo="Ratificado sin modificar vs. con corrección" subtitulo="Intervención médica previa a la aprobación" className="lg:col-span-5">
          <Correcciones d={d} abrir={abrir} />
        </Panel>
      </div>

      <Panel titulo="Por médico" subtitulo="Métricas operacionales; no constituyen un ranking clínico.">
        <PorMedico d={d} abrir={abrir} />
      </Panel>
    </div>
  );
}

function Desglose({ d }: { d: DashboardOverview }) {
  const ct = d.cycleTimes;
  const pasos = [
    { n: 1, titulo: "Asignación → inicio de revisión", m: ct.assignmentToReviewStart, precisa: false },
    { n: 2, titulo: "Inicio de revisión → ratificación", m: ct.reviewStartToRatification, precisa: false },
    { n: 3, titulo: "Ratificación → firma", m: ct.ratificationToSignature, precisa: true },
  ];
  return (
    <>
      <ol className="space-y-3" aria-label="Etapas del ciclo">
        {pasos.map((p) => (
          <li key={p.n} className="flex items-start gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-50 text-[13px] font-semibold text-blue-700 ring-1 ring-blue-100">{p.n}</span>
            <div className="min-w-0 flex-1 border-b border-slate-100 pb-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-medium text-slate-800">{p.titulo}</p>
                <p className={`text-[15px] font-semibold tabular-nums ${p.m.n === 0 ? "text-slate-400" : "text-slate-900"}`}>
                  {p.m.n === 0 ? "Sin registro" : `${formatoDuracion(p.m.p50)} mediana`}
                </p>
              </div>
              <p className="text-[12px] text-slate-500">
                {formatoN(p.m.n, p.m.eligible)}
                {p.m.n > 0 ? ` · ${percentiles(p.m, p.precisa)}` : " · no se estima"}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <dl className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
        <div>
          <dt className="text-[12px] text-slate-500">Asignación → ratificación · tiempo operacional</dt>
          <dd className="text-[15px] font-semibold tabular-nums text-slate-900">
            {formatoDuracion(ct.assignmentToRatification.p50)}{" "}
            <span className="text-[12px] font-normal text-slate-500">mediana · {formatoN(ct.assignmentToRatification.n)}</span>
          </dd>
        </div>
        <div>
          <dt className="text-[12px] text-slate-500">Asignación → firma · tiempo operacional total</dt>
          <dd className="text-[15px] font-semibold tabular-nums text-slate-900">
            {formatoDuracion(ct.assignmentToSignature.p50)}{" "}
            <span className="text-[12px] font-normal text-slate-500">mediana · {formatoN(ct.assignmentToSignature.n)}</span>
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] text-slate-400">Tiempo calendario, no minutos activos frente a la pantalla. Los tramos sin registro no se estiman.</p>
    </>
  );
}

function Correcciones({ d, abrir }: { d: DashboardOverview; abrir: Abrir }) {
  const i = d.interventions;
  const t = d.cycleTimes.byIntervention;
  const cov = i.fieldDetailCoverage;
  const tiempo = (g: { n: number; p50: number | null }) => (g.n > 0 ? `Tiempo médico ${formatoDuracion(g.p50)} · n = ${g.n}` : "Tiempo médico sin registro");
  if (i.finalized === 0) return <Vacio>Sin casos finalizados en la selección.</Vacio>;
  return (
    <>
      <BarraApilada
        etiqueta={`${i.unmodified} sin corrección y ${i.corrected} con corrección`}
        segmentos={[
          { valor: i.unmodified, tono: "azul", etiqueta: "Sin corrección" },
          { valor: i.corrected, tono: "ambar", etiqueta: "Con corrección" },
        ]}
      />
      <div className="mt-3 grid grid-cols-2 gap-1">
        <Dato
          etiqueta="Sin corrección"
          valor={String(i.unmodified)}
          detalle={tiempo(t.unmodified)}
          onClick={i.unmodified > 0 ? () => abrir("intervention:UNMODIFIED", "Ratificados sin corrección") : undefined}
        />
        <Dato
          etiqueta="Con corrección"
          valor={String(i.corrected)}
          detalle={tiempo(t.corrected)}
          onClick={i.corrected > 0 ? () => abrir("intervention:CORRECTED", "Ratificados con corrección") : undefined}
        />
      </div>
      {i.corrected === 0 && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">Ningún caso finalizado de la selección requirió corrección médica.</p>}

      <div className="mt-4 border-t border-slate-100 pt-3">
        <p className="px-2 text-[12px] font-medium text-slate-600">Campos más modificados</p>
        {i.modifiedFields.length > 0 &&
          i.modifiedFields.slice(0, 6).map((f) => <FilaBarra key={f.field} etiqueta={etiquetaCampo(f.field)} n={f.n} total={cov.withFieldDetail} tono="ambar" />)}
        <p className="mt-1 px-2 text-[12px] text-slate-500">
          {cov.records > 0
            ? `Detalle estructurado disponible para ${cov.recordsWithFieldDetail} de ${cov.records} correcciones de la selección.`
            : "Sin correcciones en la selección."}{" "}
          Histórico del ámbito: disponible para {cov.scopeRecordsWithFieldDetail} de {cov.scopeRecords} correcciones. No se extrapola.
        </p>
      </div>
    </>
  );
}

function PorMedico({ d, abrir }: { d: DashboardOverview; abrir: Abrir }) {
  if (d.medicalOperations.length === 0) return <Vacio>Sin médicos con casos en la selección.</Vacio>;
  const columnas = ["Médico", "Asignados", "Finalizados", "Pendientes", "Avance", "Mediana ciclo médico", "P90 ciclo médico", "Firma técnica", "Concordancia", "Overrides"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-[13px]" aria-label="Métricas por médico">
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
          {d.medicalOperations.map((m) => (
            <tr
              key={m.doctorProfileId}
              className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
              onClick={() => abrir(`doctor:${m.doctorProfileId}`, m.doctorName ?? "Médico")}
            >
              <td className="py-2.5 pr-4 font-medium text-slate-900">{m.doctorName ?? "—"}</td>
              <td className="py-2.5 pr-4 tabular-nums">{m.assigned}</td>
              <td className="py-2.5 pr-4 tabular-nums">{m.finalized}</td>
              <td className="py-2.5 pr-4 tabular-nums">{m.pending + m.onHold}</td>
              <td className="py-2.5 pr-4 tabular-nums">{formatoPorcentaje(m.progressPercent)}</td>
              <td className="py-2.5 pr-4 tabular-nums">{m.cycleN > 0 ? formatoDuracion(m.cycleP50) : "—"}</td>
              <td className="py-2.5 pr-4 tabular-nums">{m.cycleN > 0 ? formatoDuracion(m.cycleP90) : "—"}</td>
              <td className="py-2.5 pr-4 tabular-nums">{m.signatureN > 0 ? formatoDuracionPrecisa(m.signatureP50) : "—"}</td>
              <td className="py-2.5 pr-4 tabular-nums">{m.comparable > 0 ? `${formatoPorcentaje(m.concordancePercent)} · n = ${m.comparable}` : "Sin casos comparables"}</td>
              <td className="py-2.5 pr-4 tabular-nums">{m.comparable > 0 ? `${formatoPorcentaje(m.overridePercent)} · ${m.overrides}/${m.comparable}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
