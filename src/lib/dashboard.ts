/**
 * DASHBOARD ADMIN — contrato, formato y vocabulario de presentación.
 *
 * Espejo de `GET /admin/dashboard/overview` y `/admin/dashboard/cases`. Los
 * cálculos los hace el backend; aquí sólo se formatea y se nombra.
 *
 * Reglas de lectura que la UI debe respetar:
 *   · un porcentaje nunca va solo: siempre con su `n`;
 *   · «Concordancia IA–Médico», nunca «precisión»: el médico es el comparador
 *     operacional, no una verdad absoluta;
 *   · los tiempos basados en el inicio de revisión muestran su cobertura;
 *   · `null` es «sin datos», nunca 0.
 */

export type Orientacion = "RECOVERABLE" | "IRRECOVERABLE" | "INDETERMINATE";
export type Severidad = "HIGH" | "MEDIUM" | "INFO";

export interface MetricaTiempo {
  n: number;
  eligible: number;
  coveragePercent: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  mean: number | null;
}

interface FilaRatio {
  comparable: number;
  matches: number;
  overrides: number;
  concordancePercent: number | null;
  overridePercent: number | null;
  indeterminatePercent: number | null;
}

export interface DashboardOverview {
  generatedAt: string;
  scope: { contractId: string; regionId: string | null };
  summary: {
    total: number; finalized: number; pending: number; onHold: number; progressPercent: number | null;
    concordancePercent: number | null; concordanceN: number; overrides: number; overridePercent: number | null;
    indeterminate: number; indeterminateRatePercent: number | null; withOrientation: number;
    medicalCycleP50: number | null; medicalCycleP90: number | null; medicalCycleN: number; medicalCycleEligible: number;
    signatureP50: number | null; signatureN: number; holdsActive: number; technicalFailures: number;
  };
  concordance: { source: "PRESENTED_TO_DOCTOR"; comparable: number; matches: number; concordancePercent: number | null; matrix: { ai: string; doctor: string; n: number }[] };
  overrides: {
    comparable: number; recoverableToIrrecoverable: number; irrecoverableToRecoverable: number;
    recoverableToIrrecoverablePercent: number | null; irrecoverableToRecoverablePercent: number | null; total: number; totalPercent: number | null;
  };
  indeterminateResolution: { total: number; resolvedToRecoverable: number; resolvedToIrrecoverable: number; pending: number; reasons: { code: string; n: number }[] };
  orientationEvolution: { total: number; unchanged: number; changed: number; transitions: { first: string; presented: string; n: number }[] };
  evidenceQuality: (FilaRatio & { profile: string; cases: number; finalized: number; indeterminate: number; withOrientation: number; cycleN: number; cycleP50: number | null })[];
  medicalOperations: (FilaRatio & {
    doctorProfileId: string; doctorName: string | null; assigned: number; finalized: number; pending: number; onHold: number;
    progressPercent: number | null; cycleN: number; cycleEligible: number; cycleCoveragePercent: number | null;
    cycleP50: number | null; cycleP75: number | null; cycleP90: number | null; signatureN: number; signatureP50: number | null;
    operationalN: number; operationalP50: number | null;
  })[];
  cycleTimes: {
    assignmentToRatification: MetricaTiempo; assignmentToReviewStart: MetricaTiempo; reviewStartToRatification: MetricaTiempo;
    ratificationToSignature: MetricaTiempo; reviewStartToSignature: MetricaTiempo; assignmentToSignature: MetricaTiempo; signatureToPdf: MetricaTiempo;
    reviewStartCoverage: { eligibleFinalized: number; withValidStart: number; coveragePercent: number | null; recordedNotValid: number; pendingWithStart: number };
    distribution: { reviewStartToRatification: Record<string, number>; assignmentToRatification: Record<string, number> };
    timelineP50: Record<string, number | null>;
  };
  interventions: {
    finalized: number; unmodified: number; corrected: number; changedPronouncement: number; textOnly: number; pronouncedFromIndeterminate: number;
    unmodifiedPercent: number | null; fieldDetailCoverage: { corrected: number; withFieldDetail: number; coveragePercent: number | null };
    modifiedFields: { field: string; n: number }[];
  };
  resolutionPath: { finalizedDirect: number; finalizedExplicit: number; pendingDirect: number; pendingExplicit: number; finalizedExplicitPercent: number | null };
  preReportUsable: { unmodified: number; finalized: number; percent: number | null };
  policyVersions: (FilaRatio & { version: string; cases: number; finalized: number; indeterminate: number; withOrientation: number })[];
  operationalQuality: { preAssignment: { status: string; n: number }[]; activeHoldsByReason: { reason: string; n: number }[]; casesWithResolvedHolds: number };
  technicalQuality: {
    latestProcessingRun: { status: string; n: number }[]; extractionQuality: { status: string; n: number }[];
    signedDocx: { status: string; n: number }[]; signedPdf: { status: string; n: number }[]; casesWithTechnicalFailure: number;
  };
  attentionCases: {
    total: number;
    byReason: { reason: string; severity: Severidad; n: number }[];
    cases: {
      caseId: string; externalCaseId: string; batchName: string | null; doctorName: string | null;
      presentedOrientation: string | null; doctorDetermination: string | null; status: "FINALIZED" | "PENDING" | "HOLD";
      reason: string; holdReason: string | null; severity: Severidad;
    }[];
  };
}

