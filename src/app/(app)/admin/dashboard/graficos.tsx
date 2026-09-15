"use client";

import { useState } from "react";

/**
 * GRÁFICOS DEL DASHBOARD — SVG y HTML, sin librería.
 *
 * Pocos y sólo donde aportan. Reciben valores ya calculados; un valor `null` no
 * se dibuja (no es cero). Cada punto o barra es enfocable y lleva en su nombre
 * accesible lo mismo que muestra su tooltip.
 */

export interface SerieLinea {
  clave: string;
  etiqueta: string;
  color: string;
}

export interface PuntoLinea {
  clave: string;
  etiqueta: string;
  valores: Record<string, number | null>;
  /** Líneas del tooltip. */
  detalle: string[];
  destacado?: boolean;
}

const GUIAS = [0, 25, 50, 75, 100];
const acotar = (v: number) => Math.max(0, Math.min(100, v));

/** Tramos continuos de una serie: un `null` corta la línea. */
function tramos(valores: (number | null)[], x: (i: number) => number): [number, number][][] {
  const out: [number, number][][] = [];
  let actual: [number, number][] = [];
  valores.forEach((v, i) => {
    if (v === null) {
      if (actual.length) out.push(actual);
      actual = [];
    } else actual.push([x(i), 100 - acotar(v)]);
  });
  if (actual.length) out.push(actual);
  return out;
}

function Guias() {
  return (
    <>
      {GUIAS.map((g) => (
        <div key={g} className="absolute inset-x-0 border-t border-dashed border-slate-200" style={{ top: `${100 - g}%` }}>
          <span className="absolute -left-9 w-7 -translate-y-1/2 text-right text-[11px] tabular-nums text-slate-400">{g}</span>
        </div>
      ))}
    </>
  );
}

function Tooltip({ titulo, lineas, lado }: { titulo: string; lineas: string[]; lado: "izquierda" | "derecha" }) {
  return (
    <div
      role="tooltip"
      className={`pointer-events-none absolute top-1 z-20 w-60 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg ${lado === "derecha" ? "left-4" : "right-4"}`}
    >
      <p className="font-semibold text-slate-900">{titulo}</p>
      {lineas.map((l) => (
        <p key={l} className="mt-0.5 text-slate-600">
          {l}
        </p>
      ))}
    </div>
  );
}

