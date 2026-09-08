"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiFallo } from "@/lib/api";

/**
 * LA CACHÉ DE ESTADO DE SERVIDOR.
 *
 * Sólo en memoria. NO se persiste —ni `localStorage`, ni `sessionStorage`, ni
 * IndexedDB, ni `persistQueryClient`— porque aquí dentro viaja el expediente
 * clínico de una persona identificada, y un dispositivo compartido no debe
 * conservarlo cuando la sesión termina. Al cerrar sesión se vacía entera; ver
 * `SesionProvider`.
 *
 * `useState` con inicializador perezoso, no `new QueryClient()` en el cuerpo:
 * así se crea UNA vez por instancia de cliente. Construirlo en cada render
 * tiraría la caché en cada re-render, que es lo contrario de lo que se busca.
 */

/** Un 401/403 no se reintenta: la respuesta no va a cambiar por insistir. */
function reintentar(fallos: number, error: unknown): boolean {
  if (error instanceof ApiFallo && error.status >= 400 && error.status < 500) return false;
  return fallos < 2;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Sin `staleTime` por defecto a propósito: cada recurso declara el
            // suyo en `STALE`. Un valor único para todo sería o demasiado corto
            // para los lotes o demasiado largo para una retención.
            retry: reintentar,
            // Volver a la pestaña no vuelve a pedir todo: si el dato sigue
            // fresco según SU `staleTime`, no hay nada que refrescar. Lo que
            // está stale sí se revalida, y con el contenido en pantalla.
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
          },
          mutations: { retry: false },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
