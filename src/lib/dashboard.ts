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
 *   · `null` es «sin datos», nunca 0: sin dato no es cero minutos, y sin casos
 *     comparables no es 0 % de concordancia;
 *   · incidencia técnica ABIERTA y fallo HISTÓRICO son cosas distintas.
 */

export type Orientacion = "RECOVERABLE" | "IRRECOVERABLE" | "INDETERMINATE";
export type Severidad = "HIGH" | "MEDIUM" | "INFO";
export type EstadoEtapa = "OPERATIVE" | "WITH_INCIDENTS" | "NO_DATA";
export type DominioClinico = "treatment" | "evolution" | "prognosis" | "functional";

export interface MetricaTiempo {
  n: number;
  eligible: number;
  coveragePercent: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  mean: number | null;
}

export interface TiempoGrupo {
  n: number;
  p50: number | null;
  p75: number | null;
  p90: number | null;
}

interface FilaRatio {
  comparable: number;
  matches: number;
  overrides: number;
  concordancePercent: number | null;
  overridePercent: number | null;
  indeterminatePercent: number | null;
}

export interface SemanaEvolucion extends FilaRatio {
  batchId: string;
  batchName: string;
  createdAt: string;
  cases: number;
  finalized: number;
  indeterminate: number;
  withOrientation: number;
  policyVersions: string[];
  cycleN: number;
  cycleP50: number | null;
}

export interface EtapaTecnica {
  stage: "AI_PROCESSING" | "EXTRACTION" | "WORKER" | "DOCUMENTS" | "SIGNATURE";
  status: EstadoEtapa;
  openIncidents: number;
  counts: Record<string, number | null>;
  lastActivityAt: string | null;
}

export interface CasoAtencion {
  caseId: string;
  externalCaseId: string;
  batchName: string | null;
  doctorName: string | null;
  presentedOrientation: string | null;
  doctorDetermination: string | null;
  status: "FINALIZED" | "PENDING" | "HOLD";
  reason: string;
  reasons: string[];
  openIncidents: string[];
  holdReason: string | null;
  severity: Severidad;
}

