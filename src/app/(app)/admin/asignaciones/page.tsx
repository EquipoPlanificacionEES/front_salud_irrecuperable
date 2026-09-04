import { Suspense } from "react";
import { requerirSesion } from "@/lib/guard";
import { AdminTabs } from "../AdminTabs";
import { Asignaciones } from "./Asignaciones";

export default async function AsignacionesPage() {
  await requerirSesion("/admin/asignaciones");
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-zinc-900">Asignaciones</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Reparte los casos sin asignar de una semana entre los médicos. Tú pones la cantidad de cada uno; no hay reparto automático.
      </p>
      <AdminTabs />
      <Suspense fallback={<p className="text-sm text-zinc-400">Cargando…</p>}>
        <Asignaciones />
      </Suspense>
    </section>
  );
}
