import { requerirSesion } from "@/lib/guard";
import { AdminTabs } from "../AdminTabs";
import { Carga } from "./Carga";
import { EnvioBot } from "./EnvioBot";

export default async function CargaPage() {
  await requerirSesion("/admin/carga");
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Carga y envío al bot</h2>
        <span className="rounded-full border border-[var(--atm-linea)] bg-white px-2 py-0.5 font-mono text-xs text-zinc-500">
          TSI-206
        </span>
      </div>
      <AdminTabs />

      <div className="space-y-10">
        <div>
          <h3 className="mb-1 text-base font-semibold text-zinc-900">1 · Descargar expedientes</h3>
          <p className="mb-4 text-sm text-zinc-500">Selecciona una semana habilitada y descarga sus expedientes.</p>
          <Carga />
        </div>
        <div>
          <h3 className="mb-1 text-base font-semibold text-zinc-900">2 · Procesar y enviar al bot</h3>
          <p className="mb-4 text-sm text-zinc-500">
            Elige las semanas a procesar y envía los expedientes listos al bot del backend.
          </p>
          <EnvioBot />
        </div>
      </div>
    </section>
  );
}
