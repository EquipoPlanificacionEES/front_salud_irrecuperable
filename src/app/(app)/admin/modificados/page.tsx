import { requerirSesion } from "@/lib/guard";
import { AdminTabs } from "../AdminTabs";
import { Modificados } from "./Modificados";

export default async function ModificadosPage() {
  await requerirSesion("/admin/modificados");
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold text-zinc-900">Casos modificados</h2>
      <AdminTabs />
      <p className="mb-4 text-sm text-zinc-500">
        Expedientes donde el médico modificó la propuesta del bot y su calificación final.
      </p>
      <Modificados />
    </section>
  );
}
