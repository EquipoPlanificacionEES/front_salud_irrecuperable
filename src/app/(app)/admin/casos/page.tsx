import { requerirSesion } from "@/lib/guard";
import { AdminTabs } from "../AdminTabs";
import { Casos } from "./Casos";

export default async function CasosPage() {
  await requerirSesion("/admin/casos");
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-zinc-900">Casos</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Listado operacional. Filtra por semana, estado o asignación; reasigna o libera el responsable de un caso.
      </p>
      <AdminTabs />
      <Casos />
    </section>
  );
}
