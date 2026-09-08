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
  unassignedCases: number;
  assignedCases: number;
  processingCases: number;
  errorCases: number;
  casesWithoutReport: number;
  readyForReview: number;
  changesRequested: number;
  approved: number;
  signed: number;
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
  currentLoad: number;
  casesWithoutReport: number;
  pendingReview: number;
  approved: number;
  signed: number;
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
