"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { BatchListItem } from "@/lib/backend";
import { useBatches } from "@/lib/queries";
import { useActualizarDashboard, useDashboardOverview } from "@/lib/dashboard-queries";
import { haceCuanto, nombreSemana, nombreSemanaLargo, type DashboardOverview, type FiltrosDashboard } from "@/lib/dashboard";
import { Boton, CLASE_TARJETA, EsqueletoDashboard, Insignia, Pestanas, type Abrir } from "./componentes";
import { DrawerCasos } from "./DrawerCasos";
import { Filtros, type OpcionesFiltros } from "./Filtros";
import { TabCalidad } from "./TabCalidad";
import { TabResumen } from "./TabResumen";
import { TabTiempos } from "./TabTiempos";

/**
 * DASHBOARD EJECUTIVO (ADMIN).
 *
 * Todo número sale de `GET /admin/dashboard/overview`, que agrega en SQL sobre
 * el ámbito activo. Esta pantalla no recalcula nada: formatea, nombra y abre el
 * drilldown. Las métricas son OPERACIONALES — nada aquí es un ranking clínico —.
 *
 * Arranca en la semana MÁS RECIENTE con casos: es la que se sigue en la
 * operación. «Todas las semanas» sigue a un clic.
 *
 * SÓLO LECTURA: abrir, refrescar, filtrar o navegar no escribe nada.
 */

export interface AmbitoDashboard {
  contrato: string;
  /** Nombre de la región fija del ámbito activo, si la hay. */
  region: string | null;
  /** Regiones del contrato por las que se puede acotar (ámbito sin región fija). */
  regiones: { id: string; nombre: string }[];
}

type Pestana = "resumen" | "tiempos" | "calidad";
const PESTANAS = [
  { valor: "resumen", etiqueta: "Resumen ejecutivo" },
  { valor: "tiempos", etiqueta: "Tiempos del ciclo" },
  { valor: "calidad", etiqueta: "Calidad y operación" },
] as const;

/** La semana más reciente con casos. Un lote vacío no es «la semana». */
export function semanaMasReciente(lotes: readonly BatchListItem[]): string | undefined {
  return [...lotes]
    .filter((l) => (l.summary?.totalCases ?? 0) > 0)
    .sort((a, b) => b.batch.createdAt.localeCompare(a.batch.createdAt))[0]?.batch.id;
}

/**
 * ESTADO DE LA ETAPA DE PROCESAMIENTO, NO DEL SISTEMA ENTERO.
 *
 * `engineStatus` es la etapa `AI_PROCESSING`: su número son los casos cuyo
 * último procesamiento falló. Las incidencias de PDF, preinforme o firma NO
 * entran. Por eso el texto dice «Procesamiento…» y el total de incidencias
 * técnicas abiertas va en la ayuda: nadie debe leer «1» donde hay «3».
 */
export function textoEstadoProcesamiento(e: DashboardOverview["engineStatus"]): string {
  if (e.status === "OPERATIVE") return "Procesamiento operativo";
  if (e.status === "NO_DATA") return "Procesamiento sin datos en la selección";
  return e.openIncidents === 1
    ? "Procesamiento con incidencia · 1 abierta"
    : `Procesamiento con incidencias · ${e.openIncidents} abiertas`;
}

function InsigniasMotor({ d }: { d: DashboardOverview }) {
  const e = d.engineStatus;
  const versiones = d.summary.policyVersions;
  const ayuda =
    `Etapa de procesamiento IA de la selección. Incidencias técnicas abiertas en total ` +
    `(procesamiento, preinforme, firma y PDF): ${d.technicalIncidents.open.cases}.`;
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Insignia tono={e.status === "OPERATIVE" ? "verde" : e.status === "WITH_INCIDENTS" ? "ambar" : "gris"} punto title={ayuda}>
        {textoEstadoProcesamiento(e)}
      </Insignia>
      {versiones.length > 0 && <Insignia tono="gris">Orientación {versiones.map((v) => `v${v}`).join(" · ")}</Insignia>}
    </div>
  );
}