export interface DashboardOverview {
  generatedAt: string;
  scope: { contractId: string; regionId: string | null };
  summary: {
    total: number; finalized: number; pending: number; onHold: number; progressPercent: number | null; pendingPercent: number | null;
    processed: number; processedPercent: number | null;
    concordancePercent: number | null; concordanceN: number; overrides: number; overridePercent: number | null;
    indeterminate: number; indeterminateRatePercent: number | null; withOrientation: number;
    medicalCycleP50: number | null; medicalCycleP90: number | null; medicalCycleN: number; medicalCycleEligible: number;
    signatureP50: number | null; signatureN: number; holdsActive: number; technicalFailures: number; policyVersions: string[];
  };
  concordance: {
    source: "PRESENTED_TO_DOCTOR"; comparable: number; matches: number; concordancePercent: number | null;
    matrix: { ai: string; doctor: string; n: number }[];
    byOrientation: { ai: "RECOVERABLE" | "IRRECOVERABLE"; comparable: number; matches: number; overrides: number; concordancePercent: number | null; overridePercent: number | null }[];
    pendingByOrientation: { ai: Orientacion; pending: number; onHold: number }[];
    withoutOrientation: number;
  };
  overrides: {
    comparable: number; recoverableToIrrecoverable: number; irrecoverableToRecoverable: number;
    recoverableToIrrecoverablePercent: number | null; irrecoverableToRecoverablePercent: number | null; total: number; totalPercent: number | null;
    byDirection: { direction: "RECOVERABLE_TO_IRRECOVERABLE" | "IRRECOVERABLE_TO_RECOVERABLE"; n: number; presentedComparable: number; percentOfPresented: number | null }[];
  };
  indeterminateResolution: {
    total: number; resolvedToRecoverable: number; resolvedToIrrecoverable: number; pending: number; reasons: { code: string; n: number }[];
    specialReview: number; causes: { category: string; n: number }[]; missingCoreDomains: { domain: DominioClinico; n: number }[];
    byEvidenceProfile: { profile: string; n: number }[]; excludedGenericCodes: string[];
  };
  orientationEvolution: { total: number; unchanged: number; changed: number; transitions: { first: string; presented: string; n: number }[] };
  weeklyEvolution: SemanaEvolucion[];
  evidenceQuality: (FilaRatio & { profile: string; cases: number; finalized: number; indeterminate: number; withOrientation: number; cycleN: number; cycleP50: number | null })[];
  medicalOperations: (FilaRatio & {
    doctorProfileId: string; doctorName: string | null; assigned: number; finalized: number; pending: number; onHold: number;
    progressPercent: number | null; cycleN: number; cycleEligible: number; cycleCoveragePercent: number | null;
    cycleP50: number | null; cycleP75: number | null; cycleP90: number | null; signatureN: number; signatureP50: number | null; signatureP90: number | null;
    operationalN: number; operationalP50: number | null;
  })[];
  cycleTimes: {
    assignmentToRatification: MetricaTiempo; assignmentToReviewStart: MetricaTiempo; reviewStartToRatification: MetricaTiempo;
    ratificationToSignature: MetricaTiempo; reviewStartToSignature: MetricaTiempo; assignmentToSignature: MetricaTiempo; signatureToPdf: MetricaTiempo;
    reviewStartCoverage: { eligibleFinalized: number; withValidStart: number; coveragePercent: number | null; recordedNotValid: number; pendingWithStart: number };
    distribution: { reviewStartToRatification: Record<string, number>; assignmentToRatification: Record<string, number> };
    timelineP50: Record<string, number | null>;
    byIntervention: { unmodified: TiempoGrupo; corrected: TiempoGrupo };
  };
  interventions: {
    finalized: number; unmodified: number; corrected: number; changedPronouncement: number; textOnly: number; pronouncedFromIndeterminate: number;
    unmodifiedPercent: number | null;
    fieldDetailCoverage: {
      corrected: number; withFieldDetail: number; coveragePercent: number | null; records: number; recordsWithFieldDetail: number;
      scopeRecords: number; scopeRecordsWithFieldDetail: number; scopeCoveragePercent: number | null;
    };
    modifiedFields: { field: string; n: number }[];
  };
  resolutionPath: { finalizedDirect: number; finalizedExplicit: number; pendingDirect: number; pendingExplicit: number; finalizedExplicitPercent: number | null };
  preReportUsable: { unmodified: number; finalized: number; percent: number | null };
  policyVersions: (FilaRatio & { version: string; cases: number; finalized: number; indeterminate: number; withOrientation: number; cycleN: number; cycleP50: number | null; operationalP50: number | null })[];
  operationalQuality: { preAssignment: { status: string; n: number }[]; activeHoldsByReason: { reason: string; n: number }[]; casesWithResolvedHolds: number };
  technicalQuality: {
    latestProcessingRun: { status: string; n: number }[]; extractionQuality: { status: string; n: number }[];
    signedDocx: { status: string; n: number }[]; signedPdf: { status: string; n: number }[]; casesWithTechnicalFailure: number;
  };
  batchQuality: {
    sourceValidated: number; sourceChecked: number; sourceNotChecked: number; rutMatched: number; rutCompared: number;
    identityWarnings: number; identityInformational: number; holdsActive: number; specialReview: number;
    contradictoryEvidence: number; humanReviewRequired: number; openTechnicalIncidents: number;
  };
  technicalIncidents: {
    open: { cases: number; processing: number; processingWithoutReport: number; preReport: number; signing: number; pdf: number };
    historical: { failures: number; processingRuns: number; artifacts: number; cases: number; resolvedCases: number; extractionsRejected: number };
  };
  processingHealth: EtapaTecnica[];
  engineStatus: { status: EstadoEtapa; openIncidents: number };
  /** Preparado en el backend; esta pantalla NO lo publica todavía. */
  humanEffort: { status: "INSUFFICIENT_TELEMETRY" | "AVAILABLE"; minimumSample: number; validReviewStarts: number; segments: (TiempoGrupo & { segment: string })[] };
  /** Preparado en el backend; esta pantalla NO lo publica todavía. */
  operationalSavings: { status: "NOT_AVAILABLE"; reason: string; baselineReviewMinutes: number | null; actualReviewMinutes: number | null; estimatedMinutesSaved: number | null; estimatedHoursSaved: number | null };
  attentionCases: { total: number; byReason: { reason: string; severity: Severidad; n: number }[]; cases: CasoAtencion[] };
}

