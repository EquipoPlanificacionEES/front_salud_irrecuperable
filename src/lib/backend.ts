// Tipos del backend real (espejo de los esquemas Zod de /api/v1). Solo lo que el
// front consume. Fuente de verdad: http://localhost:3000/openapi.json

export type BatchStatus = "OPEN" | "CLOSED";
export type ReportWorkflowStatus =
  | "READY_FOR_REVIEW"
  | "CHANGES_REQUESTED"
  | "APPROVED"
  | "SIGNING"
  | "SIGNED"
  | "SIGNING_FAILED";
export type CaseStatus =
  | "DISCOVERED" | "DOWNLOADING" | "DOWNLOADED" | "DOWNLOAD_FAILED"
  | "QUEUED_ANALYSIS" | "ANALYZING" | "ANALYZED" | "ANALYSIS_FAILED"
  | "UNASSIGNED" | "ASSIGNED" | "MEDICAL_REVIEW" | "RESOLVED"
  | "AWAITING_DOCUMENTS" | "NOT_EVALUABLE" | "REPORT_GENERATED"
  | "QUALITY_REVIEW" | "RETURNED_FOR_CORRECTION" | "APPROVED" | "DELIVERED";
export type Orientation = "RECOVERABLE" | "IRRECOVERABLE" | "INDETERMINATE";

/**
 * LA CATEGORÍA OPERACIONAL DEL EXPEDIENTE. La decide el backend
 * (`classifyCase`) y llega resuelta en cada caso.
 *
 * Aquí NO se recompone. Que cada pantalla se calculara la suya fue el defecto:
 * la bandeja del médico sumaba 90 y el panel del administrador decía 93 sobre
 * los mismos expedientes, y tres de ellos no aparecían en ninguna lista.
 */
export type CaseClassification =
  | "SIGNED"
  | "SIGNING_FAILED"
  | "SIGNING"
  | "HOLD"
  | "UNASSIGNED"
  | "NO_REPORT"
  | "PENDING_REVIEW"
  | "UNCLASSIFIED";

export type CaseClassificationCounts = Record<CaseClassification, number>;

/**
 * EL FORMULARIO PARA COMPLETAR UN INFORME, tal como lo describe el backend.
 *
 * Qué se precarga, qué se puede editar, qué es obligatorio y qué NO pudo
 * establecer el sistema lo decide el servidor desde el mismo modelo que imprime
 * el documento. Aquí no se inventa ninguna regla: si vivieran en el navegador,
 * la primera divergencia sería un campo que la pantalla da por opcional y el
 * servidor rechaza.
 */
export interface ManualFormField {
  key: string;
  label: string;
  kind: "TEXT" | "LONG_TEXT" | "INTEGER" | "CHOICE";
  value: string;
  editable: boolean;
  required: boolean;
  /** Falso = el sistema no lo pudo establecer; es lo que hay que completar. */
  systemDetermined: boolean;
  options?: { value: string; label: string }[];
}

export interface ManualForm {
  reportSnapshotId: string;
  version: number;
  sections: { id: "I" | "II" | "III" | "IV" | "V"; title: string; fields: ManualFormField[] }[];
}

/**
 * UN EXPEDIENTE RETENIDO, tal como lo necesita quien decide sobre él.
 *
 * Trae DOS diagnósticos que no se mezclan: la RETENCIÓN —por qué la
 * administración paró el expediente— y el PROCESAMIENTO —en qué quedó el
 * pipeline técnico—. Son hechos independientes: levantar la retención no
 * arregla un análisis fallido, y reintentar el análisis no resuelve un
 * duplicado.
 */
export interface HeldCase {
  holdId: string;
  caseId: string;
  externalCaseId: string;
  hold: CaseHold;
  detail: string | null;
  createdAt: string;
  doctor: { doctorProfileId: string; fullName: string } | null;
  report: { reportId: string; version: number; workflowStatus: ReportWorkflowStatus | null } | null;
  processing: {
    caseStatus: string;
    failureClass: string | null;
    attempts: number;
    lastRun: {
      runId: string;
      trigger: string;
      status: string;
      errorCode: string | null;
      errorMessage: string | null;
      createdAt: string;
      finishedAt: string | null;
    } | null;
  };
  sourceDocument: { downloadUrl: string } | null;
  /** Otros expedientes con el MISMO contenido. Pista para investigar, no veredicto. */
  duplicates: { caseId: string; externalCaseId: string }[];
  /** Dónde quedaría si la retención se levantara ahora. Lo dice el clasificador. */
  classificationIfResolved: CaseClassification;
}

/** Retención activa, tal como la presenta el backend. */
export interface CaseHold {
  active: true;
  statement: string;
  /** Sólo llega a ADMIN y CALIDAD, que son quienes la resuelven. */
  reason?: "DUPLICATE_SOURCE_DOCUMENT" | "SOURCE_IDENTITY_CONFLICT";
}

/**
 * En qué pestaña de la bandeja cae cada categoría. Espejo de `inboxTabOf`
 * (`@sir/domain`): las tres pestañas cubren todo lo asignado, sin huecos.
 */