export function Dashboard({ ambito, navegacion }: { ambito: AmbitoDashboard; navegacion?: ReactNode }) {
  const lotes = useBatches();
  const porDefecto = useMemo<FiltrosDashboard>(() => {
    const semana = semanaMasReciente(lotes.data ?? []);
    return semana ? { batchId: semana } : {};
  }, [lotes.data]);

  // Los filtros esperan a conocer las semanas para empezar en la más reciente;
  // si la lista falla, se arranca sin semana en vez de quedarse esperando.
  const [filtros, setFiltros] = useState<FiltrosDashboard | null>(null);
  useEffect(() => {
    if (filtros !== null) return;
    if (lotes.isSuccess) setFiltros(porDefecto);
    else if (lotes.isError) setFiltros({});
  }, [filtros, lotes.isSuccess, lotes.isError, porDefecto]);

  const vigentes = useMemo(() => filtros ?? {}, [filtros]);
  const overview = useDashboardOverview(vigentes, { enabled: filtros !== null });
  const actualizar = useActualizarDashboard();
  const data = overview.data;

  const [pestana, setPestana] = useState<Pestana>("resumen");
  const [drill, setDrill] = useState<{ segmento: string; titulo: string } | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (data) setAhora(Date.now());
  }, [data]);

  const set = useCallback(<K extends keyof FiltrosDashboard>(k: K, v: FiltrosDashboard[K] | "") => {
    setFiltros((f) => {
      const n = { ...(f ?? {}) };
      if (v === "" || v === undefined) delete n[k];
      else n[k] = v as FiltrosDashboard[K];
      return n;
    });
  }, []);

  // Opciones de médico / perfil / versión: las del ámbito sin ese filtro aplicado.
  const [capturadas, setCapturadas] = useState<{ medicos: { id: string; nombre: string }[]; perfiles: string[]; versiones: string[] }>({
    medicos: [],
    perfiles: [],
    versiones: [],
  });
  useEffect(() => {
    if (!data) return;
    setCapturadas((o) => ({
      medicos: vigentes.doctorProfileId ? o.medicos : data.medicalOperations.map((m) => ({ id: m.doctorProfileId, nombre: m.doctorName ?? "Médico sin nombre" })),
      perfiles: vigentes.evidenceProfile ? o.perfiles : data.evidenceQuality.map((e) => e.profile),
      versiones: vigentes.policyVersion ? o.versiones : data.policyVersions.map((v) => v.version),
    }));
  }, [data, vigentes.doctorProfileId, vigentes.evidenceProfile, vigentes.policyVersion]);

  const semanas = useMemo(
    () =>
      [...(lotes.data ?? [])]
        .sort((a, b) => b.batch.createdAt.localeCompare(a.batch.createdAt))
        .map((l) => ({ id: l.batch.id, nombre: nombreSemanaLargo(l.batch.name) })),
    [lotes.data],
  );
  const opciones: OpcionesFiltros = {
    contrato: ambito.contrato,
    regionFija: ambito.region,
    regiones: ambito.regiones,
    semanas,
    ...capturadas,
  };

  const abrir = useCallback<Abrir>((segmento, titulo) => setDrill({ segmento, titulo }), []);
  const cerrar = useCallback(() => setDrill(null), []);

  const nombreLote = vigentes.batchId ? (lotes.data ?? []).find((l) => l.batch.id === vigentes.batchId)?.batch.name : undefined;
  const contexto = {
    semana: vigentes.batchId ? nombreSemana(nombreLote ?? "Semana seleccionada") : null,
    region:
      ambito.region ??
      (vigentes.regionId ? (ambito.regiones.find((r) => r.id === vigentes.regionId)?.nombre ?? "Región seleccionada") : ambito.regiones.length === 1 ? ambito.regiones[0]!.nombre : "Todas las regiones"),
  };
  const limpiable = filtros !== null && JSON.stringify(filtros) !== JSON.stringify(porDefecto);

  return (
    <div className="space-y-5 font-sans">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[13px] text-slate-500">Administración / Dashboard</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard ejecutivo</h2>
          <p className="mt-1 text-sm text-slate-500">Seguimiento operacional, concordancia clínica y calidad del análisis</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-slate-500" aria-live="polite">
              {data ? `Última actualización: ${haceCuanto(data.generatedAt, ahora)}` : "Cargando métricas…"}
            </span>
            <Boton icono="actualizar" onClick={() => void actualizar()} disabled={filtros === null || overview.isFetching}>
              {overview.isFetching && !overview.isPending ? "Actualizando…" : "Actualizar"}
            </Boton>
          </div>
          {data && <InsigniasMotor d={data} />}
        </div>
      </header>

      {navegacion}

      <Filtros filtros={vigentes} set={set} opciones={opciones} onLimpiar={() => setFiltros(porDefecto)} limpiable={limpiable} />

      <Pestanas opciones={PESTANAS} valor={pestana} onCambio={setPestana} />

      <div role="tabpanel" aria-label={PESTANAS.find((p) => p.valor === pestana)?.etiqueta}>
        {overview.error ? (
          <div role="alert" className={`${CLASE_TARJETA} flex flex-wrap items-center justify-between gap-3 border-red-200 bg-red-50/60 p-5`}>
            <p className="text-sm text-red-800">No se pudo cargar el dashboard. Los datos no se muestran incompletos.</p>
            <Boton onClick={() => void overview.refetch()}>Reintentar</Boton>
          </div>
        ) : !data ? (
          <EsqueletoDashboard />
        ) : pestana === "resumen" ? (
          <TabResumen d={data} abrir={abrir} contexto={contexto} semanaSeleccionada={vigentes.batchId} onVerCalidad={() => setPestana("calidad")} />
        ) : pestana === "tiempos" ? (
          <TabTiempos d={data} abrir={abrir} />
        ) : (
          <TabCalidad d={data} abrir={abrir} />
        )}
      </div>

      {drill && <DrawerCasos filtros={vigentes} segmento={drill.segmento} titulo={drill.titulo} onCerrar={cerrar} />}
    </div>
  );
}
