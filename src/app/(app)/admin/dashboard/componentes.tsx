"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * PIEZAS DEL DASHBOARD — presentación pura.
 *
 * Referencia visual: el diseño preparado en v0 (fondo gris muy claro, tarjetas
 * blancas de borde fino, sombras mínimas, jerarquía sobria). Cada pieza recibe
 * valores ya calculados por el backend y formateados; ninguna calcula métricas.
 *
 * El color tiene significado y sólo ése: azul = métrica principal y acciones;
 * verde = estado correcto; ámbar = advertencia; violeta = indeterminación (no es
 * un error); rojo = sólo error real.
 */

export type Tono = "azul" | "verde" | "ambar" | "violeta" | "rojo" | "gris";
export type TonoBarra = Tono | "oscuro" | "claro";

/** Abre el panel lateral con los casos de un segmento del drilldown. */
export type Abrir = (segmento: string, titulo: string) => void;

export const CLASE_TARJETA = "rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

const TONO_INSIGNIA: Record<Tono, string> = {
  azul: "border-blue-200 bg-blue-50 text-blue-700",
  verde: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ambar: "border-amber-200 bg-amber-50 text-amber-800",
  violeta: "border-violet-200 bg-violet-50 text-violet-700",
  rojo: "border-red-200 bg-red-50 text-red-700",
  gris: "border-slate-200 bg-slate-50 text-slate-600",
};

const TONO_PUNTO: Record<Tono, string> = {
  azul: "bg-blue-600",
  verde: "bg-emerald-500",
  ambar: "bg-amber-500",
  violeta: "bg-violet-500",
  rojo: "bg-red-500",
  gris: "bg-slate-400",
};

const TONO_ICONO: Record<Tono, string> = {
  azul: "bg-blue-50 text-blue-600 ring-blue-100",
  verde: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  ambar: "bg-amber-50 text-amber-600 ring-amber-100",
  violeta: "bg-violet-50 text-violet-600 ring-violet-100",
  rojo: "bg-red-50 text-red-600 ring-red-100",
  gris: "bg-slate-50 text-slate-500 ring-slate-100",
};

export const COLOR_BARRA: Record<TonoBarra, string> = {
  azul: "bg-blue-600",
  verde: "bg-emerald-500",
  ambar: "bg-amber-500",
  violeta: "bg-violet-500",
  rojo: "bg-red-500",
  gris: "bg-slate-400",
  oscuro: "bg-slate-800",
  claro: "bg-slate-200",
};

/** Colores de series de gráfico (SVG): los mismos significados. */
export const COLOR_SERIE = {
  concordancia: "#1e3a8a",
  override: "#d97706",
  indeterminacion: "#7c3aed",
  pendiente: "#ddd6fe",
  neutro: "#94a3b8",
} as const;

// ---- Íconos ---------------------------------------------------------------

export type IconoNombre =
  | "documento" | "check" | "reloj" | "medidor" | "actividad" | "alerta" | "filtro" | "cerrar" | "actualizar"
  | "info" | "flecha" | "estetoscopio" | "escudo" | "capas" | "usuario" | "pausa" | "rayo";

