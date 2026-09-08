/**
 * LAS CLAVES DE CACHÉ, EN UN SOLO SITIO.
 *
 * Una clave escrita a mano en el componente que la usa es una invalidación que
 * algún día no coincidirá con la consulta que pretendía invalidar, y el fallo no
 * se ve: la pantalla simplemente enseña un dato viejo. Aquí están todas, y las
 * mutaciones invalidan usando estas mismas funciones.
 *
 * JERARQUÍA. `["admin","cases"]` es prefijo de `["admin","cases",{...filtros}]`,
 * así que invalidar lo primero alcanza a todas las combinaciones de filtros sin
 * enumerarlas. Es la razón de que el objeto de parámetros vaya SIEMPRE al final.
 */

export interface AdminCasesFiltros {
  batchId?: string;
  doctorProfileId?: string;
  assignment?: string;
  limit?: number;
}

export interface AdminReportsFiltros {
  batchId?: string;
  workflowStatus?: string;
  limit?: number;
}

export const queryKeys = {
  doctor: {
    /** Prefijo de todo lo del médico. */
    todo: () => ["doctor"] as const,
    /** `GET /inbox` — la bandeja del médico que llama. Una sola para toda la app. */
    inbox: () => ["doctor", "inbox"] as const,
    /** `GET /doctors/me/signature`. */
    signature: () => ["doctor", "signature"] as const,
  },
  cases: {
    todo: () => ["cases"] as const,
    /** `GET /cases/{id}/report` — el snapshot vigente del expediente. */
    report: (caseId: string) => ["cases", caseId, "report"] as const,
    /** `GET /reports/{reportId}/manual-form`. */
    manualForm: (reportId: string) => ["cases", "manual-form", reportId] as const,
  },
  admin: {
    todo: () => ["admin"] as const,
    batches: (filtros?: { status?: string; limit?: number }) =>
      ["admin", "batches", filtros ?? {}] as const,
    doctorWorkload: () => ["admin", "doctor-workload"] as const,
    holds: () => ["admin", "holds"] as const,
    cases: (filtros: AdminCasesFiltros) => ["admin", "cases", filtros] as const,
    assignmentContext: (batchId: string) => ["admin", "assignment-context", batchId] as const,
    users: () => ["admin", "users"] as const,
    doctors: () => ["admin", "doctors"] as const,
  },
  /** `GET /reports` — el listado, que usan Informes (admin) y Calidad. */
  reports: (filtros: AdminReportsFiltros) => ["reports", filtros] as const,
  exports: () => ["exports"] as const,
} as const;

/**
 * CUÁNTO DURA FRESCO CADA DATO.
 *
 * No hay un valor único: el criterio es quién mueve el dato y con qué retraso
 * puede enterarse quien lo mira. Un lote lo abre una persona a mano cada semana;
 * una retención la puede levantar otro administrador ahora mismo.
 */
export const STALE = {
  /** La bandeja la mueven las acciones del propio médico —que invalidan— y los
   *  workers de firma, que no avisan. 30 s cubre ir y volver sin ocultar nada. */
  inbox: 30_000,
  /** Documento clínico que se va a firmar: se sirve del caché al instante pero se
   *  revalida siempre, para que nadie ratifique una versión superada. */
  caseReport: 0,
  manualForm: 0,
  /** Incidencia administrativa: varios administradores pueden actuar a la vez. */
  holds: 15_000,
  /** Los mueven las asignaciones y el pipeline. */
  adminCases: 20_000,
  reports: 30_000,
  /** Un lote se crea o se cierra a mano, rara vez. */
  batches: 5 * 60_000,
  /** Cambia con cada asignación, y ésas invalidan explícitamente. */
  doctorWorkload: 60_000,
  /** Administración de personas: muy estable. */
  usuarios: 5 * 60_000,
  signature: 5 * 60_000,
} as const;

export const GC = {
  /** Lo clínico no se queda en memoria más de lo necesario. */
  corto: 5 * 60_000,
  largo: 30 * 60_000,
} as const;
