"use client";

import { useQueryClient, useQuery, type QueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { GC, STALE, queryKeys, type AdminCasesFiltros, type AdminReportsFiltros } from "./query-keys";
import type {
  AdminDoctor,
  AdminUser,
  AssignmentContext,
  BatchListItem,
  DoctorWorkload,
  ExportJob,
  HeldCase,
  OperationalCase,
  ReportListItem,
} from "./backend";

/**
 * LAS CONSULTAS AL SERVIDOR, UNA POR RECURSO.
 *
 * El problema que resuelve este archivo: `GET /inbox` son 82,5 KB con los 93
 * expedientes del médico, y lo pedían por separado el resumen, la bandeja y la
 * ficha de un caso sin informe. Un recorrido normal —resumen, mis casos, abrir
 * un retenido, volver— descargaba la misma lista cuatro veces, 330 KB, y cada
 * vez borraba la pantalla para enseñar «Cargando…».
 *
 * Ahora hay UNA consulta por recurso. Quien la necesite la pide; la primera
 * dispara la petición y las demás reciben el mismo resultado. Al volver a una
 * vista, si el dato sigue fresco no se pide nada.
 *
 * Esto es estado de SERVIDOR. Lo que es de la interfaz —qué pestaña está
 * abierta, qué fila está desplegada, lo que hay escrito en un campo— sigue en
 * `useState`, que es su sitio.
 */

// ---------------------------------------------------------------- médico ----

const traerInbox = () => api<{ cases: OperationalCase[] }>("/inbox").then((d) => d.cases);

/**
 * La bandeja del médico. Compartida por el resumen, la bandeja y la ficha.
 *
 * `select` deriva subconjuntos SIN pedir nada más: las tres pestañas salen de
 * esta misma lista. Pásalo definido fuera del componente para que sea estable.
 */
export function useDoctorInbox<T = OperationalCase[]>(select?: (cases: OperationalCase[]) => T) {
  return useQuery({
    queryKey: queryKeys.doctor.inbox(),
    queryFn: traerInbox,
    staleTime: STALE.inbox,
    gcTime: GC.corto,
    select,
  });
}

export function useSignature() {
  return useQuery({
    queryKey: queryKeys.doctor.signature(),
    queryFn: () => api<{ hasSignature: boolean; updatedAt: string | null }>("/doctors/me/signature"),
    staleTime: STALE.signature,
    gcTime: GC.corto,
  });
}

// ----------------------------------------------------------------- casos ----

/**
 * El informe vigente de un expediente.
 *
 * `staleTime: 0` a propósito. Es el documento que el médico va a firmar: se
 * pinta el que ya está en caché para que la ficha aparezca entera al instante,
 * pero SIEMPRE se revalida por detrás. Nadie ratifica una versión superada
 * porque la caché dijera que aún valía.
 */
export function useCaseReport<T>(caseId: string, opciones?: { enabled?: boolean }) {
  return useQuery<T>({
    queryKey: queryKeys.cases.report(caseId),
    queryFn: () => api<T>(`/cases/${caseId}/report`),
    staleTime: STALE.caseReport,
    gcTime: GC.corto,
    enabled: opciones?.enabled ?? true,
    // Un 404 es un caso sin informe: legítimo, y la ficha lo sabe tratar.
    retry: false,
  });
}

/**
 * Prefetch del informe. Se llama al pasar el ratón o al enfocar una fila.
 *
 * NO se prefetchan los 93 informes de la bandeja: serían 93 peticiones para
 * abrir una. Sólo aquel sobre el que el usuario ya mostró intención.
 */
export function usePrefetchCaseReport() {
  const qc = useQueryClient();
  return (caseId: string) =>
    void qc.prefetchQuery({
      queryKey: queryKeys.cases.report(caseId),
      queryFn: () => api(`/cases/${caseId}/report`),
      staleTime: STALE.inbox, // no re-prefetchar en cada pasada del ratón
    });
}

// ----------------------------------------------------------------- admin ----

export function useBatches(filtros?: { status?: string; limit?: number }) {
  const limit = filtros?.limit ?? 200;
  const status = filtros?.status;
  const q = new URLSearchParams({ limit: String(limit) });
  if (status) q.set("status", status);
  return useQuery({
    queryKey: queryKeys.admin.batches({ status, limit }),
    queryFn: () => api<{ batches: BatchListItem[] }>(`/admin/batches?${q}`).then((d) => d.batches),
    staleTime: STALE.batches,
    gcTime: GC.largo,
  });
}

export function useDoctorWorkload() {
  return useQuery({
    queryKey: queryKeys.admin.doctorWorkload(),
    queryFn: () =>
      api<{ doctors: DoctorWorkload[] }>("/admin/doctor-workload?includeInactive=true").then(
        (d) => d.doctors,
      ),
    staleTime: STALE.doctorWorkload,
    gcTime: GC.largo,
  });
}

export function useHolds() {
  return useQuery({
    queryKey: queryKeys.admin.holds(),
    queryFn: () => api<{ holds: HeldCase[] }>("/admin/holds").then((d) => d.holds),
    staleTime: STALE.holds,
    gcTime: GC.corto,
  });
}

/**
 * Listado operacional con filtros.
 *
 * `placeholderData` conserva el resultado anterior mientras llega el nuevo: al
 * cambiar de semana o de médico la tabla NO se desmonta. Antes desaparecía, se
 * veía «Cargando…» y volvía a aparecer; con 93 filas eso es un salto de layout
 * de tres mil píxeles.
 */
export function useAdminCases(filtros: AdminCasesFiltros, opciones?: { enabled?: boolean }) {
  const q = new URLSearchParams({ limit: String(filtros.limit ?? 100) });
  if (filtros.batchId) q.set("batchId", filtros.batchId);
  if (filtros.assignment) q.set("assignment", filtros.assignment);
  if (filtros.doctorProfileId) q.set("doctorProfileId", filtros.doctorProfileId);
  return useQuery({
    queryKey: queryKeys.admin.cases(filtros),
    queryFn: () => api<{ cases: OperationalCase[]; total: number }>(`/admin/cases?${q}`),
    staleTime: STALE.adminCases,
    gcTime: GC.corto,
    enabled: opciones?.enabled ?? true,
    placeholderData: (previo) => previo,
  });
}

export function useReports(filtros: AdminReportsFiltros) {
  const q = new URLSearchParams({ limit: String(filtros.limit ?? 100) });
  if (filtros.batchId) q.set("batchId", filtros.batchId);
  if (filtros.workflowStatus) q.set("workflowStatus", filtros.workflowStatus);
  return useQuery({
    queryKey: queryKeys.reports(filtros),
    queryFn: () =>
      api<{
        reports: ReportListItem[];
        total: number;
        countsByWorkflowStatus: Record<string, number>;
      }>(`/reports?${q}`),
    staleTime: STALE.reports,
    gcTime: GC.corto,
    placeholderData: (previo) => previo,
  });
}

export function useAssignmentContext(batchId: string) {
  return useQuery({
    queryKey: queryKeys.admin.assignmentContext(batchId),
    queryFn: () => api<AssignmentContext>(`/admin/batches/${batchId}/assignment-context`),
    staleTime: STALE.adminCases,
    gcTime: GC.corto,
    enabled: Boolean(batchId),
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: queryKeys.admin.users(),
    queryFn: () => api<{ users: AdminUser[] }>("/admin/users?limit=200").then((d) => d.users),
    staleTime: STALE.usuarios,
    gcTime: GC.largo,
  });
}

export function useAdminDoctors() {
  return useQuery({
    queryKey: queryKeys.admin.doctors(),
    queryFn: () => api<{ doctors: AdminDoctor[] }>("/admin/doctors?limit=200").then((d) => d.doctors),
    staleTime: STALE.usuarios,
    gcTime: GC.largo,
  });
}

export function useExports(opciones?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: queryKeys.exports(),
    queryFn: () => api<{ exports: ExportJob[] }>("/exports?limit=50").then((d) => d.exports),
    staleTime: 0,
    gcTime: GC.corto,
    refetchInterval: opciones?.refetchInterval ?? false,
  });
}