const TRAZOS: Record<IconoNombre, ReactNode> = {
  documento: (<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h6" /></>),
  check: (<><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></>),
  reloj: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  medidor: (<><path d="m12 14 3.5-3.5" /><path d="M4.9 19a9 9 0 1 1 14.2 0" /></>),
  actividad: <path d="M3 12h4l3 7 4-14 3 7h4" />,
  alerta: (<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>),
  filtro: <path d="M3 5h18l-7 8v6l-4-2v-4z" />,
  cerrar: <path d="M6 6l12 12M18 6 6 18" />,
  actualizar: (<><path d="M20 11a8 8 0 0 0-14.9-3.9L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.9 3.9L20 16" /><path d="M20 20v-4h-4" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>),
  flecha: <path d="m9 6 6 6-6 6" />,
  estetoscopio: (<><path d="M6 3v6a4 4 0 0 0 8 0V3" /><path d="M10 13v3a5 5 0 0 0 10 0v-1" /><circle cx="20" cy="13" r="2" /></>),
  escudo: (<><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" /><path d="m9 12 2 2 4-4" /></>),
  capas: (<><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>),
  usuario: (<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
  pausa: (<><circle cx="12" cy="12" r="9" /><path d="M10 9v6M14 9v6" /></>),
  rayo: <path d="M13 3 4 14h7l-1 7 9-11h-7z" />,
};

export function Icono({ nombre, className = "h-4 w-4" }: { nombre: IconoNombre; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {TRAZOS[nombre]}
    </svg>
  );
}

// ---- Texto de ayuda -----------------------------------------------------------

/** Ayuda breve: se abre al pasar el cursor o al enfocar. El texto es la definición de la métrica. */
export function Ayuda({ texto, alinear = "centro" }: { texto: string; alinear?: "inicio" | "centro" | "fin" }) {
  const posicion = { inicio: "left-0", centro: "left-1/2 -translate-x-1/2", fin: "right-0" }[alinear];
  return (
    <span className="group relative z-10 inline-flex align-middle">
      <button
        type="button"
        aria-label={`Ayuda: ${texto}`}
        className="rounded-full text-slate-400 outline-none hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-blue-300"
      >
        <Icono nombre="info" className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-full z-30 mt-2 hidden w-64 max-w-[80vw] rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-snug text-white shadow-lg group-focus-within:block group-hover:block ${posicion}`}
      >
        {texto}
      </span>
    </span>
  );
}

// ---- Contenedores ---------------------------------------------------------------

export function EncabezadoSeccion({
  antetitulo,
  titulo,
  subtitulo,
  acciones,
}: {
  antetitulo?: string;
  titulo: string;
  subtitulo?: string;
  acciones?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pt-3">
      <div>
        {antetitulo && <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{antetitulo}</p>}
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{titulo}</h2>
        {subtitulo && <p className="mt-1 text-sm text-slate-500">{subtitulo}</p>}
      </div>
      {acciones}
    </div>
  );
}

/** Tarjeta con título. Es una región con nombre: se puede encontrar por su título. */
export function Panel({
  titulo,
  subtitulo,
  ayuda,
  acciones,
  children,
  className = "",
}: {
  titulo: string;
  subtitulo?: ReactNode;
  ayuda?: string;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={titulo} className={`${CLASE_TARJETA} min-w-0 p-5 ${className}`}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-[15px] font-semibold text-slate-900">
            {titulo}
            {ayuda && <Ayuda texto={ayuda} alinear="inicio" />}
          </h3>
          {subtitulo && <p className="mt-0.5 text-[13px] text-slate-500">{subtitulo}</p>}
        </div>
        {acciones}
      </header>
      {children}
    </section>
  );
}

/** Indicador de primera lectura. El valor nunca va sin su base (`detalle`). */
export function Kpi({
  etiqueta,
  valor,
  detalle,
  secundario,
  ayuda,
  icono,
  tono = "azul",
  valorClase = "text-slate-900",
  progreso,
  onClick,
  alinearAyuda = "centro",
}: {
  etiqueta: string;
  valor: string;
  detalle?: ReactNode;
  secundario?: ReactNode;
  ayuda?: string;
  icono?: IconoNombre;
  tono?: Tono;
  valorClase?: string;
  progreso?: number | null;
  onClick?: () => void;
  alinearAyuda?: "inicio" | "centro" | "fin";
}) {
  return (
    <div
      role="group"
      aria-label={etiqueta}
      className={`${CLASE_TARJETA} relative flex min-h-[136px] min-w-0 flex-col p-4 transition ${onClick ? "hover:border-blue-300 hover:shadow-sm" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[13px] font-medium leading-tight text-slate-600">
          {etiqueta}
          {ayuda && <Ayuda texto={ayuda} alinear={alinearAyuda} />}
        </p>
        {icono && (
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ${TONO_ICONO[tono]}`}>
            <Icono nombre={icono} />
          </span>
        )}
      </div>
      <p className={`mt-1.5 text-[28px] font-semibold leading-none tracking-tight tabular-nums ${valorClase}`}>{valor}</p>
      {detalle && <p className="mt-2 text-xs text-slate-500">{detalle}</p>}
      {secundario && <p className="mt-0.5 text-xs text-slate-500">{secundario}</p>}
      {progreso !== undefined && <BarraProgreso valor={progreso} tono="oscuro" etiqueta={`Avance de ${etiqueta}`} className="mt-auto pt-3" />}
      {onClick && (
        <button
          type="button"
          onClick={onClick}
          aria-label={`Ver casos: ${etiqueta}`}
          className="absolute inset-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        />
      )}
    </div>
  );
}

/** Par etiqueta / valor compacto, con drilldown opcional. */
export function Dato({
  etiqueta,
  valor,
  ayuda,
  detalle,
  valorClase = "text-slate-900",
  onClick,
}: {
  etiqueta: string;
  valor: string;
  ayuda?: string;
  detalle?: string;
  valorClase?: string;
  onClick?: () => void;
}) {
  const cuerpo = (
    <>
      <p className="flex items-center gap-1 text-[12px] text-slate-500">
        {etiqueta}
        {ayuda && <Ayuda texto={ayuda} alinear="inicio" />}
      </p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${valorClase}`}>{valor}</p>
      {detalle && <p className="text-[11px] text-slate-400">{detalle}</p>}
    </>
  );
  return (
    <div role="group" aria-label={etiqueta} className="relative min-w-0 rounded-xl px-2 py-1.5">
      {cuerpo}
      {onClick && (
        <button type="button" onClick={onClick} aria-label={`Ver casos: ${etiqueta}`} className="absolute inset-0 rounded-xl outline-none hover:bg-slate-50/60 focus-visible:ring-2 focus-visible:ring-blue-300" />
      )}
    </div>
  );
}

// ---- Insignias y botones --------------------------------------------------------

export function Insignia({ tono = "gris", punto = false, children, title }: { tono?: Tono; punto?: boolean; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONO_INSIGNIA[tono]}`}>
      {punto && <span className={`h-1.5 w-1.5 rounded-full ${TONO_PUNTO[tono]}`} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Boton({
  variante = "secundario",
  icono,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "primario" | "secundario" | "fantasma"; icono?: IconoNombre }) {
  const clase = {
    primario: "bg-blue-700 text-white hover:bg-blue-800",
    secundario: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    fantasma: "text-slate-600 hover:bg-slate-100",
  }[variante];
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${clase} ${className}`}
    >
      {icono && <Icono nombre={icono} className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Pestanas<T extends string>({
  opciones,
  valor,
  onCambio,
}: {
  opciones: readonly { valor: T; etiqueta: string }[];
  valor: T;
  onCambio: (v: T) => void;
}) {
  return (
    <div role="tablist" aria-label="Secciones del dashboard" className="inline-flex max-w-full overflow-x-auto rounded-xl bg-slate-200/60 p-1">
      {opciones.map((o) => (
        <button
          key={o.valor}
          role="tab"
          type="button"
          aria-selected={o.valor === valor}
          onClick={() => onCambio(o.valor)}
          className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
            o.valor === valor ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

// ---- Barras ---------------------------------------------------------------------

export function BarraProgreso({
  valor,
  tono = "azul",
  etiqueta,
  className = "",
}: {
  valor: number | null;
  tono?: TonoBarra;
  etiqueta?: string;
  className?: string;
}) {
  const ancho = valor === null ? 0 : Math.max(0, Math.min(100, valor));
  return (
    <div className={className}>
      <div
        role="progressbar"
        aria-label={etiqueta}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={valor ?? undefined}
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
      >
        <div className={`h-full rounded-full ${COLOR_BARRA[tono]}`} style={{ width: `${ancho}%` }} />
      </div>
    </div>
  );
}

/** Barra horizontal con etiqueta y conteo; clic para ver los casos. */
export function FilaBarra({
  etiqueta,
  n,
  total,
  detalle,
  tono = "azul",
  onClick,
}: {
  etiqueta: string;
  n: number;
  total: number;
  detalle?: string;
  tono?: TonoBarra;
  onClick?: () => void;
}) {
  const ancho = total > 0 && n > 0 ? Math.max(2, (n / total) * 100) : 0;
  const cuerpo = (
    <>
      <span className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="min-w-0 truncate text-slate-700" title={etiqueta}>
          {etiqueta}
        </span>
        <span className="shrink-0 font-semibold tabular-nums text-slate-900">
          {n}
          {detalle && <span className="ml-1.5 font-normal text-slate-500">{detalle}</span>}
        </span>
      </span>
      <span className="mt-1.5 block h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <span className={`block h-full rounded-full ${COLOR_BARRA[tono]}`} style={{ width: `${ancho}%` }} />
      </span>
    </>
  );
  return onClick && n > 0 ? (
    <button type="button" onClick={onClick} className="block w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50">
      {cuerpo}
    </button>
  ) : (
    <div className="block px-2 py-1.5">{cuerpo}</div>
  );
}

/** Proporciones de un total en una sola barra. */
export function BarraApilada({
  segmentos,
  etiqueta,
  alto = "h-3",
}: {
  segmentos: { valor: number; tono: TonoBarra; etiqueta: string }[];
  etiqueta: string;
  alto?: string;
}) {
  const suma = segmentos.reduce((t, s) => t + s.valor, 0);
  return (
    <div role="img" aria-label={etiqueta} className={`flex w-full overflow-hidden rounded-full bg-slate-100 ${alto}`}>
      {suma > 0 &&
        segmentos
          .filter((s) => s.valor > 0)
          .map((s) => (
            <div key={s.etiqueta} title={`${s.etiqueta}: ${s.valor}`} className={COLOR_BARRA[s.tono]} style={{ width: `${(s.valor / suma) * 100}%` }} />
          ))}
    </div>
  );
}

export function Leyenda({ items }: { items: { etiqueta: string; color: string; valor?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map((i) => (
        <li key={i.etiqueta} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} aria-hidden="true" />
          {i.etiqueta}
          {i.valor && <span className="font-semibold tabular-nums text-slate-900">{i.valor}</span>}
        </li>
      ))}
    </ul>
  );
}

// ---- Estados vacíos y carga -----------------------------------------------------

export function Vacio({ children, icono = "info", compacto = false }: { children: ReactNode; icono?: IconoNombre; compacto?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center ${compacto ? "py-4" : "py-8"}`}>
      <Icono nombre={icono} className="h-5 w-5 text-slate-400" />
      <p className="max-w-md text-[13px] leading-snug text-slate-500">{children}</p>
    </div>
  );
}

export function Esqueleto({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/60 ${className}`} aria-hidden="true" />;
}

/** Misma geometría que el resumen: al llegar los datos no salta el layout. */
export function EsqueletoDashboard() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando métricas">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => (
          <Esqueleto key={i} className="h-[136px]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <Esqueleto className="h-80 lg:col-span-7" />
        <Esqueleto className="h-80 lg:col-span-5" />
      </div>
    </div>
  );
}
