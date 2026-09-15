"use client";

import type { ReactNode } from "react";
import {
  DESCRIPCION_PERFIL,
  ETIQUETA_ESTADO,
  ETIQUETA_ORIENTACION,
  ETIQUETA_PERFIL,
  ETIQUETA_PRONUNCIAMIENTO,
  type FiltrosDashboard,
} from "@/lib/dashboard";
import { Boton, CLASE_TARJETA, Icono } from "./componentes";

/**
 * FILTROS GLOBALES — un solo estado para todo el panel.
 *
 * Región y contrato salen del ÁMBITO ACTIVO de la sesión. Aquí se muestran y, si
 * el ámbito abarca varias regiones del contrato, se puede acotar a una; nunca se
 * amplía: el backend vuelve a aplicar el ámbito en cada petición.
 */

export interface OpcionesFiltros {
  contrato: string;
  /** Región fija del ámbito activo; si hay, el selector queda bloqueado en ella. */
  regionFija: string | null;
  regiones: { id: string; nombre: string }[];
  semanas: { id: string; nombre: string }[];
  medicos: { id: string; nombre: string }[];
  perfiles: string[];
  versiones: string[];
}

const SEL =
  "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500";

function Campo({ etiqueta, children, title }: { etiqueta: string; children: ReactNode; title?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1" title={title}>
      <span className="text-[11px] font-medium text-slate-500">{etiqueta}</span>
      {children}
    </label>
  );
}

export function Filtros({
  filtros,
  set,
  opciones,
  onLimpiar,
  limpiable,
}: {
  filtros: FiltrosDashboard;
  set: <K extends keyof FiltrosDashboard>(k: K, v: FiltrosDashboard[K] | "") => void;
  opciones: OpcionesFiltros;
  onLimpiar: () => void;
  limpiable: boolean;
}) {
  return (
    <div className={`${CLASE_TARJETA} p-4`} role="search" aria-label="Filtros globales">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Icono nombre="filtro" className="h-4 w-4 text-slate-500" />
          Filtros globales
        </p>
        <Boton variante="fantasma" icono="cerrar" onClick={onLimpiar} disabled={!limpiable}>
          Limpiar filtros
        </Boton>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 2xl:grid-cols-11">
        <Campo etiqueta="Región" title={opciones.regionFija ? "La región la fija el ámbito activo de la sesión." : undefined}>
          {opciones.regionFija ? (
            <select className={SEL} disabled value="fija" aria-label="Región">
              <option value="fija">{opciones.regionFija}</option>
            </select>
          ) : (
            <select className={SEL} aria-label="Región" value={filtros.regionId ?? ""} onChange={(e) => set("regionId", e.target.value)}>
              <option value="">Todas</option>
              {opciones.regiones.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          )}
        </Campo>
        <Campo etiqueta="Contrato" title="El contrato se cambia desde el selector de ámbito de la cabecera.">
          <select className={SEL} disabled value="activo" aria-label="Contrato">
            <option value="activo">{opciones.contrato}</option>
          </select>
        </Campo>
        <Campo etiqueta="Semana">
          <select className={SEL} aria-label="Semana" value={filtros.batchId ?? ""} onChange={(e) => set("batchId", e.target.value)}>
            <option value="">Todas las semanas</option>
            {opciones.semanas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Médico">
          <select className={SEL} aria-label="Médico" value={filtros.doctorProfileId ?? ""} onChange={(e) => set("doctorProfileId", e.target.value)}>
            <option value="">Todos</option>
            {opciones.medicos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Estado">
          <select className={SEL} aria-label="Estado" value={filtros.status ?? ""} onChange={(e) => set("status", e.target.value as FiltrosDashboard["status"])}>
            <option value="">Todos</option>
            {(["FINALIZED", "PENDING", "HOLD"] as const).map((s) => (
              <option key={s} value={s}>
                {ETIQUETA_ESTADO[s]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Orientación IA">
          <select
            className={SEL}
            aria-label="Orientación IA"
            value={filtros.presentedOrientation ?? ""}
            onChange={(e) => set("presentedOrientation", e.target.value as FiltrosDashboard["presentedOrientation"])}
          >
            <option value="">Todas</option>
            {(["RECOVERABLE", "IRRECOVERABLE", "INDETERMINATE"] as const).map((o) => (
              <option key={o} value={o}>
                {ETIQUETA_ORIENTACION[o]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Pronunciamiento médico">
          <select
            className={SEL}
            aria-label="Pronunciamiento médico"
            value={filtros.doctorDetermination ?? ""}
            onChange={(e) => set("doctorDetermination", e.target.value as FiltrosDashboard["doctorDetermination"])}
          >
            <option value="">Todos</option>
            {(["RECOVERABLE", "IRRECOVERABLE"] as const).map((o) => (
              <option key={o} value={o}>
                {ETIQUETA_PRONUNCIAMIENTO[o]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Perfil de evidencia">
          <select className={SEL} aria-label="Perfil de evidencia" value={filtros.evidenceProfile ?? ""} onChange={(e) => set("evidenceProfile", e.target.value)}>
            <option value="">Todos</option>
            {opciones.perfiles.map((p) => (
              <option key={p} value={p} title={DESCRIPCION_PERFIL[p]}>
                {ETIQUETA_PERFIL[p] ?? p}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Versión del motor">
          <select className={SEL} aria-label="Versión del motor" value={filtros.policyVersion ?? ""} onChange={(e) => set("policyVersion", e.target.value)}>
            <option value="">Todas</option>
            {opciones.versiones.map((v) => (
              <option key={v} value={v}>
                v{v}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Asignado desde">
          <input aria-label="Asignado desde" type="date" className={SEL} value={filtros.from ?? ""} onChange={(e) => set("from", e.target.value)} />
        </Campo>
        <Campo etiqueta="Asignado hasta">
          <input aria-label="Asignado hasta" type="date" className={SEL} value={filtros.to ?? ""} onChange={(e) => set("to", e.target.value)} />
        </Campo>
      </div>
    </div>
  );
}
