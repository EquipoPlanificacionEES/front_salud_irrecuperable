"use client";

import {
  AYUDA,
  CATEGORIAS_ATENCION,
  DETALLE_ATENCION,
  ETIQUETA_ATENCION,
  ETIQUETA_CAUSA,
  ETIQUETA_DOMINIO,
  ETIQUETA_ESTADO,
  ETIQUETA_ORIENTACION,
  ETIQUETA_PERFIL,
  ETIQUETA_SEVERIDAD,
  formatoPorcentaje,
  nombreSemana,
  type CasoAtencion,
  type DashboardOverview,
} from "@/lib/dashboard";
import {
  BarraApilada,
  BarraProgreso,
  Boton,
  COLOR_SERIE,
  Dato,
  EncabezadoSeccion,
  FilaBarra,
  Insignia,
  Kpi,
  Leyenda,
  Panel,
  Vacio,
  type Abrir,
  type Tono,
} from "./componentes";
import { InsigniaOrientacion } from "./DrawerCasos";
import { Anillo, GraficoLineas } from "./graficos";

/**
 * RESUMEN EJECUTIVO — cuánto llegó, cuánto terminó, cuánto coincide la
 * orientación presentada con el médico, cuánto queda indeterminado y por qué, y
 * qué casos necesitan atención. Todo número sale del backend; aquí se nombra.
 */

const proporcion = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "—");

