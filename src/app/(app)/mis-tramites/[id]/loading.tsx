import { FichaSkeleton } from "@/components/Skeleton";

export default function Cargando() {
  return (
    <section>
      <div className="mb-5 h-4 w-24 animate-pulse rounded bg-zinc-200/70" />
      <FichaSkeleton />
    </section>
  );
}
