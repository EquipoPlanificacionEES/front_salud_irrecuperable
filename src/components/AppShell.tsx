"use client";

import { usePathname } from "next/navigation";
import { NAV } from "@/lib/roles";
import { EnlaceNav } from "./EnlaceNav";
import { SelectorAmbito } from "./SelectorAmbito";
import { useSesion } from "./SesionProvider";

// Layout visual compartido (TSI-202) — cabecera + navegación, paleta ATM de la plataforma actual.
export function AppShell({ children }: { children: React.ReactNode }) {
  const { sesion, cerrarSesion, cerrandoSesion } = useSesion();
  const pathname = usePathname();
  const items = NAV.filter((i) => i.roles.includes(sesion.rol));

  return (
    <>
      <header className="flex items-center justify-between border-b border-[var(--atm-linea)] bg-white px-6 py-4">
        <div>
          <h1 className="text-base font-semibold text-zinc-900">Evaluación de Salud Irrecuperable</h1>
          {/*
            DÓNDE SE ESTÁ TRABAJANDO, siempre visible. Con un solo ámbito es
            texto; con varios, el selector. Que no sea evidente en qué región
            está uno es lo que hace que alguien firme un expediente creyendo que
            es de otra.
          */}
          <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
            <span>
              {sesion.nombre} · <span className="capitalize">{sesion.rol}</span>
            </span>
            {/*
              EN «MIS CASOS» EL SELECTOR NO PINTA NADA, Y ENSEÑARLO ENGAÑA.
              La bandeja del médico es GLOBAL: trae todos los expedientes que
              tiene asignados, del ámbito que sean, porque lo que le autoriza a
              verlos es su asignación y no dónde esté mirando. Dejar arriba un
              selector que parece gobernar la lista invita a cambiarlo para
              «ver los de la otra región» —y no hace nada—. Separar por ámbito
              se hace con las pestañas de la propia bandeja.
              Fuera de esa pantalla sigue igual para todos los roles.
            */}
            {!pathname.startsWith("/mis-tramites") && (
              <SelectorAmbito
                ambitos={sesion.ambitos}
                activoContractId={sesion.activoContractId}
                activoRegionId={sesion.activoRegionId}
              />
            )}
          </p>
        </div>
        {/* Reacciona al instante: cerrar sesión llama al backend, vacía la
            caché y navega, y antes el botón se quedaba mudo mientras tanto. */}
        <button
          onClick={() => cerrarSesion()}
          disabled={cerrandoSesion}
          className="rounded-lg border border-[var(--atm-azul2)] px-3 py-1.5 text-sm font-medium text-[var(--atm-azul)] hover:bg-blue-50 disabled:opacity-60"
        >
          {cerrandoSesion ? "Cerrando…" : "Cerrar sesión"}
        </button>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-[var(--atm-linea)] bg-white px-6 pt-3">
        {items.map((i) => {
          const activa = pathname === i.href || pathname.startsWith(i.href + "/");
          return (
            <EnlaceNav
              key={i.href}
              href={i.href}
              className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium ${
                activa
                  ? "border-b-2 border-[var(--atm-azul2)] text-[var(--atm-azul)]"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {i.etiqueta}
            </EnlaceNav>
          );
        })}
      </nav>

      <main className="flex-1 bg-[var(--atm-fondo)] px-6 py-8">
        {/* El dashboard ejecutivo lee mejor a lo ancho (matriz, tendencias, tablas por médico); el resto conserva su columna. */}
        <div className={`mx-auto ${pathname.startsWith("/admin/dashboard") ? "max-w-[1480px]" : "max-w-5xl"}`}>{children}</div>
      </main>
    </>
  );
}