// --------------------------------------------------------- invalidación ----

/**
 * QUÉ CADUCA CON CADA ACCIÓN.
 *
 * Escrito una vez, aquí, en vez de repartido por los `onSuccess` de cada
 * pantalla. Antes la estrategia era volver a pedirlo todo —o un
 * `router.refresh()`— y eso descarta también lo que la acción no tocó.
 *
 * Invalidar por PREFIJO: `["admin","cases"]` alcanza a todas las combinaciones
 * de filtros sin tener que enumerarlas.
 */
export function invalidacionesDe(qc: QueryClient) {
  const inv = (key: readonly unknown[]) => qc.invalidateQueries({ queryKey: key });

  return {
    /** El médico ratifica un informe: cambia el informe y su bandeja. */
    informeRatificado: (caseId: string) =>
      Promise.all([
        inv(queryKeys.cases.report(caseId)),
        inv(queryKeys.doctor.inbox()),
        inv(["reports"]),
      ]),
    /** El médico corrige: nace una versión nueva del informe. */
    informeCorregido: (caseId: string) =>
      Promise.all([
        inv(queryKeys.cases.report(caseId)),
        inv(queryKeys.cases.manualForm("")),
        inv(queryKeys.doctor.inbox()),
        inv(["reports"]),
      ]),
    /** Calidad devuelve un informe al médico. */
    informeDevuelto: (caseId?: string) =>
      Promise.all([
        caseId ? inv(queryKeys.cases.report(caseId)) : Promise.resolve(),
        inv(["reports"]),
        inv(queryKeys.doctor.inbox()),
      ]),
    /** Se levanta una retención, con o sin reproceso. */
    retencionResuelta: (caseId: string) =>
      Promise.all([
        inv(queryKeys.admin.holds()),
        inv(["admin", "cases"]),
        inv(queryKeys.cases.report(caseId)),
        inv(queryKeys.doctor.inbox()),
      ]),
    /** Se reparte o se mueve trabajo entre médicos. */
    asignacionesCambiadas: () =>
      Promise.all([
        inv(queryKeys.admin.doctorWorkload()),
        inv(["admin", "cases"]),
        inv(["admin", "assignment-context"]),
        inv(["admin", "batches"]),
        inv(queryKeys.doctor.inbox()),
      ]),
    /** Se abre, cierra o reabre una semana. */
    lotesCambiados: () =>
      Promise.all([inv(["admin", "batches"]), inv(["admin", "assignment-context"])]),
    /** Alta o edición de personas. */
    usuariosCambiados: () =>
      Promise.all([
        inv(queryKeys.admin.users()),
        inv(queryKeys.admin.doctors()),
        inv(queryKeys.admin.doctorWorkload()),
      ]),
    /** La firma del médico. */
    firmaCambiada: () => inv(queryKeys.doctor.signature()),
    /** Se encola una exportación. */
    exportacionEncolada: () => inv(queryKeys.exports()),
  };
}

/** Azúcar para usarlo dentro de un componente. */
export function useInvalidar() {
  return invalidacionesDe(useQueryClient());
}
