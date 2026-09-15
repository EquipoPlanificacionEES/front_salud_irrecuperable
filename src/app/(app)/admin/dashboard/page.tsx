import { requerirSesion } from "@/lib/guard";
import { AdminTabs } from "../AdminTabs";
import { Dashboard } from "./Dashboard";

export default async function DashboardPage() {
  await requerirSesion("/admin/dashboard");
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-zinc-900">Dashboard</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Operación, concordancia IA–Médico, tiempos del ciclo y calidad del ámbito activo. Cada porcentaje va con su
        denominador; lo que no tiene datos se muestra como «—».
      </p>
      <AdminTabs />
      <Dashboard />
    </section>
  );
}
