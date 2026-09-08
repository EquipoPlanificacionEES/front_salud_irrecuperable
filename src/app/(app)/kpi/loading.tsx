import { KpiSkeleton } from "@/components/Skeleton";

export default function Cargando() {
  return (
    <section>
      <div className="mb-1 h-6 w-32 animate-pulse rounded bg-zinc-200/70" />
      <div className="mb-4 h-4 w-64 animate-pulse rounded bg-zinc-200/70" />
      <KpiSkeleton tarjetas={5} />
    </section>
  );
}
