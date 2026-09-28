import { requerirSesion } from "@/lib/guard";
import { AdminTabs } from "../AdminTabs";
import { ControlPrevio } from "./ControlPrevio";

export default async function ControlPrevioPage() {
  await requerirSesion("/admin/control-previo");
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-zinc-900">Control previo</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Advertencias sobre los antecedentes de cada expediente. No detienen al médico: puede
        trabajarlos y ratificarlos igual. Lo que espera por esta revisión es la emisión del documento
        final. Cuando revises la última advertencia de un expediente ya ratificado, el documento se
        emite solo.
      </p>
      <AdminTabs />
      <ControlPrevio />
    </section>
  );
}
