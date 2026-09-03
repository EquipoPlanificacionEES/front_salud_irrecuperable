import { requerirSesion } from "@/lib/guard";
import { Placeholder } from "@/components/Placeholder";

export default async function KpiPage() {
  await requerirSesion("/kpi");
  return <Placeholder titulo="KPI" ticket="TSI-202" />;
}
