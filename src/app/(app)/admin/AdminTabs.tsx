"use client";

import { usePathname } from "next/navigation";
import { EnlaceNav } from "@/components/EnlaceNav";

/**
 * Sub-navegación del área de administración. Cada pestaña consume el backend real
 * (/api/v1/admin/*, /api/v1/reports, /api/v1/exports).
 *
 * CONTROL PREVIO SALIÓ DE AQUÍ en octubre de 2026, y no porque sobre la pantalla:
 * dejó de ser un paso del flujo. Mientras una advertencia administrativa retenía
 * el documento, alguien tenía que entrar a validarla para que un informe ya
 * ratificado pudiera cerrarse. Esa regla se retiró —ratificar emite—, así que la
 * pantalla ya no es una parada obligatoria.
 *
 * La ruta, los endpoints y el historial de QA SIGUEN EXISTIENDO: se usan para
 * auditoría y soporte técnico, y `/admin/control-previo` responde si se escribe.
 * Lo que no hace es pedirle a coordinación que pase por ahí cada semana.
 */
export const TABS = [
  { href: "/admin/dashboard", etiqueta: "Dashboard" },
  { href: "/admin/semanas", etiqueta: "Semanas" },
  { href: "/admin/asignaciones", etiqueta: "Asignaciones" },
  { href: "/admin/reasignacion", etiqueta: "Reasignar" },
  { href: "/admin/casos", etiqueta: "Casos" },
  { href: "/admin/retenidos", etiqueta: "Retenidos" },
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
          <EnlaceNav
            key={t.href}
            href={t.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              activa ? "bg-[var(--atm-azul)] text-white" : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {t.etiqueta}
          </EnlaceNav>
        );
      })}
    </nav>
  );
}