export type PestañaBandeja = "pendientes" | "retenidos" | "historico";

export const PESTAÑA_POR_CATEGORIA: Record<CaseClassification, PestañaBandeja | null> = {
  PENDING_REVIEW: "pendientes",
  NO_REPORT: "pendientes",
  SIGNING: "pendientes",
  SIGNING_FAILED: "pendientes",
  UNCLASSIFIED: "pendientes",
  HOLD: "retenidos",
  SIGNED: "historico",
  UNASSIGNED: null,
};
export type ExportStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED" | "EXPIRED";

/**
 * EL DOCUMENTO ENTREGABLE del informe, tal como lo compone el backend con
 * `buildClientReport` — la MISMA proyección que imprime el .docx firmado.
 *
 * Es lo ÚNICO que se muestra en la ficha del médico. NO se usa `sections`, que
 * es el volcado interno del snapshot y lleva dentro los códigos de razón, los
 * estados de política y los guardarraíles que necesitan la administración y la
 * auditoría. Mientras la pantalla lo pintó, el médico llegó a leer «Criterio de
 * período: Confirmado por el cliente» y «[REC-1] Tratamiento activo».
 *
 * Estos tipos vivían junto al generador de PDF del navegador. Ese generador se
 * retiró —el informe se lee en pantalla y el documento que se descarga es el
 * firmado, que emite el backend—, y los tipos se quedan aquí, con el resto del
 * espejo de la API, que es su sitio.
 */
export interface CampoDocumento {
  label: string;
  value: string;
}
export interface SeccionDocumento {
  id: string;
  title: string;
  fields: CampoDocumento[];
  paragraphs: string[];
}
export interface DocumentoInforme {
  documentKind: "PRE_REPORT" | "FINAL_SIGNED";
  branding: {
    documentTitle: string;
    institutionalHeading: string;
    institutionalSubheading: string;
    footerText: string;
  };
  caseReference: string;
  sections: SeccionDocumento[];
  proposal: { options: { label: string; checked: boolean }[]; note: string | null };
  draftNotice: string | null;
}

export interface Batch {
  id: string;
  name: string;
  normalizedName: string;
  sequence: number | null;
  status: BatchStatus;
  source: "INGESTION" | "MANUAL";
  createdAt: string;
  closedAt: string | null;
}

export interface BatchSummary {
  totalCases: number;
  /**
   * Sin asignación activa: el universo que una distribución puede repartir. NO
   * es `classification.UNASSIGNED` — un expediente ya firmado cuya asignación
   * se cerró cuenta aquí y allí es `SIGNED`, porque no hay nada que repartir.
   */
  unassignedCases: number;
  assignedCases: number;
  processingCases: number;
  errorCases: number;
  casesWithoutReport: number;
  /** Excluyente y exhaustivo: la suma de las ocho claves es `totalCases`. */
  classification: CaseClassificationCounts;
}

export interface BatchListItem {
  batch: Batch;
  summary: BatchSummary;
}

export interface DoctorWorkload {
  doctorProfileId: string;
  fullName: string;
  professionalCode: string | null;
  status: "ACTIVE" | "INACTIVE";
  assignable: boolean;
  /**
   * Expedientes con asignación activa, TODOS, firmados incluidos. Se llamaba
   * «carga actual» y ese nombre decía otra cosa: un médico que terminó su
   * semana entera seguía apareciendo con 93 de carga.
   */
  assignedCases: number;
  /** El desglose. Su suma es `assignedCases`. */
  classification: CaseClassificationCounts;
}

export interface AssignmentContext {
  batch: Batch;
  summary: BatchSummary;
  eligibleCases: number;
  assignedCases: number;
  eligibilityFingerprint: string;
  assignable: boolean;
  doctors: DoctorWorkload[];
}

export interface PreviewAllocation {
  doctorProfileId: string;
  doctorFullName: string;
  doctorProfessionalCode: string | null;
  position: number;
  currentLoad: number;
  requestedQuantity: number;
  projectedLoad: number;
  cases: { caseId: string; externalCaseId: string }[];
  casesTruncated: boolean;
}

export interface AssignmentPreview {
  batchId: string;
  valid: boolean;
  eligibleCases: number;
  requestedCases: number;
  remainingCases: number;
  excessCases: number;
  eligibilityFingerprint: string;
  allocations: PreviewAllocation[];
  problems: { code: string; statement: string; doctorProfileId?: string }[];
}

export interface OperationalCase {
  caseId: string;
  externalCaseId: string;
  /** Ver `CaseClassification`. La resuelve el backend; aquí no se deduce. */
  classification: CaseClassification;
  /** Retención activa, o null. */
  hold: CaseHold | null;
  /**
   * El expediente original, cuando existe. La URL la compone el backend. Es lo
   * que permite ofrecer los antecedentes de un caso retenido SIN informe, que no
   * tiene ninguna otra vía para hacerlo.
   */
  sourceDocument: { downloadUrl: string } | null;
  status: CaseStatus;
  statusChangedAt: string;
  discoveredAt: string;
  failureClass: "TRANSIENT" | "DETERMINISTIC" | null;
  analysisAttempts: number;
  batch: { id: string; name: string; sequence: number | null } | null;
  assignment:
    | {
        doctorProfileId: string;
        fullName: string;
        professionalCode: string | null;
        assignedAt: string;
        assignmentRunId: string | null;
      }
    | null;
  report:
    | {
        reportId: string;
        version: number;
        workflowStatus: ReportWorkflowStatus;
        readinessStatus: "READY" | "NOT_READY";
        orientationAssessment: Orientation | null;
        signedAt: string | null;
      }
    | null;
}

