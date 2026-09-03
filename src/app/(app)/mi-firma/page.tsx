import { requerirSesion } from "@/lib/guard";
import { MiFirma } from "./MiFirma";

export default async function MiFirmaPage() {
  await requerirSesion("/mi-firma");
  return (
    <section>
      <div className="mb-5 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Mi firma</h2>
        <span className="rounded-full border border-[var(--atm-linea)] bg-white px-2 py-0.5 font-mono text-xs text-zinc-500">
          TSI-303
        </span>
      </div>
      <MiFirma />
    </section>
  );
}
