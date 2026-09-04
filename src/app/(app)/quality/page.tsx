import { requerirSesion } from "@/lib/guard";
import { RevisionCalidad } from "./RevisionCalidad";

export default async function QualityPage() {
  await requerirSesion("/quality");
  return (
    <section>
      <h2 className="mb-5 text-lg font-semibold text-zinc-900">Control de calidad</h2>
      <RevisionCalidad />
    </section>
  );
}