export function TabResumen({
  d,
  abrir,
  contexto,
  semanaSeleccionada,
  onVerCalidad,
}: {
  d: DashboardOverview;
  abrir: Abrir;
  contexto: { semana: string | null; region: string };
  semanaSeleccionada?: string;
  onVerCalidad: () => void;
}) {
  const s = d.summary;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          etiqueta={contexto.semana ? "Casos de la semana" : "Casos en la selección"}
          valor={String(s.total)}
          detalle={`${contexto.semana ?? "Todas las semanas"} · ${contexto.region}`}
          secundario={`${formatoPorcentaje(s.processedPercent)} procesados`}
          icono="documento"
          tono="azul"
          onClick={() => abrir("all", "Todos los casos de la selección")}
        />
        <Kpi
          etiqueta="Finalizados"
          valor={String(s.finalized)}
          detalle={`${formatoPorcentaje(s.progressPercent)} del total`}
          progreso={s.progressPercent}
          icono="check"
          tono="verde"
          onClick={() => abrir("status:FINALIZED", "Finalizados")}
        />
        <Kpi
          etiqueta="Pendientes médicos"
          valor={String(s.pending)}
          detalle={`${formatoPorcentaje(s.pendingPercent)} del total`}
          secundario={s.onHold > 0 ? `${s.onHold} retenido${s.onHold === 1 ? "" : "s"} aparte` : undefined}
          icono="reloj"
          tono="ambar"
          onClick={() => abrir("status:PENDING", "Pendientes médicos")}
        />
        <Kpi
          etiqueta="Concordancia IA–Médico"
          valor={formatoPorcentaje(s.concordancePercent)}
          detalle={s.concordanceN > 0 ? `n = ${s.concordanceN} comparables finalizados` : "Sin casos comparables"}
          ayuda={AYUDA.concordancia}
          icono="medidor"
          tono="azul"
        />
        <Kpi
          etiqueta="Overrides médicos"
          valor={formatoPorcentaje(s.overridePercent)}
          detalle={s.concordanceN > 0 ? `${s.overrides} / ${s.concordanceN}` : "Sin casos comparables"}
          ayuda={AYUDA.override}
          icono="actividad"
          tono={s.overrides > 0 ? "ambar" : "gris"}
        />
        <Kpi
          etiqueta="Indeterminados IA"
          valor={String(s.indeterminate)}
          detalle={s.withOrientation > 0 ? `${formatoPorcentaje(s.indeterminateRatePercent)} de los casos con orientación` : "Sin casos con orientación"}
          secundario={
            d.indeterminateResolution.specialReview > 0
              ? `${d.indeterminateResolution.specialReview} revisión especial`
              : undefined
          }
          ayuda={AYUDA.indeterminacion}
          alinearAyuda="fin"
          icono="alerta"
          tono="violeta"
          onClick={() => abrir("indeterminate:ALL", "Orientación presentada indeterminada")}
        />
      </div>

      <EncabezadoSeccion
        antetitulo="Concordancia clínica"
        titulo="Concordancia IA–Médico"
        subtitulo="Orientación presentada al médico frente al pronunciamiento profesional final"
      />
      <div className="grid gap-4 lg:grid-cols-12">
        <Panel
          titulo="Matriz de concordancia"
          subtitulo="La indeterminación requiere juicio médico; no se presenta como error."
          className="lg:col-span-7"
        >
          <MatrizConcordancia d={d} abrir={abrir} />
        </Panel>
        <div className="grid gap-4 lg:col-span-5">
          <Panel titulo="Concordancia por orientación" subtitulo="Numerador / denominador por orientación presentada">
            <ConcordanciaPorOrientacion d={d} />
          </Panel>
          <Panel titulo="Overrides médicos" subtitulo="Pronunciamiento final opuesto a la orientación presentada" ayuda={AYUDA.override}>
            <Overrides d={d} abrir={abrir} />
          </Panel>
        </div>
      </div>

      <EncabezadoSeccion antetitulo="Aprendizaje del sistema" titulo="Evolución" subtitulo="Siempre con n de casos evaluados" />
      <div className="grid gap-4 lg:grid-cols-12">
        <Panel
          titulo="Evolución del desempeño"
          subtitulo="Concordancia, override e indeterminación por semana"
          ayuda={AYUDA.evolucionDesempeno}
          className="lg:col-span-7"
        >
          <EvolucionDesempeno d={d} semanaSeleccionada={semanaSeleccionada} />
        </Panel>
        <Panel
          titulo="Evolución de orientación antes de revisión médica"
          subtitulo="Primera orientación del motor frente a la presentada al médico"
          ayuda={AYUDA.evolucionOrientacion}
          className="lg:col-span-5"
        >
          <EvolucionOrientacion d={d} abrir={abrir} />
        </Panel>
      </div>

      <EncabezadoSeccion antetitulo="Indeterminación" titulo="Orientaciones indeterminadas" subtitulo="No son un error: requieren juicio médico" />
      <div className="grid gap-4 lg:grid-cols-12">
        <Panel titulo="Resolución de orientaciones indeterminadas" subtitulo="Cómo terminan cuando el médico se pronuncia" className="lg:col-span-5">
          <ResolucionIndeterminadas d={d} abrir={abrir} />
        </Panel>
        <Panel
          titulo="Principales causas de indeterminación"
          subtitulo={`Sobre ${d.indeterminateResolution.total} indeterminadas · desde datos existentes, sin inferencia nueva`}
          ayuda={AYUDA.causas}
          className="lg:col-span-7"
        >
          <CausasIndeterminacion d={d} abrir={abrir} />
        </Panel>
      </div>

      <EncabezadoSeccion antetitulo="Cierre médico" titulo="Cómo se cierran los casos" />
      <div className="grid gap-4 lg:grid-cols-12">
        <Panel titulo="Tipo de cierre médico" subtitulo="Resultado final y estado actual, por separado" ayuda={AYUDA.cierre} className="lg:col-span-7">
          <TipoCierre d={d} abrir={abrir} />
        </Panel>
        <Panel titulo="Preinformes ratificados sin modificación" ayuda={AYUDA.preinforme} className="lg:col-span-5">
          <PreinformeUtilizable d={d} abrir={abrir} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel
          titulo="Casos que requieren atención"
          subtitulo="Prioridad operacional, no diagnóstico automático"
          className="lg:col-span-8"
          acciones={
            d.attentionCases.total > 0 ? (
              <Boton onClick={() => abrir("attention", "Todos los casos que requieren atención")}>Ver todos ({d.attentionCases.total})</Boton>
            ) : undefined
          }
        >
          <Atencion d={d} abrir={abrir} />
        </Panel>
        <Panel titulo="Calidad rápida del lote" subtitulo="Validaciones de la selección" className="lg:col-span-4">
          <CalidadBreve d={d} abrir={abrir} onVerCalidad={onVerCalidad} />
        </Panel>
      </div>
    </div>
  );
}

// ---- Concordancia -----------------------------------------------------------------

const FILAS_MATRIZ = [
  { ai: "RECOVERABLE", etiqueta: "IA Recuperable" },
  { ai: "IRRECOVERABLE", etiqueta: "IA No recuperable" },
  { ai: "INDETERMINATE", etiqueta: "IA Indeterminada" },
] as const;

