import { requerirSesion } from "@/lib/guard";
import { Bandeja } from "./Bandeja";

export default async function MisTramitesPage() {
  await requerirSesion("/mis-tramites");
  return (
    <section>
      <h2 className="mb-5 text-lg font-semibold text-zinc-900">Mis casos</h2>
      <Bandeja />
    </section>
  );
}
