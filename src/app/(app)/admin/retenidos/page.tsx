import { requerirSesion } from "@/lib/guard";
import { AdminTabs } from "../AdminTabs";
import { Retenidos } from "./Retenidos";

export default async function RetenidosPage() {
  await requerirSesion("/admin/retenidos");
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-zinc-900">Retenidos</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Expedientes detenidos por una incidencia administrativa. Mientras la retención siga puesta, el
        médico los ve pero no puede pronunciarse. Revisa los antecedentes y levántala cuando la
        incidencia esté resuelta.
      </p>
      <AdminTabs />
      <Retenidos />
    </section>
  );
}