export interface CasoDashboard {
  caseId: string; externalCaseId: string; batchId: string | null; batchName: string | null; doctorName: string | null;
  presentedOrientation: string | null; firstOrientation: string | null; doctorDetermination: string | null;
  status: "FINALIZED" | "PENDING" | "HOLD"; requiresExplicitPronouncement: boolean; evidenceProfile: string | null;
  policyVersion: string | null; reportId: string | null; assignedAt: string | null; reviewStartedAt: string | null; ratifiedAt: string | null;
  signedAt: string | null; operationalSeconds: number | null; medicalCycleSeconds: number | null; signatureSeconds: number | null;
  corrections: number; attentionReason: string | null; attentionReasons: string[]; attentionSeverity: Severidad | null; holdReason: string | null;
  openIncidents: string[]; identitySeverity: "INFORMATIONAL" | "REVIEW_WARNING" | "BLOCKING" | null; specialReview: boolean;
  contradictoryEvidence: boolean; orientationReason: { category: string; label: string } | null;
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

const decimal = (v: number, max: number) => v.toLocaleString("es-CL", { maximumFractionDigits: max });

/**
 * Segundos → texto legible: «0,7 s», «18 min», «84,4 min», «3 h 5 min».
 * Hasta tres horas en minutos con un decimal: es la escala en que se lee el
 * trabajo de un caso. `null` → «—».
 */
export function formatoDuracion(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined || Number.isNaN(segundos)) return "—";
  if (segundos < 60) return `${decimal(segundos, 1)} s`;
  const min = segundos / 60;
  if (min < 180) return `${decimal(min, 1)} min`;
  const h = Math.floor(min / 60);
  const resto = Math.round(min - h * 60);
  if (h < 48) return resto === 0 ? `${h} h` : `${h} h ${resto} min`;
  return `${decimal(h / 24, 1)} días`;
}

/** Como `formatoDuracion`, con dos decimales bajo diez segundos: para el detalle. */
export function formatoDuracionPrecisa(segundos: number | null | undefined): string {
  if (segundos !== null && segundos !== undefined && !Number.isNaN(segundos) && segundos < 10) return `${decimal(segundos, 2)} s`;
  return formatoDuracion(segundos);
}

/** Porcentaje con un decimal y coma decimal. `null` → «—». */
export function formatoPorcentaje(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${decimal(v, 1)}%`;
}

/** «n = 27/49» cuando hay elegibles distintos de n; «n = 49» si no. */
export function formatoN(n: number, elegibles?: number): string {
  return elegibles !== undefined && elegibles !== n ? `n = ${n}/${elegibles}` : `n = ${n}`;
}

export function formatoEntero(n: number): string {
  return n.toLocaleString("es-CL");
}

/** «hace menos de 1 min», «hace 3 min», «hace 2 h». */
export function haceCuanto(iso: string, ahora: number = Date.now()): string {
  const min = Math.floor((ahora - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "hace menos de 1 min";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h`;
}

/** «SEMANA_09_2026» → «Semana 9». Un nombre que no sigue esa forma se muestra tal cual. */
export function nombreSemana(nombre: string | null | undefined): string {
  if (!nombre) return "—";
  const m = /^semana[\s_-]*0*(\d+)(?:[\s_-]+\d{4})?$/i.exec(nombre.trim());
  return m ? `Semana ${m[1]}` : nombre;
}

/** «SEMANA_09_2026» → «Semana 9 · 2026», para listas donde puede haber varios años. */
export function nombreSemanaLargo(nombre: string): string {
  const m = /^semana[\s_-]*0*(\d+)[\s_-]+(\d{4})$/i.exec(nombre.trim());
  return m ? `Semana ${m[1]} · ${m[2]}` : nombreSemana(nombre);
}

// ---- Vocabulario ---------------------------------------------------------

export const ETIQUETA_ORIENTACION: Record<string, string> = {
  RECOVERABLE: "Recuperable",
  IRRECOVERABLE: "No recuperable",
  INDETERMINATE: "Indeterminada",
};

/** Pronunciamiento del médico: la casilla del informe. */
export const ETIQUETA_PRONUNCIAMIENTO: Record<string, string> = {
  RECOVERABLE: "Recuperable",
  IRRECOVERABLE: "Irrecuperable",
};

export const ETIQUETA_PERFIL: Record<string, string> = {
  CURRENT_SPECIALIST_REPORT: "Especialista actual",
  LONGITUDINAL_CLINICAL_HISTORY: "Longitudinal",
  ADMINISTRATIVE_DIAGNOSIS_ONLY: "Administrativa",
  UNKNOWN: "Sin perfil",
};

