import { requerirSesion } from "@/lib/guard";
import { KpiPanel } from "./KpiPanel";

export default async function KpiPage() {
  const sesion = await requerirSesion("/kpi");
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-zinc-900">Resumen</h2>
      <p className="mb-4 text-sm text-zinc-500">
        {sesion.rol === "medico"
          ? "Tu situación en el contrato."
          : "Estado del contrato: semanas, casos y carga de los médicos."}
      </p>
      <KpiPanel rol={sesion.rol} nombre={sesion.nombre} contrato={sesion.contrato} />
    </section>
  );
}
