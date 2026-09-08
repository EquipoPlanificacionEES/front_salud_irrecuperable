/**
 * ESQUELETOS DE CARGA.
 *
 * Reservan el sitio del contenido real, y por eso llevan las mismas alturas y
 * el mismo número de columnas. En la medición previa el panel del médico
 * colapsaba de 3.898 px a 592 px y volvía a crecer en cada visita: el salto no
 * lo causaba la lentitud sino que la pantalla se quedaba sin nada que ocupar el
 * hueco.
 *
 * Se usan SÓLO en la primera carga, cuando de verdad no hay nada que enseñar.
 * Un refresco de fondo mantiene el contenido en pantalla; para eso está
 * `Refrescando`.
 *
 * Sin dependencias nuevas: el proyecto no usa shadcn, sino el kit propio de
 * `admin/ui.tsx`, y esto sigue sus convenciones.
 */

function Barra({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-200/70 ${className}`} />;
}

/** Tarjetas de cifras, como las del resumen. */
export function KpiSkeleton({ tarjetas = 5, conTabla = false }: { tarjetas?: number; conTabla?: boolean }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando el resumen…</span>
      <Barra className="h-4 w-64" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: tarjetas }, (_, i) => (
          <div key={i} className="rounded-xl border border-[var(--atm-linea)] bg-white px-4 py-3 shadow-sm">
            <Barra className="h-3 w-20" />
            <Barra className="mt-2 h-7 w-12" />
          </div>
        ))}
      </div>
      {conTabla && <TablaSkeleton filas={6} columnas={5} />}
    </div>
  );
}

/** Cuerpo de tabla. `filas` debe parecerse a lo que se espera, no a un número redondo. */
export function TablaSkeleton({ filas = 8, columnas = 4 }: { filas?: number; columnas?: number }) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Cargando el listado…</span>
      <div className="flex gap-4 bg-[var(--atm-th)] px-4 py-2.5">
        {Array.from({ length: columnas }, (_, i) => (
          <Barra key={i} className="h-3 flex-1 bg-white/25" />
        ))}
      </div>
      {Array.from({ length: filas }, (_, f) => (
        <div key={f} className="flex items-center gap-4 border-t border-[var(--atm-linea)] px-4 py-3">
          {Array.from({ length: columnas }, (_, c) => (
            <Barra key={c} className={`h-3.5 flex-1 ${c === 0 ? "max-w-24" : ""}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** La bandeja: pestañas, buscador y tabla. */
export function BandejaSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Barra className="h-9 w-64 rounded-lg" />
        <Barra className="ml-auto h-9 w-56 rounded-lg" />
      </div>
      <TablaSkeleton filas={8} columnas={4} />
    </div>
  );
}

/** La ficha de un expediente: cabecera, secciones y acciones. */
export function FichaSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando el expediente…</span>
      <div className="rounded-xl border border-[var(--atm-linea)] bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <Barra className="h-5 w-56" />
            <Barra className="mt-2 h-3 w-40" />
          </div>
          <Barra className="h-8 w-28 rounded-lg" />
        </div>
      </div>
      {[0, 1, 2].map((s) => (
        <div key={s} className="rounded-xl border border-[var(--atm-linea)] bg-white px-5 py-4 shadow-sm">
          <Barra className="h-4 w-40" />
          <div className="mt-3 space-y-2">
            <Barra className="h-3 w-full" />
            <Barra className="h-3 w-full" />
            <Barra className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * INDICADOR DE REFRESCO EN SEGUNDO PLANO.
 *
 * Discreto y a un lado: el contenido de debajo sigue siendo válido y utilizable.
 * Esto es lo contrario de un spinner que tapa la pantalla.
 */
export function Refrescando({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-zinc-400"
      role="status"
      aria-live="polite"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--atm-azul2)]" />
      Actualizando…
    </span>
  );
}
