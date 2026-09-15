"use client";

import type { ReactNode } from "react";
import { formatoDuracion, formatoN, formatoPorcentaje, type MetricaTiempo } from "@/lib/dashboard";

/**
 * PIEZAS DEL DASHBOARD — desacopladas de los datos concretos y del diseño final.
 *
 * Cada pieza recibe números ya calculados por el backend y sólo decide cómo
 * mostrarlos. La maquetación es sobria a propósito: la referencia visual
 * definitiva llegará después y debe poder cambiar sin tocar la lógica.
 */

export function Seccion({ titulo, ayuda, children, acciones }: { titulo: string; ayuda?: string; children: ReactNode; acciones?: ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--atm-linea)] bg-white p-4 shadow-sm" aria-label={titulo}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-800">{titulo}</h3>
          {ayuda && <p className="mt-0.5 max-w-3xl text-xs text-zinc-500">{ayuda}</p>}
        </div>
        {acciones}
      </header>
      {children}
    </section>
  );
}

/** Indicador principal. El valor nunca va sin su base (`detalle`). */
export function Tarjeta({
  etiqueta,
  valor,
  detalle,
  ayuda,
  onClick,
  tono = "neutral",
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  ayuda?: string;
  onClick?: () => void;
  tono?: "neutral" | "ok" | "obs" | "mal";
}) {
  const color = { neutral: "text-zinc-900", ok: "text-[var(--atm-ok)]", obs: "text-[var(--atm-obs)]", mal: "text-[var(--atm-mal)]" }[tono];
  const cuerpo = (
    <>
      <p className="text-xs font-medium text-zinc-500">
        {etiqueta}
        {ayuda && (
          <span className="ml-1 cursor-help text-zinc-400" title={ayuda} aria-label={`Ayuda: ${ayuda}`}>
            ⓘ
          </span>
        )}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-zinc-500">{detalle}</p>}
    </>
  );
  const clase = "rounded-xl border border-[var(--atm-linea)] bg-white p-4 text-left shadow-sm";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${clase} hover:border-[var(--atm-azul2)]`}>
      {cuerpo}
    </button>
  ) : (
    <div className={clase}>{cuerpo}</div>
  );
}

/** p50 / p75 / p90 con n y cobertura. Nunca un promedio solo. */
export function FilaTiempo({ etiqueta, metrica, ayuda, conCobertura = false }: { etiqueta: string; metrica: MetricaTiempo; ayuda?: string; conCobertura?: boolean }) {
  return (
    <tr className="border-t border-[var(--atm-linea)]">
      <td className="px-3 py-2 text-sm text-zinc-700">
        {etiqueta}
        {ayuda && (
          <span className="ml-1 cursor-help text-zinc-400" title={ayuda}>
            ⓘ
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-sm font-medium text-zinc-900">{formatoDuracion(metrica.p50)}</td>
      <td className="px-3 py-2 text-sm text-zinc-700">{formatoDuracion(metrica.p75)}</td>
      <td className="px-3 py-2 text-sm text-zinc-700">{formatoDuracion(metrica.p90)}</td>
      <td className="px-3 py-2 text-xs text-zinc-500">
        {conCobertura ? `${formatoN(metrica.n, metrica.eligible)} (${formatoPorcentaje(metrica.coveragePercent)})` : formatoN(metrica.n)}
      </td>
      <td className="px-3 py-2 text-xs text-zinc-400">{formatoDuracion(metrica.mean)}</td>
    </tr>
  );
}

/** Barra horizontal con conteo; clic para ver los casos. */
export function Barra({ etiqueta, n, total, onClick }: { etiqueta: string; n: number; total: number; onClick?: () => void }) {
  const ancho = total > 0 ? Math.max(2, Math.round((n / total) * 100)) : 0;
  const contenido = (
    <>
      <span className="w-48 shrink-0 truncate text-xs text-zinc-600" title={etiqueta}>
        {etiqueta}
      </span>
      <span className="h-2.5 flex-1 rounded bg-zinc-100">
        <span className="block h-2.5 rounded bg-[var(--atm-azul2)]" style={{ width: `${n === 0 ? 0 : ancho}%` }} />
      </span>
      <span className="w-10 shrink-0 text-right text-xs font-medium text-zinc-800">{n}</span>
    </>
  );
  return onClick && n > 0 ? (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded px-1 py-0.5 hover:bg-blue-50">
      {contenido}
    </button>
  ) : (
    <div className="flex w-full items-center gap-2 px-1 py-0.5">{contenido}</div>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-xs text-zinc-400">{children}</p>;
}
