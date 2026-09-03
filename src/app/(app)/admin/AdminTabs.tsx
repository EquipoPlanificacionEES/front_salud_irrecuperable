"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-navegación del área de administración: cada tarea del admin en su pestaña.
const TABS = [
  { href: "/admin", etiqueta: "Resumen" },
  { href: "/admin/carga", etiqueta: "Carga y envío al bot" },
  { href: "/admin/automation", etiqueta: "Automatización" },
  { href: "/admin/historial-bot", etiqueta: "Historial BOT" },
  { href: "/admin/modificados", etiqueta: "Casos modificados" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-[var(--atm-linea)]">
      {TABS.map((t) => {
        const activa = t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-t-lg px-3 py-2 text-sm font-medium ${
              activa
                ? "border-b-2 border-[var(--atm-azul2)] text-[var(--atm-azul)]"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
