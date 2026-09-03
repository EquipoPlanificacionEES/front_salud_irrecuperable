import Link from "next/link";
import { requerirSesion } from "@/lib/guard";
import { AdminTabs } from "./AdminTabs";

const SECCIONES = [
  { href: "/admin/carga", titulo: "Carga y envío al bot", desc: "Descarga expedientes por semana y envíalos al bot para su procesamiento.", ticket: "TSI-206" },
  { href: "/admin/automation", titulo: "Automatización", desc: "Estado del BOT: progreso, casos encontrados/descargados, errores.", ticket: "TSI-207" },
  { href: "/admin/historial-bot", titulo: "Historial BOT", desc: "Tus corridas del bot: fecha, run, región, resultados y duración.", ticket: "TSI-208" },
  { href: "/admin/modificados", titulo: "Casos modificados", desc: "Expedientes donde el médico modificó la propuesta y qué campos cambió.", ticket: "—" },
];

export default async function AdminPage() {
  const sesion = await requerirSesion("/admin");
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Administración</h2>
        <span className="rounded-full border border-[var(--atm-linea)] bg-white px-2 py-0.5 font-mono text-xs text-zinc-500">
          {sesion.region ?? "Nacional"}
        </span>
      </div>
      <AdminTabs />
      <div className="grid gap-4 sm:grid-cols-2">
        {SECCIONES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-xl border border-[var(--atm-linea)] bg-white p-5 shadow-sm hover:border-[var(--atm-azul2)]"
          >
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold text-zinc-900">{s.titulo}</h3>
              <span className="font-mono text-xs text-zinc-400">{s.ticket}</span>
            </div>
            <p className="mt-1 text-sm text-zinc-600">{s.desc}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
