import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

/**
 * PINTAR UN COMPONENTE QUE CONSULTA AL SERVIDOR.
 *
 * Cada llamada crea un `QueryClient` NUEVO. Es deliberado: una caché compartida
 * entre pruebas haría que una prueba pasara por lo que dejó la anterior, que es
 * exactamente el fallo que estas pruebas existen para descartar.
 *
 * `retry: false` para que un error se vea en la aserción en vez de reintentarse
 * hasta el tiempo de espera.
 */
export function crearQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

export function Envoltura({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** `render` con el proveedor de consultas ya puesto. Devuelve también el cliente. */
export function pintarConQuery(
  ui: ReactElement,
  client: QueryClient = crearQueryClient(),
): RenderResult & { client: QueryClient } {
  const r = render(<Envoltura client={client}>{ui}</Envoltura>);
  return Object.assign(r, {
    client,
    rerender: (nuevo: ReactElement) => r.rerender(<Envoltura client={client}>{nuevo}</Envoltura>),
  });
}
