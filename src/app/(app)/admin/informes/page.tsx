import { requerirSesion } from "@/lib/guard";
import { AdminTabs } from "../AdminTabs";
import { Informes } from "./Informes";

export default async function InformesPage() {
  await requerirSesion("/admin/informes");
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-zinc-900">Informes</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Listado de informes (ReportSnapshot vigente por caso) con su punto en el circuito. El backend hace los filtros.
      </p>
      <AdminTabs />
      <Informes />
    </section>
  );
}
