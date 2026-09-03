import { requerirSesion } from "@/lib/guard";
import { AdminTabs } from "../AdminTabs";
import { HistorialBot } from "./HistorialBot";

export default async function HistorialBotPage() {
  await requerirSesion("/admin/historial-bot");
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Historial BOT</h2>
        <span className="rounded-full border border-[var(--atm-linea)] bg-white px-2 py-0.5 font-mono text-xs text-zinc-500">
          TSI-208
        </span>
      </div>
      <AdminTabs />
      <HistorialBot />
    </section>
  );
}
