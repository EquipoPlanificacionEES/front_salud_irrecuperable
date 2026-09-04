import { requerirSesion } from "@/lib/guard";
import { MiFirma } from "./MiFirma";

export default async function MiFirmaPage() {
  await requerirSesion("/mi-firma");
  return (
    <section>
      <h2 className="mb-5 text-lg font-semibold text-zinc-900">Mi firma</h2>
      <MiFirma />
    </section>
  );
}
