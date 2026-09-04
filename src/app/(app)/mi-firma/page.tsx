import { requerirSesion } from "@/lib/guard";
import { MiFirma } from "./MiFirma";

export default async function MiFirmaPage() {
  await requerirSesion("/mi-firma");
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-zinc-900">Mi firma</h2>
      <p className="mb-5 text-sm text-zinc-500">
        La imagen que se estampa en los informes que ratificas.
      </p>
      <MiFirma />
    </section>
  );
}