export const DESCRIPCION_PERFIL: Record<string, string> = {
  CURRENT_SPECIALIST_REPORT: "Informe de especialista vigente",
  LONGITUDINAL_CLINICAL_HISTORY: "Historia clínica longitudinal",
  ADMINISTRATIVE_DIAGNOSIS_ONLY: "Sólo diagnóstico administrativo",
  UNKNOWN: "Sin perfil de evidencia evaluado",
};

/** Motivo de atención → categoría visible. */
export const ETIQUETA_ATENCION: Record<string, string> = {
  REQUIRES_PRONOUNCEMENT: "Pronunciamiento requerido",
  PDF_FAILED: "Incidencia PDF",
  PROCESSING_FAILED: "Incidencia de procesamiento",
  PROCESSING_RETRY_FAILED: "Incidencia de procesamiento",
  CONTRADICTORY_EVIDENCE: "Evidencia contradictoria",
  IDENTITY_WARNING: "Advertencia de identidad",
  HOLD_ACTIVE: "Retención",
  SIGNING_FAILED: "Incidencia de firma",
  SIGNING_PENDING: "Firma en curso",
  PRE_REPORT_FAILED: "Incidencia de preinforme",
  PREASSIGNMENT_NOT_PASSED: "Validación de planilla no superada",
};

/** Detalle breve del motivo, para quien no conoce el código. */
export const DETALLE_ATENCION: Record<string, string> = {
  REQUIRES_PRONOUNCEMENT: "La orientación no es firmable tal cual: el médico define el pronunciamiento",
  PDF_FAILED: "El PDF del informe firmado no se generó; el Word firmado está disponible",
  PROCESSING_FAILED: "El procesamiento falló y el caso no tiene informe",
  PROCESSING_RETRY_FAILED: "El último reproceso falló; el caso conserva su informe vigente",
  CONTRADICTORY_EVIDENCE: "Marcado por auditoría clínica: antecedentes contradictorios",
  IDENTITY_WARNING: "El nombre o la identidad difieren de la planilla de la semana",
  HOLD_ACTIVE: "Retenido: no accionable por el médico",
  SIGNING_FAILED: "La firma no produjo el documento",
  SIGNING_PENDING: "Ratificado; el documento firmado aún no está listo",
  PRE_REPORT_FAILED: "El preinforme vigente no se generó",
  PREASSIGNMENT_NOT_PASSED: "La validación contra la planilla no dio conforme",
};

/** Las categorías que el bloque de atención siempre muestra, con su segmento de drilldown. */
export const CATEGORIAS_ATENCION: { etiqueta: string; motivos: string[]; segmento: string }[] = [
  { etiqueta: "Pronunciamiento requerido", motivos: ["REQUIRES_PRONOUNCEMENT"], segmento: "attention:REQUIRES_PRONOUNCEMENT" },
  { etiqueta: "Incidencia PDF", motivos: ["PDF_FAILED"], segmento: "attention:PDF_FAILED" },
  { etiqueta: "Incidencia de procesamiento", motivos: ["PROCESSING_FAILED", "PROCESSING_RETRY_FAILED"], segmento: "incident:PROCESSING" },
  { etiqueta: "Evidencia contradictoria", motivos: ["CONTRADICTORY_EVIDENCE"], segmento: "attention:CONTRADICTORY_EVIDENCE" },
  { etiqueta: "Advertencia de identidad", motivos: ["IDENTITY_WARNING"], segmento: "attention:IDENTITY_WARNING" },
  { etiqueta: "Retención", motivos: ["HOLD_ACTIVE"], segmento: "attention:HOLD_ACTIVE" },
];

export const ETIQUETA_SEVERIDAD: Record<Severidad, string> = { HIGH: "Alta", MEDIUM: "Media", INFO: "Informativa" };

export const ETIQUETA_ESTADO: Record<string, string> = {
  FINALIZED: "Finalizado",
  PENDING: "Pendiente",
  HOLD: "Retenido",
};

export const ETIQUETA_CAUSA: Record<string, string> = {
  SUSTAINED_CONDITION_WITHOUT_CLINICAL_DETAIL: "Cuadro sostenido sin tratamiento, evolución ni pronóstico",
  NO_STRUCTURED_CLINICAL_FACTS: "Sólo diagnósticos y licencias, sin hechos clínicos",
  MISSING_CLINICAL_DOMAINS: "Faltan dominios clínicos centrales",
  NO_CLINICAL_EVIDENCE: "No constan antecedentes clínicos",
  CONTRADICTORY_EVIDENCE: "Evidencia clínica contradictoria",
  HUMAN_REVIEW_REQUIRED: "Marcado para revisión médica",
  RECOVERABLE_SUPPORTED: "Recuperable con fundamento",
  IRRECOVERABLE_SUPPORTED: "No recuperable con fundamento",
  UNKNOWN: "Motivo no identificado",
};

