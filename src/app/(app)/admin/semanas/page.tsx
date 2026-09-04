import { requerirSesion } from "@/lib/guard";
import { AdminTabs } from "../AdminTabs";
import { Semanas } from "./Semanas";

export default async function SemanasPage() {
  await requerirSesion("/admin/semanas");
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-zinc-900">Semanas (lotes)</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Cada semana es un lote de expedientes. El bot los crea al nombrarlos; aquí también puedes abrir uno a mano.
      </p>
      <AdminTabs />
      <Semanas />
    </section>
  );
}