/** Tendencia de porcentajes (0–100) por semana. */
export function GraficoLineas({
  series,
  puntos,
  alto = 200,
  etiqueta,
}: {
  series: SerieLinea[];
  puntos: PuntoLinea[];
  alto?: number;
  etiqueta: string;
}) {
  const [activo, setActivo] = useState<string | null>(null);
  const n = puntos.length;
  const x = (i: number) => (n === 1 ? 50 : 8 + (i * 84) / (n - 1));
  return (
    <figure aria-label={etiqueta} className="min-w-0">
      <div className="relative ml-9 mr-2" style={{ height: alto }}>
        <Guias />
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {series.map((s) =>
            tramos(puntos.map((p) => p.valores[s.clave] ?? null), x).map((t, k) =>
              t.length > 1 ? (
                <polyline
                  key={`${s.clave}-${k}`}
                  points={t.map(([px, py]) => `${px},${py}`).join(" ")}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null,
            ),
          )}
        </svg>
        {puntos.map((p, i) => (
          <div key={p.clave} className="absolute inset-y-0" style={{ left: `${x(i)}%` }}>
            {series.map((s) => {
              const v = p.valores[s.clave];
              return v === null || v === undefined ? null : (
                <span
                  key={s.clave}
                  className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white"
                  style={{ top: `${100 - acotar(v)}%`, borderColor: s.color }}
                  aria-hidden="true"
                />
              );
            })}
            <button
              type="button"
              aria-label={[p.etiqueta, ...p.detalle].join(" · ")}
              onMouseEnter={() => setActivo(p.clave)}
              onMouseLeave={() => setActivo(null)}
              onFocus={() => setActivo(p.clave)}
              onBlur={() => setActivo(null)}
              className="absolute inset-y-0 w-12 -translate-x-1/2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            />
            {activo === p.clave && <Tooltip titulo={p.etiqueta} lineas={p.detalle} lado={i < n / 2 || n === 1 ? "derecha" : "izquierda"} />}
          </div>
        ))}
      </div>
      <div className="relative ml-9 mr-2 mt-2 h-4">
        {puntos.map((p, i) => (
          <span
            key={p.clave}
            className={`absolute -translate-x-1/2 whitespace-nowrap text-[11px] ${p.destacado ? "font-semibold text-slate-800" : "text-slate-500"}`}
            style={{ left: `${x(i)}%` }}
          >
            {p.etiqueta}
          </span>
        ))}
      </div>
    </figure>
  );
}

export interface CategoriaCombinada {
  clave: string;
  etiqueta: string;
  /** Barra (0–100). `null`: no se dibuja y se explica con `sinBarra`. */
  barra: number | null;
  linea: number | null;
  sinBarra?: string;
  detalle: string[];
}

/** Barras (una métrica) con una línea superpuesta (otra), por categoría. */
export function GraficoCombinado({
  categorias,
  colorBarra,
  colorLinea,
  alto = 200,
  etiqueta,
}: {
  categorias: CategoriaCombinada[];
  colorBarra: string;
  colorLinea: string;
  alto?: number;
  etiqueta: string;
}) {
  const [activo, setActivo] = useState<string | null>(null);
  const n = categorias.length;
  const x = (i: number) => ((i + 0.5) / Math.max(1, n)) * 100;
  return (
    <figure aria-label={etiqueta} className="min-w-0">
      <div className="relative ml-9 mr-2" style={{ height: alto }}>
        <Guias />
        {categorias.map((c, i) => (
          <div key={c.clave} className="absolute inset-y-0" style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }}>
            {c.barra !== null ? (
              <div
                className="absolute bottom-0 left-1/2 w-2/5 max-w-28 -translate-x-1/2 rounded-t-md"
                style={{ height: `${acotar(c.barra)}%`, background: colorBarra }}
                aria-hidden="true"
              />
            ) : (
              <p className="absolute bottom-2 left-1/2 w-3/4 -translate-x-1/2 text-center text-[11px] italic text-slate-400">{c.sinBarra}</p>
            )}
          </div>
        ))}
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {tramos(categorias.map((c) => c.linea), x).map((t, k) =>
            t.length > 1 ? (
              <polyline
                key={k}
                points={t.map(([px, py]) => `${px},${py}`).join(" ")}
                fill="none"
                stroke={colorLinea}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            ) : null,
          )}
        </svg>
        {categorias.map((c, i) => (
          <div key={`p-${c.clave}`} className="absolute inset-y-0" style={{ left: `${x(i)}%` }}>
            {c.linea !== null && (
              <span
                className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white"
                style={{ top: `${100 - acotar(c.linea)}%`, borderColor: colorLinea }}
                aria-hidden="true"
              />
            )}
            <button
              type="button"
              aria-label={[c.etiqueta, ...c.detalle].join(" · ")}
              onMouseEnter={() => setActivo(c.clave)}
              onMouseLeave={() => setActivo(null)}
              onFocus={() => setActivo(c.clave)}
              onBlur={() => setActivo(null)}
              className="absolute inset-y-0 w-24 -translate-x-1/2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            />
            {activo === c.clave && <Tooltip titulo={c.etiqueta} lineas={c.detalle} lado={i < n / 2 ? "derecha" : "izquierda"} />}
          </div>
        ))}
      </div>
      <div className="relative ml-9 mr-2 mt-2 h-4">
        {categorias.map((c, i) => (
          <span key={c.clave} className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] text-slate-500" style={{ left: `${x(i)}%` }}>
            {c.etiqueta}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Anillo de proporciones. Con total 0 queda vacío: nunca se dibuja lleno de algo que no pasó. */
export function Anillo({
  segmentos,
  centro,
  subcentro,
  etiqueta,
  tamano = 132,
  grosor = 14,
}: {
  segmentos: { valor: number; color: string; etiqueta: string }[];
  centro: string;
  subcentro?: string;
  etiqueta: string;
  tamano?: number;
  grosor?: number;
}) {
  const total = segmentos.reduce((t, s) => t + s.valor, 0);
  const r = (tamano - grosor) / 2;
  const c = 2 * Math.PI * r;
  let acumulado = 0;
  return (
    <div className="relative shrink-0" style={{ width: tamano, height: tamano }}>
      <svg width={tamano} height={tamano} viewBox={`0 0 ${tamano} ${tamano}`} role="img" aria-label={etiqueta}>
        <circle cx={tamano / 2} cy={tamano / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={grosor} />
        {total > 0 &&
          segmentos
            .filter((s) => s.valor > 0)
            .map((s) => {
              const largo = (s.valor / total) * c;
              const offset = -acumulado;
              acumulado += largo;
              return (
                <circle
                  key={s.etiqueta}
                  cx={tamano / 2}
                  cy={tamano / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={grosor}
                  strokeDasharray={`${largo} ${c - largo}`}
                  strokeDashoffset={offset}
                  transform={`rotate(-90 ${tamano / 2} ${tamano / 2})`}
                />
              );
            })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-semibold tabular-nums text-slate-900">{centro}</span>
        {subcentro && <span className="text-[11px] text-slate-500">{subcentro}</span>}
      </div>
    </div>
  );
}

/** Histograma de tramos. El caller decide el estado vacío. */
export function Histograma({
  barras,
  color,
  alto = 170,
  onClick,
  etiqueta,
}: {
  barras: { clave: string; etiqueta: string; n: number }[];
  color: string;
  alto?: number;
  onClick?: (clave: string) => void;
  etiqueta: string;
}) {
  const max = Math.max(1, ...barras.map((b) => b.n));
  return (
    <figure aria-label={etiqueta} className="min-w-0">
      <div className="flex items-end gap-3 border-b border-slate-200 px-1" style={{ height: alto }}>
        {barras.map((b) => (
          <button
            key={b.clave}
            type="button"
            disabled={b.n === 0 || !onClick}
            onClick={() => onClick?.(b.clave)}
            aria-label={`${b.etiqueta}: ${b.n} casos`}
            className="group flex h-full flex-1 flex-col items-center justify-end gap-1 rounded-t-md outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-default"
          >
            <span className="text-[11px] font-semibold tabular-nums text-slate-700">{b.n}</span>
            <span className="block w-full max-w-16 rounded-t-md transition group-enabled:group-hover:opacity-80" style={{ height: `${(b.n / max) * 80}%`, background: color }} />
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-3 px-1">
        {barras.map((b) => (
          <span key={b.clave} className="flex-1 text-center text-[11px] text-slate-500">
            {b.etiqueta}
          </span>
        ))}
      </div>
    </figure>
  );
}
