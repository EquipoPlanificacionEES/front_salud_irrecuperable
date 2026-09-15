"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GC, queryKeys } from "@/lib/query-keys";
import { queryDeFiltros, type CasosDashboard, type DashboardOverview, type FiltrosDashboard } from "@/lib/dashboard";

/**
 * Consultas del dashboard ADMIN. Agregados: el navegador nunca recibe la lista
 * de casos para calcular; el drilldown llega paginado.
 *
 * SÓLO LECTURA. Nada de aquí escribe ni dispara eventos: ni abrir, ni refrescar,
 * ni navegar por el panel crea auditoría, revisiones o trabajos.
 */

/** Métricas que cambian con cada ratificación, pero nadie las mira segundo a segundo. */
const STALE_DASHBOARD = 60_000;

export function useDashboardOverview(filtros: FiltrosDashboard, opciones?: { enabled?: boolean }) {
  const q = queryDeFiltros(filtros);
  return useQuery({
    queryKey: queryKeys.admin.dashboard(q),
    queryFn: () => api<DashboardOverview>(`/admin/dashboard/overview${q ? `?${q}` : ""}`),
    staleTime: STALE_DASHBOARD,
    gcTime: GC.corto,
    placeholderData: (previo) => previo,
    enabled: opciones?.enabled ?? true,
  });
}

export function useDashboardCases(
  filtros: FiltrosDashboard,
  segmento: string | null,
  pagina: { limit: number; offset: number },
) {
  const q = queryDeFiltros(filtros, { segment: segmento ?? "", limit: pagina.limit, offset: pagina.offset });
  return useQuery({
    queryKey: queryKeys.admin.dashboardCases(q),
    queryFn: () => api<CasosDashboard>(`/admin/dashboard/cases?${q}`),
    enabled: segmento !== null,
    staleTime: STALE_DASHBOARD,
    gcTime: GC.corto,
    placeholderData: (previo) => previo,
  });
}

/** «Actualizar»: vuelve a pedir resumen y drilldown abiertos, con los mismos filtros. */
export function useActualizarDashboard() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: queryKeys.admin.dashboardTodo() }), [qc]);
}