export interface CasoDashboard {
  caseId: string; externalCaseId: string; batchName: string | null; doctorName: string | null;
  presentedOrientation: string | null; firstOrientation: string | null; doctorDetermination: string | null;
  status: "FINALIZED" | "PENDING" | "HOLD"; requiresExplicitPronouncement: boolean; evidenceProfile: string | null;
  policyVersion: string | null; assignedAt: string | null; reviewStartedAt: string | null; ratifiedAt: string | null;
  signedAt: string | null; corrections: number; attentionReason: string | null; attentionSeverity: Severidad | null; holdReason: string | null;
}

export interface CasosDashboard {
  segment: string; total: number; limit: number; offset: number; cases: CasoDashboard[];
}

export interface FiltrosDashboard {
  regionId?: string;
  batchId?: string;
  doctorProfileId?: string;
  status?: "FINALIZED" | "PENDING" | "HOLD";
  presentedOrientation?: Orientacion;
  doctorDetermination?: "RECOVERABLE" | "IRRECOVERABLE";
  evidenceProfile?: string;
  policyVersion?: string;
  from?: string;
  to?: string;
}

/** Querystring con sólo lo que tiene valor. Orden estable para la caché. */
export function queryDeFiltros(f: FiltrosDashboard, extra: Record<string, string | number> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra }).sort(([a], [b]) => a.localeCompare(b))) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  return q.toString();
}

// ---- Formato -------------------------------------------------------------

/** Segundos → texto legible: «0,7 s», «18 min», «1 h 25 min». `null` → «—». */
export function formatoDuracion(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined || Number.isNaN(segundos)) return "—";
  if (segundos < 60) return `${segundos.toLocaleString("es-CL", { maximumFractionDigits: 1 })} s`;
  const min = segundos / 60;
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const resto = Math.round(min - h * 60);
  if (h < 48) return resto === 0 ? `${h} h` : `${h} h ${resto} min`;
  return `${(h / 24).toLocaleString("es-CL", { maximumFractionDigits: 1 })} días`;
}

