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
export function useDoctorInbox<T = OperationalCase[]>(
  select?: (cases: OperationalCase[]) => T,
  opciones?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.doctor.inbox(),
    queryFn: traerInbox,
    staleTime: STALE.inbox,
    gcTime: GC.corto,
    select,
    enabled: opciones?.enabled ?? true,
  });
}

export function useSignature<T>(opciones?: { enabled?: boolean }) {
  return useQuery<T>({
    queryKey: queryKeys.doctor.signature(),
    queryFn: () => api<T>("/doctors/me/signature"),
    staleTime: STALE.signature,
    gcTime: GC.corto,
    enabled: opciones?.enabled ?? true,
  });
}

// ----------------------------------------------------------------- casos ----

/**
 * El informe vigente de un expediente.
 *
 * Se pinta el que ya está en caché para que la ficha aparezca entera al instante
 * en vez de reconstruirse. Sobre por qué la frescura es de cinco segundos y no
 * de cero, ver `STALE.caseReport`: el razonamiento importa, porque la intuición
 * dice lo contrario.
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
 * CALENTAR LA CACHÉ SIN QUE UN FALLO MOLESTE A NADIE.
 *
 * Sustituye a `prefetchQuery`, que en la 5.102 está marcada como obsoleta y
 * desaparece en la 6. La equivalencia es exacta y no es una interpretación: la
 * implementación de `prefetchQuery` ERA `fetchQuery(options).then(noop).catch(noop)`,
 * y `query()` es `fetchQuery()` con un `select` opcional que aquí no se usa.
 *
 * El `catch` es la mitad que hay que conservar. `query()` rechaza la promesa, y
 * un prefetch que revienta —la red se cayó, el informe ya no está— no es un
 * error de nadie: quien de verdad necesite el dato lo pedirá con su consulta y
 * verá el fallo entonces, en su sitio. Sin esto habría rechazos sin capturar
 * cada vez que el ratón pasa por una fila.
 */
type OpcionesDeConsulta = Parameters<QueryClient["query"]>[0];

export function precalentar(qc: QueryClient, opciones: OpcionesDeConsulta): void {
  void qc.query(opciones).catch(() => {
    /* deliberado: ver arriba */
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
    precalentar(qc, {
      queryKey: queryKeys.cases.report(caseId),
      queryFn: () => api(`/cases/${caseId}/report`),
      // La MISMA frescura que la consulta que lo va a consumir. Con una distinta,
      // el montaje descartaría lo prefetchado y pediría el informe dos veces:
      // medido, y era exactamente lo que pasaba.
      staleTime: STALE.caseReport,
    });
}

// ----------------------------------------------------------------- admin ----

export function useBatches(
  filtros?: { status?: string; limit?: number },
  opciones?: { enabled?: boolean },
) {
  const limit = filtros?.limit ?? 200;
  const status = filtros?.status;
  const q = new URLSearchParams({ limit: String(limit) });
  if (status) q.set("status", status);
  return useQuery({
    queryKey: queryKeys.admin.batches({ status, limit }),
    queryFn: () => api<{ batches: BatchListItem[] }>(`/admin/batches?${q}`).then((d) => d.batches),
    staleTime: STALE.batches,
    gcTime: GC.largo,
    enabled: opciones?.enabled ?? true,
  });
}

export function useDoctorWorkload(opciones?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.admin.doctorWorkload(),
    queryFn: () =>
      api<{ doctors: DoctorWorkload[] }>("/admin/doctor-workload?includeInactive=true").then(
        (d) => d.doctors,
      ),
    staleTime: STALE.doctorWorkload,
    gcTime: GC.largo,
    enabled: opciones?.enabled ?? true,
  });
}

export function useHolds(opciones?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.admin.holds(),
    queryFn: () => api<{ holds: HeldCase[] }>("/admin/holds").then((d) => d.holds),
    staleTime: STALE.holds,
    gcTime: GC.corto,
    enabled: opciones?.enabled ?? true,
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

/** Un trabajo en estos estados todavía se está cociendo. */
const EXPORT_EN_CURSO = new Set(["PENDING", "PROCESSING"]);

/**
 * Las exportaciones, con sondeo MIENTRAS haga falta.
 *
 * `refetchInterval` mira el resultado actual: si no queda ningún trabajo en
 * curso, devuelve `false` y el sondeo se para solo. El `setInterval` que había
 * antes seguía pidiendo el listado cada tres segundos para siempre, aunque todo
 * estuviera terminado y nadie mirara la pantalla.
 */
export function useExports(opciones?: { intervaloMs?: number }) {
  const intervalo = opciones?.intervaloMs ?? 3000;
  return useQuery({
    queryKey: queryKeys.exports(),
    queryFn: () => api<{ exports: ExportJob[] }>("/exports?limit=50").then((d) => d.exports),
    staleTime: 0,
    gcTime: GC.corto,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((j) => EXPORT_EN_CURSO.has(j.status)) ? intervalo : false,
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
    /**
     * El médico ratifica.
     *
     * `informeYaRefrescado` existe porque ratificar sondea el informe hasta que
     * el worker emite el documento firmado: cuando termina, el que hay en caché
     * ES el vigente. Invalidarlo entonces pediría el mismo documento otra vez,
     * que es justo el gasto que este trabajo vino a quitar.
     */
    informeRatificado: (caseId: string, opciones?: { informeYaRefrescado?: boolean }) =>
      Promise.all([
        opciones?.informeYaRefrescado ? Promise.resolve() : inv(queryKeys.cases.report(caseId)),
        inv(queryKeys.doctor.inbox()),
        inv(["reports"]),
      ]),
    /**
     * El médico corrige: nace una versión nueva del informe.
     *
     * Invalidar el informe basta para que la ficha muestre la versión nueva —una
     * consulta activa se vuelve a pedir sola al caducarla—, así que quien llama
     * NO tiene que recargar además por su cuenta.
     */
    informeCorregido: (caseId: string) =>
      Promise.all([
        inv(queryKeys.cases.report(caseId)),
        inv(["cases", "manual-form"]),
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
    /**
     * Se rectificó el identificador de un expediente, quizá absorbiendo otro.
     * Cambia cómo se llama el caso en TODAS partes, y el absorbido deja de
     * aparecer como activo: se invalida el listado entero, no una fila.
     */
    identificadorRectificado: (caseId: string) =>
      Promise.all([
        inv(["admin", "cases"]),
        inv(["reports"]),
        inv(queryKeys.admin.holds()),
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