export interface ReportListItem {
  reportId: string;
  caseId: string;
  externalCaseId: string;
  version: number;
  createdAt: string;
  batch: { id: string; name: string; sequence: number | null } | null;
  doctor: { doctorProfileId: string; fullName: string; professionalCode: string | null } | null;
  workflowStatus: ReportWorkflowStatus;
  readinessStatus: "READY" | "NOT_READY";
  orientationAssessment: Orientation | null;
  signedAt: string | null;
}

export interface ExportJob {
  id: string;
  type: "SIGNED_REPORTS_ZIP";
  status: ExportStatus;
  filters: Record<string, string>;
  totalItems: number;
  processedItems: number;
  progressPercent: number;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  downloadAvailable: boolean;
  fileSize: number | null;
  error: { code: string; message: string } | null;
}

// Simplificado a 3 grupos visuales (por revisar / ratificado / devuelto):
// SIGNING y SIGNED son "ya ratificado, documento en curso o listo"; SIGNING_FAILED
// se agrupa con "devuelto" porque, igual que un CHANGES_REQUESTED, requiere una
// acción de vuelta antes de poder darse por cerrado. El estado real granular
// sigue viajando en `workflowStatus`; esto solo cambia el texto que se muestra.
export const WORKFLOW_LABEL: Record<ReportWorkflowStatus, string> = {
  READY_FOR_REVIEW: "Por revisar",
  CHANGES_REQUESTED: "Devuelto",
  APPROVED: "Ratificado",
  SIGNING: "Ratificado",
  SIGNED: "Ratificado",
  SIGNING_FAILED: "Devuelto",
};

export const ORIENTATION_LABEL: Record<Orientation, string> = {
  RECOVERABLE: "Recuperable",
  IRRECOVERABLE: "No recuperable",
  INDETERMINATE: "Indeterminada",
};

// Estado operacional del expediente (enum CaseStatus del backend) en español.
export const CASE_STATUS_LABEL: Record<string, string> = {
  DISCOVERED: "Detectado",
  DOWNLOADING: "Descargando",
  DOWNLOADED: "Descargado",
  DOWNLOAD_FAILED: "Falló la descarga",
  QUEUED_ANALYSIS: "En cola de análisis",
  ANALYZING: "Analizando",
  ANALYZED: "Analizado",
  ANALYSIS_FAILED: "Falló el análisis",
  UNASSIGNED: "Sin asignar",
  ASSIGNED: "Asignado",
  MEDICAL_REVIEW: "En revisión médica",
  RESOLVED: "Resuelto",
  AWAITING_DOCUMENTS: "Esperando antecedentes",
  NOT_EVALUABLE: "No evaluable",
  REPORT_GENERATED: "Informe generado",
  QUALITY_REVIEW: "En control de calidad",
  RETURNED_FOR_CORRECTION: "Devuelto para corrección",
  APPROVED: "Aprobado",
  DELIVERED: "Entregado",
};

// AQUÍ NO VUELVE UN TRADUCTOR DE TOKENS INTERNOS.
//
// Existió una función `es()` que castellanizaba tokens del volcado interno del
// snapshot —`CLIENT_CONFIRMED`, `AI_INFERRED`, estados de política— para poder
// pintarlos en la ficha del médico. Traducir un dato interno no lo convierte en
// un dato del expediente: «Criterio de período: Confirmado por el cliente» le
// dice tan poco a quien firma como `CLIENT_CONFIRMED`, y su presencia era la
// señal de que la pantalla estaba leyendo la fuente equivocada.
//
// Lo que ve el médico sale de `report.document`, que el backend compone ya
// redactado y sin códigos. Si algún día hace falta traducir un token para una
// pantalla ADMINISTRATIVA, que viva en esa pantalla y no aquí.

/**
 * Administración de personas. Vivían dentro de `Usuarios.tsx`; se mueven aquí
 * porque ahora describen la respuesta de una consulta compartida
 * (`useAdminUsers` / `useAdminDoctors`) y no el estado local de una pantalla.
 */
export type RolBackend = "ADMIN" | "DOCTOR" | "QUALITY";
export type EstadoUsuario = "PENDING_SETUP" | "ACTIVE" | "INACTIVE";

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  roles: RolBackend[];
  status: EstadoUsuario;
  doctorProfileId: string | null;
  lastLoginAt: string | null;
}

export interface AdminDoctor {
  id: string;
  userId: string;
  fullName: string;
  profession: string;
  nationalId: string | null;
  professionalCode: string | null;
  status: "ACTIVE" | "INACTIVE";
}
