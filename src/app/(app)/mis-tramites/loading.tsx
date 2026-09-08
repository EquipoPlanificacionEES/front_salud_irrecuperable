import { BandejaSkeleton } from "@/components/Skeleton";

export default function Cargando() {
  return (
    <section>
      <div className="mb-5 h-6 w-32 animate-pulse rounded bg-zinc-200/70" />
      <BandejaSkeleton />
    </section>
  );
}
