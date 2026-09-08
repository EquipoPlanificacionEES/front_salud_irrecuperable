import { TablaSkeleton } from "@/components/Skeleton";

/**
 * Vale para las ocho pestañas de administración: todas son un encabezado, la
 * sub-navegación y una tabla. Un `loading.tsx` por pestaña sería el mismo
 * archivo ocho veces.
 */
export default function Cargando() {
  return (
    <section>
      <div className="mb-1 h-6 w-40 animate-pulse rounded bg-zinc-200/70" />
      <div className="mb-4 h-4 w-96 animate-pulse rounded bg-zinc-200/70" />
      <div className="mb-6 h-11 animate-pulse rounded-xl bg-zinc-200/50" />
      <TablaSkeleton filas={8} columnas={6} />
    </section>
  );
}