export const ETIQUETA_DOMINIO: Record<DominioClinico, string> = {
  treatment: "Tratamiento",
  evolution: "Evolución",
  prognosis: "Pronóstico",
  functional: "Evaluación funcional",
};

export const ETIQUETA_ETAPA: Record<EtapaTecnica["stage"], string> = {
  AI_PROCESSING: "Procesamiento IA",
  EXTRACTION: "Extracción",
  WORKER: "Cola de trabajos",
  DOCUMENTS: "Word/PDF",
  SIGNATURE: "Firma",
};

export const ETIQUETA_ESTADO_ETAPA: Record<EstadoEtapa, string> = {
  OPERATIVE: "Operativo",
  WITH_INCIDENTS: "Con incidencias",
  NO_DATA: "Sin datos",
};

export const ETIQUETA_RETENCION: Record<string, string> = {
  DUPLICATE_SOURCE_DOCUMENT: "Documento fuente duplicado",
  SOURCE_IDENTITY_CONFLICT: "Antecedentes de más de una persona",
  OUT_OF_MENTAL_HEALTH_SCOPE: "Fuera de salud mental",
  EXPECTED_IDENTITY_MISMATCH: "RUT distinto al de la planilla",
  NOT_IN_BATCH_SOURCE: "No figura en la planilla",
  PREASSIGNMENT_DATA_MISSING: "Identidad ilegible",
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
    "Casos finalizados cuya orientación presentada al médico fue Recuperable o No recuperable y coincide con el pronunciamiento profesional final.",
  override: "Casos finalizados con orientación presentada Recuperable o No recuperable cuyo pronunciamiento médico final fue el opuesto.",
  indeterminacion: "Orientación presentada Indeterminada sobre los casos con orientación. No es un error: requiere juicio médico.",
  cicloMedico:
    "Desde el primer «Revisar» del médico hasta la ratificación. Disponible para revisiones iniciadas desde la incorporación de la telemetría. No es tiempo activo frente a la pantalla.",
  percentilesMedicos: "Los percentiles se calcularán cuando existan revisiones con inicio registrado.",
  operacional: "Incluye el tiempo en cola desde la asignación.",
  firma: "Desde la ratificación hasta el documento firmado emitido.",
  operacionalTotal: "Desde la asignación hasta el documento firmado. Incluye la cola de trabajo.",
  cobertura: "Sin dato no es cero minutos: sólo cuentan las revisiones con inicio registrado, sin trabajo previo del médico.",
  evolucionOrientacion:
    "Primera orientación del caso frente a la orientación presentada al médico. Ocurre antes de la revisión médica y no es un override.",
  evolucionDesempeno: "Semanas con al menos un caso finalizado comparable. Elegir una semana no la quita de la tendencia.",
  preinforme: "Informes finalizados que no requirieron una corrección médica previa a la aprobación.",
  cierre:
    "Ratificación directa: el preinforme del motor se podía firmar tal cual. Pronunciamiento explícito: la orientación no era firmable (indeterminada o con un bloqueador) y el médico define el pronunciamiento.",
  revisionEspecial:
    "Marcado por una auditoría clínica para revisión médica antes de cualquier orientación automática. No lo produce una regla del motor.",
  advertenciasIdentidad:
    "Diferencias que piden revisión antes de firmar: nombre escrito distinto, RUT ilegible o distinto, o trámite distinto. Las diferencias informativas de nombre no se cuentan.",
  incidenciasAbiertas:
    "Fallos cuyo estado vigente sigue siendo el fallo: último procesamiento fallido, preinforme o firma sin generar, o PDF del informe firmado sin generar.",
  fallosHistoricos: "Cada ejecución o documento fallido registrado, se haya resuelto después o no.",
  causas:
    "Categoría del fundamento determinístico de la orientación (el mismo de «Ver fundamento» en Informes). Los códigos presentes en toda indeterminada no se muestran porque no distinguen un caso de otro.",
  campos: "Sólo las correcciones que registran sus campos en forma estructurada. No se extrapola al resto.",
} as const;