/** Porcentaje con un decimal y coma decimal. `null` → «—». */
export function formatoPorcentaje(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`;
}

/** «n = 27/49» cuando hay elegibles distintos de n; «n = 49» si no. */
export function formatoN(n: number, elegibles?: number): string {
  return elegibles !== undefined && elegibles !== n ? `n = ${n}/${elegibles}` : `n = ${n}`;
}

// ---- Vocabulario ---------------------------------------------------------

export const ETIQUETA_ORIENTACION: Record<string, string> = {
  RECOVERABLE: "Recuperable",
  IRRECOVERABLE: "No recuperable",
  INDETERMINATE: "Indeterminada",
};

export const ETIQUETA_PERFIL: Record<string, string> = {
  CURRENT_SPECIALIST_REPORT: "Informe de especialista vigente",
  LONGITUDINAL_CLINICAL_HISTORY: "Historia clínica longitudinal",
  ADMINISTRATIVE_DIAGNOSIS_ONLY: "Sólo diagnóstico administrativo",
  UNKNOWN: "Sin perfil evaluado",
};

export const ETIQUETA_ATENCION: Record<string, string> = {
  SIGNING_FAILED: "Falló la firma del informe",
  PROCESSING_FAILED: "Falló el procesamiento",
  HOLD_ACTIVE: "Retención activa",
  PDF_FAILED: "Falló el PDF del informe firmado",
  PREASSIGNMENT_NOT_PASSED: "Validación contra planilla no superada",
  SIGNING_PENDING: "Ratificado, firma pendiente",
  REQUIRES_PRONOUNCEMENT: "Requiere pronunciamiento explícito",
};

export const ETIQUETA_ESTADO: Record<string, string> = {
  FINALIZED: "Finalizado",
  PENDING: "Pendiente",
  HOLD: "Retenido",
};

export const ETIQUETA_TRAMO: Record<string, string> = {
  lt10: "< 10 min",
  m10_20: "10–20 min",
  m20_30: "20–30 min",
  m30_60: "30–60 min",
  h1_2: "1–2 h",
  gt2h: "> 2 h",
};
export const ORDEN_TRAMOS = ["lt10", "m10_20", "m20_30", "m30_60", "h1_2", "gt2h"] as const;

export const ETIQUETA_CAMPO: Record<string, string> = {
  assessment: "Evaluación (Sección V)",
  conclusion: "Conclusión (Sección IV)",
  clinicalAnalysis: "Análisis clínico (Sección III)",
  note: "Nota",
  correctionReason: "Motivo de corrección",
};

export function etiquetaCampo(campo: string): string {
  if (ETIQUETA_CAMPO[campo]) return ETIQUETA_CAMPO[campo];
  const [grupo, clave] = campo.split(".");
  const g = grupo === "figures" || grupo === "figureTexts" ? "Sección II" : grupo === "identity" ? "Identificación" : grupo;
  return clave ? `${g} · ${clave}` : campo;
}

/** Textos de ayuda: la definición de cada métrica, tal cual la calcula el backend. */
export const AYUDA = {
  concordancia:
    "Calculado únicamente sobre casos finalizados cuya orientación presentada al médico fue Recuperable o No recuperable. Indeterminada no entra en el denominador.",
  override: "Casos finalizados con orientación presentada binaria donde el pronunciamiento médico final fue el opuesto.",
  cicloMedico:
    "Tiempo transcurrido desde el primer «Revisar» del médico hasta la ratificación. Disponible únicamente para casos cuyo primer inicio de revisión fue registrado desde la incorporación de esta telemetría. No es tiempo activo frente a la pantalla.",
  operacional: "Desde la asignación hasta la ratificación. Incluye la cola de trabajo del médico: no es tiempo médico por caso.",
  firma: "Desde la ratificación hasta el documento firmado emitido.",
  indeterminacion: "Casos con orientación presentada Indeterminada sobre los casos con orientación.",
  evolucion:
    "Primera orientación del caso frente a la orientación presentada al médico. Refleja reprocesos internos del motor; no es un override médico.",
  preinforme: "Finalizados sin ninguna corrección médica previa a la aprobación.",
  resolucion:
    "«Ratificación directa»: el informe se podía firmar tal cual. «Requirió pronunciamiento explícito»: el informe original no traía una evaluación firmable o tenía un bloqueador que exige confirmación médica.",
} as const;
