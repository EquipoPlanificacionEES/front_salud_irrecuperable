import { requerirSesion } from "@/lib/guard";
import { AdminTabs } from "../AdminTabs";
import { Reasignar } from "./Reasignar";

export default async function ReasignacionPage() {
  await requerirSesion("/admin/reasignacion");
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-zinc-900">Reasignar casos</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Durante la operación: mueve casos ya asignados de un médico a otro, o déjalos sin responsable. Cada
        movimiento se hace caso por caso y queda en el historial con su motivo.
      </p>
      <AdminTabs />
      <Reasignar />
    </section>
  );
}
