import { requerirSesion } from "@/lib/guard";
import { AdminTabs } from "../AdminTabs";
import { Exportaciones } from "./Exportaciones";

export default async function ExportacionesPage() {
  await requerirSesion("/admin/exportaciones");
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-zinc-900">Exportaciones</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Genera un ZIP con los informes finales firmados. El worker lo arma en segundo plano.
      </p>
      <AdminTabs />
      <Exportaciones />
    </section>
  );
}