const COLUMNAS_MEDICO = [
  { doctor: "RECOVERABLE", etiqueta: "Médico · Recuperable" },
  { doctor: "IRRECOVERABLE", etiqueta: "Médico · Irrecuperable" },
] as const;

function CeldaMatriz({ n, clase, etiqueta, onClick }: { n: number; clase: string; etiqueta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={n === 0}
      onClick={onClick}
      aria-label={`${etiqueta}: ${n} casos`}
      className={`flex w-full flex-col items-center justify-center rounded-xl border px-2 py-3 transition enabled:hover:ring-2 enabled:hover:ring-blue-200 disabled:cursor-default ${clase}`}
    >
      <span className="text-2xl font-semibold tabular-nums">{n}</span>
      <span className="text-[11px] opacity-70">casos</span>
    </button>
  );
}

function MatrizConcordancia({ d, abrir }: { d: DashboardOverview; abrir: Abrir }) {
  const celda = (ai: string, doctor: string) => d.concordance.matrix.find((m) => m.ai === ai && m.doctor === doctor)?.n ?? 0;
  const pendiente = (ai: string) => {
    const p = d.concordance.pendingByOrientation.find((x) => x.ai === ai);
    return p ? p.pending + p.onHold : 0;
  };
  const indeterminadasPendientes = pendiente("INDETERMINATE");
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-1.5" aria-label="Matriz de concordancia">
          <thead>
            <tr>
              <th className="w-36 px-2 text-left align-bottom text-[12px] font-medium text-slate-500">Orientación IA</th>
              <th className="rounded-lg bg-emerald-50 px-2 py-2 text-[12px] font-medium text-emerald-800">Médico · Recuperable</th>
              <th className="rounded-lg bg-slate-100 px-2 py-2 text-[12px] font-medium text-slate-700">Médico · Irrecuperable</th>
              <th className="rounded-lg border border-dashed border-slate-300 px-2 py-2 text-[12px] font-medium text-slate-500">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {FILAS_MATRIZ.map(({ ai, etiqueta }) => {
              const indet = ai === "INDETERMINATE";
              return (
                <tr key={ai} data-fila={ai}>
                  <th scope="row" className={`px-2 text-left text-[13px] font-medium ${indet ? "text-violet-700" : "text-slate-700"}`}>
                    {etiqueta}
                    {indet && <span className="block text-[11px] font-normal text-violet-600">requiere pronunciamiento médico</span>}
                  </th>
                  {COLUMNAS_MEDICO.map(({ doctor, etiqueta: col }) => {
                    const n = celda(ai, doctor);
                    const clase = indet
                      ? "border-violet-100 bg-violet-50 text-violet-800"
                      : ai === doctor
                        ? "border-emerald-100 bg-emerald-50/50 text-slate-900"
                        : n > 0
                          ? "border-amber-200 bg-amber-50 text-amber-900"
                          : "border-slate-200 bg-white text-slate-400";
                    return (
                      <td key={doctor}>
                        <CeldaMatriz
                          n={n}
                          clase={clase}
                          etiqueta={`${etiqueta}, ${col}`}
                          onClick={() => abrir(`matrix:${ai}:${doctor}`, `${etiqueta} → ${col}`)}
                        />
                      </td>
                    );
                  })}
                  <td>
                    <CeldaMatriz
                      n={pendiente(ai)}
                      clase={indet ? "border-dashed border-violet-200 bg-violet-50/40 text-violet-700" : "border-dashed border-slate-200 bg-slate-50 text-slate-600"}
                      etiqueta={`${etiqueta}, pendiente`}
                      onClick={() => abrir(`matrix:${ai}:PENDING`, `${etiqueta} · sin pronunciamiento final`)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {indeterminadasPendientes > 0 && (
        <p className="mt-3 text-[13px] text-violet-700">
          {indeterminadasPendientes} indeterminado{indeterminadasPendientes === 1 ? "" : "s"} aún sin pronunciamiento final.
        </p>
      )}
      {d.concordance.withoutOrientation > 0 && (
        <p className="mt-1 text-[12px] text-slate-500">
          {d.concordance.withoutOrientation} caso{d.concordance.withoutOrientation === 1 ? "" : "s"} sin orientación presentada no aparece
          {d.concordance.withoutOrientation === 1 ? "" : "n"} en la matriz.
        </p>
      )}
    </>
  );
}

function ConcordanciaPorOrientacion({ d }: { d: DashboardOverview }) {
  return (
    <div className="space-y-4">
      {d.concordance.byOrientation.map((o) => (
        <div key={o.ai} role="group" aria-label={`IA ${ETIQUETA_ORIENTACION[o.ai]}`}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="font-medium text-slate-800">IA {ETIQUETA_ORIENTACION[o.ai]}</span>
            <span className="tabular-nums text-slate-600">
              {o.comparable > 0 ? `${o.matches} / ${o.comparable} · ${formatoPorcentaje(o.concordancePercent)}` : "Sin casos comparables"}
            </span>
          </div>
          <BarraProgreso
            valor={o.concordancePercent}
            tono={o.ai === "RECOVERABLE" ? "azul" : "oscuro"}
            etiqueta={`Concordancia IA ${ETIQUETA_ORIENTACION[o.ai]}`}
            className="mt-1.5"
          />
          <p className="mt-1 text-[11px] text-slate-500">Confirmada por el médico</p>
        </div>
      ))}
    </div>
  );
}

const DIRECCION = {
  RECOVERABLE_TO_IRRECOVERABLE: "Recuperable → Irrecuperable",
  IRRECOVERABLE_TO_RECOVERABLE: "No recuperable → Recuperable",
} as const;

function Overrides({ d, abrir }: { d: DashboardOverview; abrir: Abrir }) {
  const o = d.overrides;
  return (
    <>
      <div className="space-y-0.5">
        {o.byDirection.map((dir) => (
          <FilaBarra
            key={dir.direction}
            etiqueta={DIRECCION[dir.direction]}
            n={dir.n}
            total={dir.presentedComparable}
            detalle={dir.presentedComparable > 0 ? `de ${dir.presentedComparable} · ${formatoPorcentaje(dir.percentOfPresented)}` : "sin comparables"}
            tono="ambar"
            onClick={() => abrir(`override:${dir.direction}`, `Override ${DIRECCION[dir.direction]}`)}
          />
        ))}
      </div>
      {o.comparable === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600">Sin casos finalizados comparables en la selección actual.</p>
      ) : o.total === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600">
          No se registran cambios de pronunciamiento en los casos finalizados de la selección actual.
        </p>
      ) : (
        <p className="mt-3 text-[13px] text-slate-600">
          Total: {o.total} / {o.comparable} · {formatoPorcentaje(o.totalPercent)}
        </p>
      )}
    </>
  );
}

// ---- Evolución --------------------------------------------------------------------

const SERIES_EVOLUCION = [
  { clave: "concordancia", etiqueta: "Concordancia", color: COLOR_SERIE.concordancia },
  { clave: "override", etiqueta: "Override", color: COLOR_SERIE.override },
  { clave: "indeterminacion", etiqueta: "Indeterminación", color: COLOR_SERIE.indeterminacion },
];

function EvolucionDesempeno({ d, semanaSeleccionada }: { d: DashboardOverview; semanaSeleccionada?: string }) {
  const semanas = d.weeklyEvolution.filter((w) => w.comparable > 0);
  if (semanas.length === 0) return <Vacio>Aún no hay semanas con casos finalizados comparables.</Vacio>;
  const referencia = semanas.find((w) => w.batchId === semanaSeleccionada) ?? semanas[semanas.length - 1]!;
  return (
    <>
      <GraficoLineas
        etiqueta="Indicadores por semana"
        series={SERIES_EVOLUCION}
        puntos={semanas.map((w) => ({
          clave: w.batchId,
          etiqueta: nombreSemana(w.batchName),
          destacado: w.batchId === semanaSeleccionada,
          valores: { concordancia: w.concordancePercent, override: w.overridePercent, indeterminacion: w.indeterminatePercent },
          detalle: [
            `n = ${w.comparable} comparables · ${w.cases} casos`,
            `Versión del motor: ${w.policyVersions.length ? w.policyVersions.map((v) => `v${v}`).join(", ") : "—"}`,
            `Concordancia: ${formatoPorcentaje(w.concordancePercent)}`,
            `Override: ${formatoPorcentaje(w.overridePercent)}`,
            `Indeterminación: ${formatoPorcentaje(w.indeterminatePercent)}`,
          ],
        }))}
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Leyenda items={SERIES_EVOLUCION.map((s) => ({ etiqueta: s.etiqueta, color: s.color }))} />
        <p className="text-[12px] text-slate-500">
          {nombreSemana(referencia.batchName)} · n = {referencia.comparable} · Concordancia {formatoPorcentaje(referencia.concordancePercent)} · Override{" "}
          {formatoPorcentaje(referencia.overridePercent)} · Indeterminación {formatoPorcentaje(referencia.indeterminatePercent)}
        </p>
      </div>
      {semanas.length === 1 && (
        <p className="mt-2 text-[12px] text-slate-500">Una sola semana con casos comparables: la tendencia aparecerá con la siguiente.</p>
      )}
    </>
  );
}

function EvolucionOrientacion({ d, abrir }: { d: DashboardOverview; abrir: Abrir }) {
  const e = d.orientationEvolution;
  if (e.total === 0) return <Vacio>Sin casos con orientación en la selección.</Vacio>;
  const cambios = e.transitions.filter((t) => t.first !== t.presented).sort((a, b) => b.n - a.n);
  return (
    <>
      <div className="flex items-end gap-8">
        <div>
          <p className="text-3xl font-semibold tabular-nums text-violet-700">{e.changed}</p>
          <p className="text-[12px] text-slate-500">cambiaron de orientación</p>
        </div>
        <div>
          <p className="text-3xl font-semibold tabular-nums text-slate-800">{e.unchanged}</p>
          <p className="text-[12px] text-slate-500">sin cambio</p>
        </div>
      </div>
      <div className="mt-3">
        <BarraApilada
          etiqueta={`${e.changed} con cambio y ${e.unchanged} sin cambio`}
          segmentos={[
            { valor: e.changed, tono: "violeta", etiqueta: "Con cambio" },
            { valor: e.unchanged, tono: "claro", etiqueta: "Sin cambio" },
          ]}
        />
      </div>
      <div className="mt-3 space-y-0.5">
        {cambios.length === 0 ? (
          <Vacio compacto>Ningún caso cambió de orientación antes de la revisión médica.</Vacio>
        ) : (
          cambios.map((t) => {
            const etiqueta = `${ETIQUETA_ORIENTACION[t.first] ?? t.first} → ${ETIQUETA_ORIENTACION[t.presented] ?? t.presented}`;
            return (
              <FilaBarra
                key={`${t.first}-${t.presented}`}
                etiqueta={etiqueta}
                n={t.n}
                total={e.total}
                tono="violeta"
                onClick={() => abrir(`evolution:${t.first}:${t.presented}`, `Antes de revisión médica · ${etiqueta}`)}
              />
            );
          })
        )}
      </div>
      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
        Ocurre en el procesamiento, <strong>antes</strong> de la revisión médica. No es un override. n = {e.total}.
      </p>
    </>
  );
}

// ---- Indeterminación --------------------------------------------------------------

function ResolucionIndeterminadas({ d, abrir }: { d: DashboardOverview; abrir: Abrir }) {
  const r = d.indeterminateResolution;
  if (r.total === 0) return <Vacio>Sin orientaciones indeterminadas en la selección.</Vacio>;
  const resueltas = r.resolvedToRecoverable + r.resolvedToIrrecoverable;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <Anillo
        etiqueta={`${resueltas} resueltas y ${r.pending} pendientes de ${r.total}`}
        centro={String(r.pending)}
        subcentro={r.pending === 1 ? "pendiente" : "pendientes"}
        segmentos={[
          { valor: r.resolvedToRecoverable, color: "#10b981", etiqueta: "Resueltas a Recuperable" },
          { valor: r.resolvedToIrrecoverable, color: "#334155", etiqueta: "Resueltas a Irrecuperable" },
          { valor: r.pending, color: COLOR_SERIE.pendiente, etiqueta: "Pendientes" },
        ]}
      />
      <div className="grid min-w-[220px] flex-1 grid-cols-2 gap-1">
        <Dato etiqueta="Total" valor={String(r.total)} onClick={() => abrir("indeterminate:ALL", "Indeterminadas · todas")} />
        <Dato etiqueta="Resueltos" valor={String(resueltas)} />
        <Dato
          etiqueta="Resueltos a Recuperable"
          valor={String(r.resolvedToRecoverable)}
          onClick={r.resolvedToRecoverable > 0 ? () => abrir("indeterminate:RESOLVED_RECOVERABLE", "Indeterminadas resueltas a Recuperable") : undefined}
        />
        <Dato
          etiqueta="Resueltos a Irrecuperable"
          valor={String(r.resolvedToIrrecoverable)}
          onClick={r.resolvedToIrrecoverable > 0 ? () => abrir("indeterminate:RESOLVED_IRRECOVERABLE", "Indeterminadas resueltas a Irrecuperable") : undefined}
        />
        <Dato
          etiqueta="Pendientes"
          valor={String(r.pending)}
          valorClase="text-violet-700"
          onClick={r.pending > 0 ? () => abrir("indeterminate:PENDING", "Indeterminadas pendientes") : undefined}
        />
        <Dato
          etiqueta="Revisión especial"
          valor={String(r.specialReview)}
          ayuda={AYUDA.revisionEspecial}
          onClick={r.specialReview > 0 ? () => abrir("indeterminate:SPECIAL_REVIEW", "Indeterminadas en revisión especial") : undefined}
        />
      </div>
      {resueltas === 0 && (
        <p className="w-full text-[12px] text-slate-500">Aún no hay pronunciamientos médicos finales sobre casos indeterminados en la selección.</p>
      )}
    </div>
  );
}

function CausasIndeterminacion({ d, abrir }: { d: DashboardOverview; abrir: Abrir }) {
  const r = d.indeterminateResolution;
  if (r.total === 0) return <Vacio>Sin orientaciones indeterminadas en la selección.</Vacio>;
  if (r.causes.length === 0) return <Vacio>Motivo clínico detallado no disponible en estructura agregada.</Vacio>;
  return (
    <>
      <div className="space-y-0.5">
        {r.causes.map((c) => (
          <FilaBarra
            key={c.category}
            etiqueta={ETIQUETA_CAUSA[c.category] ?? "Motivo clínico detallado no disponible"}
            n={c.n}
            total={r.total}
            detalle={proporcion(c.n, r.total)}
            tono="violeta"
            onClick={() => abrir(`cause:${c.category}`, `Indeterminadas · ${ETIQUETA_CAUSA[c.category] ?? c.category}`)}
          />
        ))}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1 px-2 text-[12px] font-medium text-slate-600">Dominios clínicos que no constan</p>
          {r.missingCoreDomains.map((m) => (
            <FilaBarra
              key={m.domain}
              etiqueta={ETIQUETA_DOMINIO[m.domain]}
              n={m.n}
              total={r.total}
              tono="gris"
              onClick={() => abrir(`missing:${m.domain}`, `Indeterminadas sin ${ETIQUETA_DOMINIO[m.domain].toLowerCase()}`)}
            />
          ))}
        </div>
        <div>
          <p className="mb-1 px-2 text-[12px] font-medium text-slate-600">Perfil de evidencia</p>
          {r.byEvidenceProfile.map((p) => (
            <FilaBarra
              key={p.profile}
              etiqueta={ETIQUETA_PERFIL[p.profile] ?? p.profile}
              n={p.n}
              total={r.total}
              tono="gris"
              onClick={() => abrir(`indeterminate_profile:${p.profile}`, `Indeterminadas · ${ETIQUETA_PERFIL[p.profile] ?? p.profile}`)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

// ---- Cierre -----------------------------------------------------------------------

function BloqueCierre({
  titulo,
  directos,
  explicitos,
  etiquetaExplicito,
  prefijo,
  abrir,
}: {
  titulo: string;
  directos: number;
  explicitos: number;
  etiquetaExplicito: string;
  prefijo: "FINALIZED" | "PENDING";
  abrir: Abrir;
}) {
  return (
    <div role="group" aria-label={`Cierre de ${titulo.toLowerCase()}`} className="min-w-0 flex-1">
      <p className="text-[13px] font-medium text-slate-700">
        {titulo} <span className="font-normal text-slate-500">· n = {directos + explicitos}</span>
      </p>
      <div className="mt-2">
        <BarraApilada
          etiqueta={`${titulo}: ${directos} con ratificación directa y ${explicitos} con pronunciamiento explícito`}
          segmentos={[
            { valor: directos, tono: "azul", etiqueta: "Ratificación directa" },
            { valor: explicitos, tono: "violeta", etiqueta: etiquetaExplicito },
          ]}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1">
        <Dato
          etiqueta="Ratificación directa"
          valor={String(directos)}
          onClick={directos > 0 ? () => abrir(`closure:${prefijo}_DIRECT`, `${titulo} · ratificación directa`) : undefined}
        />
        <Dato
          etiqueta={etiquetaExplicito}
          valor={String(explicitos)}
          valorClase={explicitos > 0 ? "text-violet-700" : "text-slate-900"}
          onClick={explicitos > 0 ? () => abrir(`closure:${prefijo}_EXPLICIT`, `${titulo} · ${etiquetaExplicito.toLowerCase()}`) : undefined}
        />
      </div>
    </div>
  );
}

function TipoCierre({ d, abrir }: { d: DashboardOverview; abrir: Abrir }) {
  const r = d.resolutionPath;
  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <BloqueCierre titulo="Finalizados" directos={r.finalizedDirect} explicitos={r.finalizedExplicit} etiquetaExplicito="Con pronunciamiento explícito" prefijo="FINALIZED" abrir={abrir} />
      <BloqueCierre titulo="Pendientes" directos={r.pendingDirect} explicitos={r.pendingExplicit} etiquetaExplicito="Requieren pronunciamiento explícito" prefijo="PENDING" abrir={abrir} />
    </div>
  );
}

function PreinformeUtilizable({ d, abrir }: { d: DashboardOverview; abrir: Abrir }) {
  const p = d.preReportUsable;
  return (
    <div role="group" aria-label="Preinformes sin modificación">
      <p className="text-4xl font-semibold tracking-tight tabular-nums text-slate-900">{formatoPorcentaje(p.percent)}</p>
      <p className="mt-1 text-[13px] text-slate-500">{p.finalized > 0 ? `${p.unmodified} / ${p.finalized} finalizados` : "Sin casos finalizados en la selección"}</p>
      <BarraProgreso valor={p.percent} tono="verde" etiqueta="Preinformes ratificados sin modificación" className="mt-3" />
      {p.unmodified > 0 && (
        <Boton className="mt-3" onClick={() => abrir("intervention:UNMODIFIED", "Preinformes ratificados sin modificación")}>
          Ver casos
        </Boton>
      )}
    </div>
  );
}

// ---- Atención y calidad --------------------------------------------------------------

const MOTIVOS_FALLA = new Set(["SIGNING_FAILED", "PROCESSING_FAILED", "PROCESSING_RETRY_FAILED", "PRE_REPORT_FAILED", "PDF_FAILED"]);
const tonoMotivo = (motivo: string): Tono => (MOTIVOS_FALLA.has(motivo) ? "rojo" : motivo === "REQUIRES_PRONOUNCEMENT" ? "violeta" : "ambar");
const TONO_PRIORIDAD: Record<CasoAtencion["severity"], Tono> = { HIGH: "ambar", MEDIUM: "gris", INFO: "azul" };

function Atencion({ d, abrir }: { d: DashboardOverview; abrir: Abrir }) {
  const a = d.attentionCases;
  if (a.total === 0) return <Vacio>Ningún caso requiere atención con los filtros actuales.</Vacio>;
  const cuenta = (motivos: string[]) => a.byReason.filter((r) => motivos.includes(r.reason)).reduce((t, r) => t + r.n, 0);
  const otros = a.byReason.filter((r) => !CATEGORIAS_ATENCION.some((c) => c.motivos.includes(r.reason)));
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2" aria-label="Categorías de atención">
        {CATEGORIAS_ATENCION.map((c) => {
          const n = cuenta(c.motivos);
          return (
            <button
              key={c.etiqueta}
              type="button"
              disabled={n === 0}
              aria-label={`${c.etiqueta}: ${n}`}
              onClick={() => abrir(c.segmento, c.etiqueta)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                n > 0 ? "border-slate-200 bg-white text-slate-700 hover:border-blue-300" : "border-slate-100 bg-slate-50 text-slate-400"
              }`}
            >
              {c.etiqueta}
              <span className="font-semibold tabular-nums">{n}</span>
            </button>
          );
        })}
        {otros.map((r) => (
          <button
            key={r.reason}
            type="button"
            aria-label={`${ETIQUETA_ATENCION[r.reason] ?? r.reason}: ${r.n}`}
            onClick={() => abrir(`attention:${r.reason}`, ETIQUETA_ATENCION[r.reason] ?? r.reason)}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-blue-300"
          >
            {ETIQUETA_ATENCION[r.reason] ?? r.reason}
            <span className="font-semibold tabular-nums">{r.n}</span>
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]" aria-label="Casos que requieren atención">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[12px] text-slate-500">
              {["ID", "Orientación", "Estado", "Motivo", "Médico", "Prioridad", "Acción"].map((c) => (
                <th key={c} className={`py-2 pr-3 font-medium ${c === "Acción" ? "text-right" : ""}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {a.cases.slice(0, 6).map((c) => (
              <tr key={c.caseId} className="border-b border-slate-100 last:border-0">
                <td className="py-2.5 pr-3 font-mono text-[12px] text-slate-800">{c.externalCaseId}</td>
                <td className="py-2.5 pr-3">
                  <InsigniaOrientacion valor={c.presentedOrientation} />
                </td>
                <td className="py-2.5 pr-3 text-slate-700">{ETIQUETA_ESTADO[c.status]}</td>
                <td className="py-2.5 pr-3">
                  <span title={c.reasons.map((r) => DETALLE_ATENCION[r] ?? r).join(" · ")} className="inline-flex items-center gap-1.5">
                    <Insignia tono={tonoMotivo(c.reason)}>{ETIQUETA_ATENCION[c.reason] ?? c.reason}</Insignia>
                    {c.reasons.length > 1 && <span className="text-[11px] text-slate-500">+{c.reasons.length - 1}</span>}
                  </span>
                </td>
                <td className="max-w-40 truncate py-2.5 pr-3 text-slate-600" title={c.doctorName ?? undefined}>
                  {c.doctorName ?? "—"}
                </td>
                <td className="py-2.5 pr-3">
                  <Insignia tono={TONO_PRIORIDAD[c.severity]}>{ETIQUETA_SEVERIDAD[c.severity]}</Insignia>
                </td>
                <td className="py-2.5 text-right">
                  <Boton variante="fantasma" onClick={() => abrir(`case:${c.caseId}`, `Expediente ${c.externalCaseId}`)}>
                    Ver detalle
                  </Boton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {a.total > 6 && <p className="mt-2 text-[12px] text-slate-500">Se muestran 6 de {a.total}. «Ver todos» abre la lista completa, paginada.</p>}
    </>
  );
}

function CalidadBreve({ d, abrir, onVerCalidad }: { d: DashboardOverview; abrir: Abrir; onVerCalidad: () => void }) {
  const q = d.batchQuality;
  return (
    <>
      <div className="grid grid-cols-2 gap-1">
        <Dato
          etiqueta="Validación fuente"
          valor={q.sourceChecked > 0 ? `${q.sourceValidated} / ${q.sourceChecked}` : "Sin validación"}
          detalle={q.sourceNotChecked > 0 ? `${q.sourceNotChecked} sin validación previa` : undefined}
          onClick={q.sourceValidated > 0 ? () => abrir("precheck:PASS", "Validados contra la planilla") : undefined}
        />
        <Dato
          etiqueta="RUT coincidente"
          valor={q.rutCompared > 0 ? `${q.rutMatched} / ${q.rutCompared}` : "—"}
          onClick={q.rutMatched > 0 ? () => abrir("identity:RUT_MATCHED", "RUT coincidente con la planilla") : undefined}
        />
        <Dato
          etiqueta="Retenciones activas"
          valor={String(q.holdsActive)}
          valorClase={q.holdsActive > 0 ? "text-amber-700" : "text-slate-900"}
          onClick={q.holdsActive > 0 ? () => abrir("status:HOLD", "Retenidos") : undefined}
        />
        <Dato
          etiqueta="Advertencias de identidad"
          valor={String(q.identityWarnings)}
          ayuda={AYUDA.advertenciasIdentidad}
          valorClase={q.identityWarnings > 0 ? "text-amber-700" : "text-slate-900"}
          onClick={q.identityWarnings > 0 ? () => abrir("identity:WARNING", "Advertencias de identidad") : undefined}
        />
        <Dato
          etiqueta="Revisión especial"
          valor={String(q.specialReview)}
          ayuda={AYUDA.revisionEspecial}
          onClick={q.specialReview > 0 ? () => abrir("flag:SPECIAL_REVIEW", "Revisión especial") : undefined}
        />
        <Dato
          etiqueta="Incidencias técnicas abiertas"
          valor={String(q.openTechnicalIncidents)}
          ayuda={AYUDA.incidenciasAbiertas}
          valorClase={q.openTechnicalIncidents > 0 ? "text-red-700" : "text-slate-900"}
          onClick={q.openTechnicalIncidents > 0 ? () => abrir("incident:OPEN", "Incidencias técnicas abiertas") : undefined}
        />
      </div>
      <Boton variante="fantasma" className="mt-2" onClick={onVerCalidad}>
        Ver detalle en Calidad y operación
      </Boton>
    </>
  );
}
