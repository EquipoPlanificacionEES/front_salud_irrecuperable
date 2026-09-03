import { requerirSesion } from "@/lib/guard";
import { Bandeja } from "./Bandeja";

export default async function MisTramitesPage() {
  await requerirSesion("/mis-tramites");
  return (
    <section>
      <div className="mb-5 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Mis trámites</h2>
        <span className="rounded-full border border-[var(--atm-linea)] bg-white px-2 py-0.5 font-mono text-xs text-zinc-500">
          TSI-301
        </span>
      </div>
      <Bandeja />
    </section>
  );
}
