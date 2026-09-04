"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-navegación del área de administración. Cada pestaña consume el backend real
// (/api/v1/admin/*, /api/v1/reports, /api/v1/exports).
const TABS = [
  { href: "/admin/semanas", etiqueta: "Semanas" },
  { href: "/admin/asignaciones", etiqueta: "Asignaciones" },
  { href: "/admin/reasignacion", etiqueta: "Reasignar" },
  { href: "/admin/casos", etiqueta: "Casos" },
  { href: "/admin/informes", etiqueta: "Informes" },
  { href: "/admin/exportaciones", etiqueta: "Exportaciones" },
  { href: "/admin/usuarios", etiqueta: "Usuarios" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-1 rounded-xl border border-[var(--atm-linea)] bg-white p-1 shadow-sm">
      {TABS.map((t) => {
        const activa = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              activa ? "bg-[var(--atm-azul)] text-white" : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {t.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
