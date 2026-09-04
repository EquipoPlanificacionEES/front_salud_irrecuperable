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

// Otros tokens del backend que asoman en el texto de las secciones / anexo.
const TOKEN_ES: Record<string, string> = {
  ...CASE_STATUS_LABEL,
  CLIENT_CONFIRMED: "Confirmado por el cliente",
  PENDING_CLIENT_CONFIRMATION: "Pendiente de confirmación del cliente",
  NOT_CONFIRMED: "Sin confirmar",
  CONSIDERED: "Considerado",
  ILLEGIBLE: "Ilegible",
  MISSING: "Faltante",
  NOT_RELEVANT: "No relevante",
  RECOVERABLE: "Recuperable",
  IRRECOVERABLE: "No recuperable",
  INDETERMINATE: "Indeterminada",
  EJECUTORIADO: "Ejecutoriado",
  READY: "Listo",
  NOT_READY: "No listo",
  CRONICA: "Crónica",
  AGUDA: "Aguda",
  NO_CONSTA: "No consta",
  NO_DETERMINADA: "No determinada",
  NO_EVALUABLE: "No evaluable",
};

/** Traduce un token en MAYÚSCULAS del backend; deja intacto cualquier otro texto. */
export function es(valor: string): string {
  if (/^[A-Z][A-Z0-9_]+$/.test(valor.trim())) {
    return TOKEN_ES[valor.trim()] ?? valor;
  }
  return valor;
}
