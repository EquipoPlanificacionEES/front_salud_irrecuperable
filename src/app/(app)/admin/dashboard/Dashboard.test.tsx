import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { pintarConQuery } from "@/test/utils";
import type { BatchListItem } from "@/lib/backend";
import { Dashboard, semanaMasReciente, type AmbitoDashboard } from "./Dashboard";
import {
  formatoDuracion,
  formatoDuracionPrecisa,
  formatoN,
  formatoPorcentaje,
  haceCuanto,
  nombreSemana,
  type CasoAtencion,
  type CasoDashboard,
  type DashboardOverview,
  type MetricaTiempo,
  type SemanaEvolucion,
} from "@/lib/dashboard";
import { puedeAcceder } from "@/lib/roles";

/**
 * DASHBOARD EJECUTIVO — lo que se muestra es lo que calculó el backend, con su base.
 *
 * El fixture tiene la FORMA y las CIFRAS de Semana 9 verificadas en solo lectura
 * (93 casos, 49 finalizados, concordancia 100 % sobre 49 comparables, 29
 * indeterminadas pendientes, sin inicio de revisión registrado, 3 incidencias
 * técnicas abiertas y 4 fallos registrados), con identificadores y nombres
 * SINTÉTICOS: sin datos personales.
 */

const W8 = "00000000-0000-4000-8000-0000000b0008";
const W9 = "00000000-0000-4000-8000-0000000b0009";
const PRUEBA = "00000000-0000-4000-8000-0000000b0033";
const MEDICO = "00000000-0000-4000-8000-0000000d0c01";

const metrica = (n: number, eligible: number, p50: number | null, p75: number | null = p50, p90: number | null = p50): MetricaTiempo => ({
  n, eligible, coveragePercent: eligible ? Math.round((n / eligible) * 1000) / 10 : null, p50, p75, p90, mean: p50,
});
const sinDato = { n: 0, p50: null, p75: null, p90: null };

const semana = (batchId: string, batchName: string, createdAt: string, v: Omit<SemanaEvolucion, "batchId" | "batchName" | "createdAt" | "cycleN" | "cycleP50">): SemanaEvolucion => ({
  batchId, batchName, createdAt, cycleN: 0, cycleP50: null, ...v,
});

const caso = (i: number, orientation: string, status: CasoAtencion["status"], reasons: string[], openIncidents: string[], severity: CasoAtencion["severity"]): CasoAtencion => ({
  caseId: `00000000-0000-4000-8000-00000000ca${String(i).padStart(2, "0")}`,
  externalCaseId: `900000${String(i).padStart(2, "0")}`,
  batchName: "SEMANA_09_2026",
  doctorName: "Profesional sintético",
  presentedOrientation: orientation,
  doctorDetermination: status === "FINALIZED" ? orientation : null,
  status,
  reason: reasons[0] as string,
  reasons,
  openIncidents,
  holdReason: null,
  severity,
});

const OVERVIEW: DashboardOverview = {
  generatedAt: new Date(Date.now() - 3 * 60_000 - 5_000).toISOString(),
  scope: { contractId: "00000000-0000-4000-8000-00000000c036", regionId: null },
  summary: {
    total: 93, finalized: 49, pending: 44, onHold: 0, progressPercent: 52.7, pendingPercent: 47.3, processed: 93, processedPercent: 100,
    concordancePercent: 100, concordanceN: 49, overrides: 0, overridePercent: 0, indeterminate: 29, indeterminateRatePercent: 31.2, withOrientation: 93,
    medicalCycleP50: null, medicalCycleP90: null, medicalCycleN: 0, medicalCycleEligible: 49, signatureP50: 0.679, signatureN: 49,
    holdsActive: 0, technicalFailures: 3, policyVersions: ["1.2.0"],
  },
  concordance: {
    source: "PRESENTED_TO_DOCTOR", comparable: 49, matches: 49, concordancePercent: 100,
    matrix: [
      { ai: "RECOVERABLE", doctor: "RECOVERABLE", n: 43 },
      { ai: "IRRECOVERABLE", doctor: "IRRECOVERABLE", n: 6 },
    ],
    byOrientation: [
      { ai: "RECOVERABLE", comparable: 43, matches: 43, overrides: 0, concordancePercent: 100, overridePercent: 0 },
      { ai: "IRRECOVERABLE", comparable: 6, matches: 6, overrides: 0, concordancePercent: 100, overridePercent: 0 },
    ],
    pendingByOrientation: [
      { ai: "RECOVERABLE", pending: 15, onHold: 0 },
      { ai: "INDETERMINATE", pending: 29, onHold: 0 },
    ],
    withoutOrientation: 0,
  },
  overrides: {
    comparable: 49, recoverableToIrrecoverable: 0, irrecoverableToRecoverable: 0, recoverableToIrrecoverablePercent: 0,
    irrecoverableToRecoverablePercent: 0, total: 0, totalPercent: 0,
    byDirection: [
      { direction: "RECOVERABLE_TO_IRRECOVERABLE", n: 0, presentedComparable: 43, percentOfPresented: 0 },
      { direction: "IRRECOVERABLE_TO_RECOVERABLE", n: 0, presentedComparable: 6, percentOfPresented: 0 },
    ],
  },
  indeterminateResolution: {
    total: 29, resolvedToRecoverable: 0, resolvedToIrrecoverable: 0, pending: 29,
    reasons: [{ code: "ORIENTATION_INDETERMINATE", n: 29 }, { code: "DATA_INCOMPLETE", n: 19 }],
    specialReview: 1,
    causes: [
      { category: "SUSTAINED_CONDITION_WITHOUT_CLINICAL_DETAIL", n: 20 },
      { category: "NO_STRUCTURED_CLINICAL_FACTS", n: 5 },
      { category: "MISSING_CLINICAL_DOMAINS", n: 3 },
      { category: "CONTRADICTORY_EVIDENCE", n: 1 },
    ],
    missingCoreDomains: [
      { domain: "treatment", n: 26 }, { domain: "evolution", n: 28 }, { domain: "prognosis", n: 29 }, { domain: "functional", n: 28 },
    ],
    byEvidenceProfile: [
      { profile: "LONGITUDINAL_CLINICAL_HISTORY", n: 24 },
      { profile: "ADMINISTRATIVE_DIAGNOSIS_ONLY", n: 5 },
    ],
    excludedGenericCodes: ["ORIENTATION_INDETERMINATE", "CLINICAL_EVIDENCE_INSUFFICIENT"],
  },
  orientationEvolution: {
    total: 93, unchanged: 80, changed: 13,
    transitions: [
      { first: "RECOVERABLE", presented: "RECOVERABLE", n: 45 },
      { first: "IRRECOVERABLE", presented: "IRRECOVERABLE", n: 6 },
      { first: "INDETERMINATE", presented: "RECOVERABLE", n: 13 },
      { first: "INDETERMINATE", presented: "INDETERMINATE", n: 29 },
    ],
  },
  weeklyEvolution: [
    semana(W8, "SEMANA_08_2026", "2026-09-04T19:36:32.594Z", {
      cases: 93, finalized: 92, comparable: 87, matches: 83, overrides: 4, indeterminate: 5, withOrientation: 93,
      policyVersions: ["1.0.0", "1.2.0"], concordancePercent: 95.4, overridePercent: 4.6, indeterminatePercent: 5.4,
    }),
    semana(PRUEBA, "LOTE-DE-PRUEBA-SINTETICO", "2026-09-10T00:53:42.870Z", {
      cases: 1, finalized: 0, comparable: 0, matches: 0, overrides: 0, indeterminate: 0, withOrientation: 1,
      policyVersions: ["1.2.0"], concordancePercent: null, overridePercent: null, indeterminatePercent: 0,
    }),
    semana(W9, "SEMANA_09_2026", "2026-09-12T03:14:47.358Z", {
      cases: 93, finalized: 49, comparable: 49, matches: 49, overrides: 0, indeterminate: 29, withOrientation: 93,
      policyVersions: ["1.2.0"], concordancePercent: 100, overridePercent: 0, indeterminatePercent: 31.2,
    }),
  ],
  evidenceQuality: [
    { profile: "ADMINISTRATIVE_DIAGNOSIS_ONLY", cases: 7, finalized: 1, comparable: 1, matches: 1, overrides: 0, indeterminate: 5, withOrientation: 7, cycleN: 0, cycleP50: null, concordancePercent: 100, overridePercent: 0, indeterminatePercent: 71.4 },
    { profile: "CURRENT_SPECIALIST_REPORT", cases: 53, finalized: 41, comparable: 41, matches: 41, overrides: 0, indeterminate: 0, withOrientation: 53, cycleN: 0, cycleP50: null, concordancePercent: 100, overridePercent: 0, indeterminatePercent: 0 },
    { profile: "LONGITUDINAL_CLINICAL_HISTORY", cases: 33, finalized: 7, comparable: 7, matches: 7, overrides: 0, indeterminate: 24, withOrientation: 33, cycleN: 0, cycleP50: null, concordancePercent: 100, overridePercent: 0, indeterminatePercent: 72.7 },
  ],
  medicalOperations: [
    {
      doctorProfileId: MEDICO, doctorName: "Profesional sintético", assigned: 93, finalized: 49, pending: 44, onHold: 0, progressPercent: 52.7,
      cycleN: 0, cycleEligible: 49, cycleCoveragePercent: 0, cycleP50: null, cycleP75: null, cycleP90: null,
      signatureN: 49, signatureP50: 0.679, signatureP90: 0.9662, operationalN: 49, operationalP50: 5063.496,
      comparable: 49, matches: 49, overrides: 0, concordancePercent: 100, overridePercent: 0, indeterminatePercent: null,
    },
  ],
  cycleTimes: {
    assignmentToRatification: metrica(49, 49, 5063.496, 6122.472, 6710.4504),
    assignmentToReviewStart: metrica(0, 93, null),
    reviewStartToRatification: metrica(0, 49, null),
    ratificationToSignature: metrica(49, 49, 0.679, 0.825, 0.9662),
    reviewStartToSignature: metrica(0, 49, null),
    assignmentToSignature: metrica(49, 49, 5063.934, 6123.205, 6711.4292),
    signatureToPdf: metrica(47, 49, 0.9),
    reviewStartCoverage: { eligibleFinalized: 49, withValidStart: 0, coveragePercent: 0, recordedNotValid: 0, pendingWithStart: 0 },
    distribution: {
      reviewStartToRatification: { lt10: 0, m10_20: 0, m20_30: 0, m30_60: 0, h1_2: 0, gt2h: 0 },
      assignmentToRatification: { lt10: 0, m10_20: 0, m20_30: 0, m30_60: 0, h1_2: 0, gt2h: 0 },
    },
    timelineP50: { assignedToReviewStartP50: null, reviewStartToRatifiedP50: null, ratifiedToSignedP50: 0.679, assignedToRatifiedP50: 5063.496, assignedToSignedP50: 5063.934 },
    byIntervention: { unmodified: sinDato, corrected: sinDato },
  },
  interventions: {
    finalized: 49, unmodified: 49, corrected: 0, changedPronouncement: 0, textOnly: 0, pronouncedFromIndeterminate: 0, unmodifiedPercent: 100,
    fieldDetailCoverage: {
      corrected: 0, withFieldDetail: 0, coveragePercent: null, records: 0, recordsWithFieldDetail: 0,
      scopeRecords: 54, scopeRecordsWithFieldDetail: 1, scopeCoveragePercent: 1.9,
    },
    modifiedFields: [],
  },
  resolutionPath: { finalizedDirect: 49, finalizedExplicit: 0, pendingDirect: 12, pendingExplicit: 32, finalizedExplicitPercent: 0 },
  preReportUsable: { unmodified: 49, finalized: 49, percent: 100 },
  policyVersions: [
    { version: "1.2.0", cases: 93, finalized: 49, comparable: 49, matches: 49, overrides: 0, indeterminate: 29, withOrientation: 93, cycleN: 0, cycleP50: null, operationalP50: 5063.496, concordancePercent: 100, overridePercent: 0, indeterminatePercent: 31.2 },
  ],
  operationalQuality: { preAssignment: [{ status: "PASS", n: 93 }], activeHoldsByReason: [], casesWithResolvedHolds: 0 },
  technicalQuality: {
    latestProcessingRun: [{ status: "COMPLETED", n: 92 }, { status: "FAILED_TECHNICAL", n: 1 }],
    extractionQuality: [{ status: "COMPLETE", n: 86 }, { status: "DEGRADED", n: 7 }],
    signedDocx: [{ status: "READY", n: 49 }],
    signedPdf: [{ status: "READY", n: 47 }, { status: "GENERATION_FAILED", n: 2 }],
    casesWithTechnicalFailure: 3,
  },
  batchQuality: {
    sourceValidated: 93, sourceChecked: 93, sourceNotChecked: 0, rutMatched: 93, rutCompared: 93, identityWarnings: 2, identityInformational: 23,
    holdsActive: 0, specialReview: 1, contradictoryEvidence: 1, humanReviewRequired: 1, openTechnicalIncidents: 3,
  },
  technicalIncidents: {
    open: { cases: 3, processing: 1, processingWithoutReport: 0, preReport: 0, signing: 0, pdf: 2 },
    historical: { failures: 4, processingRuns: 2, artifacts: 2, cases: 4, resolvedCases: 1, extractionsRejected: 2 },
  },
  processingHealth: [
    { stage: "AI_PROCESSING", status: "WITH_INCIDENTS", openIncidents: 1, counts: { completed: 92, inProgress: 0, historicalFailures: 2 }, lastActivityAt: null },
    { stage: "EXTRACTION", status: "OPERATIVE", openIncidents: 0, counts: { assessed: 93, degraded: 7, rejected: 2 }, lastActivityAt: null },
    { stage: "WORKER", status: "OPERATIVE", openIncidents: 0, counts: { succeeded: 256, failed: 0, pending: 0, running: 0 }, lastActivityAt: "2026-09-14T22:21:42.923Z" },
    { stage: "DOCUMENTS", status: "WITH_INCIDENTS", openIncidents: 2, counts: { preReportReady: 44, preReportFailed: 0, signedPdf: 47, pdfFailed: 2 }, lastActivityAt: null },
    { stage: "SIGNATURE", status: "OPERATIVE", openIncidents: 0, counts: { signed: 49, inProgress: 0, failed: 0 }, lastActivityAt: null },
  ],
  engineStatus: { status: "WITH_INCIDENTS", openIncidents: 1 },
  humanEffort: { status: "INSUFFICIENT_TELEMETRY", minimumSample: 20, validReviewStarts: 0, segments: [] },
  operationalSavings: {
    status: "NOT_AVAILABLE", reason: "Sin línea base.", baselineReviewMinutes: null, actualReviewMinutes: null, estimatedMinutesSaved: null, estimatedHoursSaved: null,
  },
  attentionCases: {
    total: 35,
    byReason: [
      { reason: "REQUIRES_PRONOUNCEMENT", severity: "INFO", n: 32 },
      { reason: "PDF_FAILED", severity: "MEDIUM", n: 2 },
      { reason: "CONTRADICTORY_EVIDENCE", severity: "MEDIUM", n: 1 },
      { reason: "IDENTITY_WARNING", severity: "MEDIUM", n: 1 },
      { reason: "PROCESSING_RETRY_FAILED", severity: "MEDIUM", n: 1 },
    ],
    cases: [
      caso(1, "INDETERMINATE", "PENDING", ["PROCESSING_RETRY_FAILED", "CONTRADICTORY_EVIDENCE", "REQUIRES_PRONOUNCEMENT"], ["PROCESSING"], "MEDIUM"),
      caso(2, "IRRECOVERABLE", "FINALIZED", ["PDF_FAILED"], ["PDF"], "MEDIUM"),
      caso(3, "IRRECOVERABLE", "FINALIZED", ["PDF_FAILED"], ["PDF"], "MEDIUM"),
      caso(4, "RECOVERABLE", "PENDING", ["IDENTITY_WARNING"], [], "MEDIUM"),
      ...[5, 6, 7, 8, 9, 10].map((i) => caso(i, "INDETERMINATE", "PENDING", ["REQUIRES_PRONOUNCEMENT"], [], "INFO")),
    ],
  },
};

const CASO: CasoDashboard = {
  caseId: "00000000-0000-4000-8000-00000000ca01", externalCaseId: "90000001", batchId: W9, batchName: "SEMANA_09_2026",
  doctorName: "Profesional sintético", presentedOrientation: "INDETERMINATE", firstOrientation: "INDETERMINATE", doctorDetermination: null,
  status: "PENDING", requiresExplicitPronouncement: true, evidenceProfile: "LONGITUDINAL_CLINICAL_HISTORY", policyVersion: "1.2.0",
  reportId: "00000000-0000-4000-8000-0000000f0001", assignedAt: "2026-09-14T12:32:00.000Z", reviewStartedAt: null, ratifiedAt: null, signedAt: null,
  operationalSeconds: null, medicalCycleSeconds: null, signatureSeconds: null, corrections: 0,
  attentionReason: "PROCESSING_RETRY_FAILED", attentionReasons: ["PROCESSING_RETRY_FAILED", "CONTRADICTORY_EVIDENCE", "REQUIRES_PRONOUNCEMENT"],
  attentionSeverity: "MEDIUM", holdReason: null, openIncidents: ["PROCESSING"], identitySeverity: null, specialReview: true, contradictoryEvidence: true,
  orientationReason: { category: "CONTRADICTORY_EVIDENCE", label: "Evidencia clínica contradictoria · requiere revisión médica" },
};

const lote = (id: string, name: string, createdAt: string, totalCases: number) => ({
  batch: { id, name, normalizedName: name, sequence: null, status: "OPEN", source: "INGESTION", createdAt, closedAt: null },
  summary: { totalCases },
});
const LOTES = [
  lote(W8, "SEMANA_08_2026", "2026-09-04T19:36:32.594Z", 93),
  lote(PRUEBA, "LOTE-DE-PRUEBA-SINTETICO", "2026-09-10T00:53:42.870Z", 1),
  lote(W9, "SEMANA_09_2026", "2026-09-12T03:14:47.358Z", 93),
];

const AMBITO: AmbitoDashboard = { contrato: "Contrato sintético", region: "Región de Valparaíso", regiones: [] };

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
let fetchMock: ReturnType<typeof vi.fn>;
const llamadas = (parte: string) => fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes(parte));

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/admin/dashboard/overview")) return json(OVERVIEW);
    if (u.includes("/admin/dashboard/cases")) return json({ segment: "x", total: 1, limit: 25, offset: 0, cases: [CASO] });
    if (u.includes("/admin/batches")) return json({ batches: LOTES });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function pintar() {
  pintarConQuery(<Dashboard ambito={AMBITO} />);
  await screen.findByRole("group", { name: "Finalizados" });
}
const grupo = (nombre: string, dentro: HTMLElement = document.body) => within(dentro).getByRole("group", { name: nombre });
const region = (nombre: string) => screen.getByRole("region", { name: nombre });
const pestana = (nombre: string) => fireEvent.click(screen.getByRole("tab", { name: nombre }));

describe("Dashboard ejecutivo · resumen (Semana 9)", () => {
  it("A · arranca en la semana más reciente y muestra 93 / 49 / 44", async () => {
    await pintar();
    expect(llamadas("/admin/dashboard/overview")[0]).toContain(`batchId=${W9}`);
    expect(within(grupo("Casos de la semana")).getByText("93")).toBeDefined();
    expect(within(grupo("Casos de la semana")).getByText("Semana 9 · Región de Valparaíso")).toBeDefined();
    expect(within(grupo("Casos de la semana")).getByText("100% procesados")).toBeDefined();
    expect(within(grupo("Finalizados")).getByText("49")).toBeDefined();
    expect(within(grupo("Finalizados")).getByText("52,7% del total")).toBeDefined();
    expect(within(grupo("Pendientes médicos")).getByText("44")).toBeDefined();
    expect(within(grupo("Pendientes médicos")).getByText("47,3% del total")).toBeDefined();
  });

  it("B · concordancia 100 % con n = 49 y su definición; nunca «precisión»", async () => {
    await pintar();
    const t = grupo("Concordancia IA–Médico");
    expect(within(t).getByText("100%")).toBeDefined();
    expect(within(t).getByText("n = 49 comparables finalizados")).toBeDefined();
    expect(within(t).getByLabelText(/Casos finalizados cuya orientación presentada al médico fue Recuperable o No recuperable y coincide/)).toBeDefined();
    expect(document.body.textContent).not.toMatch(/precisi[oó]n|accuracy|tasa de acierto/i);
  });

  it("C · overrides 0 % · 0 / 49, con estado limpio en vez de ocultar el módulo", async () => {
    await pintar();
    expect(within(grupo("Overrides médicos")).getByText("0%")).toBeDefined();
    expect(within(grupo("Overrides médicos")).getByText("0 / 49")).toBeDefined();
    const panel = region("Overrides médicos");
    expect(within(panel).getByText("No se registran cambios de pronunciamiento en los casos finalizados de la selección actual.")).toBeDefined();
    expect(within(panel).getByText("Recuperable → Irrecuperable")).toBeDefined();
    expect(within(panel).getByText("No recuperable → Recuperable")).toBeDefined();
  });

  it("D/E · indeterminados: 29, 0 resueltos, 29 pendientes, 1 revisión especial; nunca «22 resueltos»", async () => {
    await pintar();
    const panel = region("Resolución de orientaciones indeterminadas");
    expect(within(grupo("Total", panel)).getByText("29")).toBeDefined();
    expect(within(grupo("Resueltos", panel)).getByText("0")).toBeDefined();
    expect(within(grupo("Pendientes", panel)).getByText("29")).toBeDefined();
    expect(within(grupo("Revisión especial", panel)).getByText("1")).toBeDefined();
    expect(within(panel).queryByText("22")).toBeNull();
    expect(within(panel).getByText("Aún no hay pronunciamientos médicos finales sobre casos indeterminados en la selección.")).toBeDefined();
    expect(within(grupo("Indeterminados IA")).getByText("1 revisión especial")).toBeDefined();
    expect(within(grupo("Indeterminados IA")).getByText("31,2% de los casos con orientación")).toBeDefined();
  });

  it("la matriz no presenta a las indeterminadas pendientes como resueltas: columna Pendiente", async () => {
    await pintar();
    const matriz = screen.getByRole("table", { name: "Matriz de concordancia" });
    expect(within(matriz).getByRole("button", { name: "IA Indeterminada, pendiente: 29 casos" })).toBeDefined();
    const resueltaRec = within(matriz).getByRole("button", { name: "IA Indeterminada, Médico · Recuperable: 0 casos" }) as HTMLButtonElement;
    expect(resueltaRec.disabled).toBe(true);
    expect(resueltaRec.className).toMatch(/violet/);
    expect(within(matriz).getByRole("button", { name: "IA Recuperable, Médico · Recuperable: 43 casos" })).toBeDefined();
    expect(screen.getByText("29 indeterminados aún sin pronunciamiento final.")).toBeDefined();
  });

  it("concordancia por orientación con numerador y denominador", async () => {
    await pintar();
    expect(within(grupo("IA Recuperable")).getByText("43 / 43 · 100%")).toBeDefined();
    expect(within(grupo("IA No recuperable")).getByText("6 / 6 · 100%")).toBeDefined();
  });

  it("causas de indeterminación desde el fundamento, sin el código genérico", async () => {
    await pintar();
    const panel = region("Principales causas de indeterminación");
    expect(within(panel).getByText("Cuadro sostenido sin tratamiento, evolución ni pronóstico")).toBeDefined();
    expect(within(panel).getByText("Sólo diagnósticos y licencias, sin hechos clínicos")).toBeDefined();
    expect(within(panel).getByText("Evaluación funcional")).toBeDefined();
    expect(panel.textContent).not.toContain("ORIENTATION_INDETERMINATE");
  });

  it("la evolución de orientación ocurre antes del médico y va aparte de los overrides", async () => {
    await pintar();
    const evolucion = region("Evolución de orientación antes de revisión médica");
    expect(within(evolucion).getByText("Indeterminada → Recuperable")).toBeDefined();
    expect(within(evolucion).getAllByText("13").length).toBeGreaterThan(0);
    expect(within(evolucion).getByText("80")).toBeDefined();
    expect(within(evolucion).getByText("cambiaron de orientación")).toBeDefined();
    expect(evolucion.textContent).toMatch(/antes de la revisión médica\. No es un override/);
    expect(within(region("Overrides médicos")).queryByText(/Indeterminada/)).toBeNull();
  });

  it("la tendencia semanal sólo usa semanas reales con casos comparables", async () => {
    await pintar();
    const grafico = screen.getByRole("figure", { name: "Indicadores por semana" });
    expect(within(grafico).getByText("Semana 8")).toBeDefined();
    expect(within(grafico).getByText("Semana 9")).toBeDefined();
    expect(grafico.textContent).not.toMatch(/Semana [567]\b|PRUEBA/);
    expect(within(grafico).getByRole("button", { name: /Semana 8 · n = 87 comparables · 93 casos · Versión del motor: v1\.0\.0, v1\.2\.0/ })).toBeDefined();
  });

  it("K · preinformes ratificados sin modificación: 100 % · 49 / 49", async () => {
    await pintar();
    const panel = region("Preinformes ratificados sin modificación");
    expect(within(panel).getByText("100%")).toBeDefined();
    expect(within(panel).getByText("49 / 49 finalizados")).toBeDefined();
    expect(within(panel).getByLabelText("Ayuda: Informes finalizados que no requirieron una corrección médica previa a la aprobación.")).toBeDefined();
  });

  it("tipo de cierre médico: finalizados y pendientes por separado", async () => {
    await pintar();
    const panel = region("Tipo de cierre médico");
    const finalizados = grupo("Cierre de finalizados", panel);
    expect(within(grupo("Ratificación directa", finalizados)).getByText("49")).toBeDefined();
    expect(within(grupo("Con pronunciamiento explícito", finalizados)).getByText("0")).toBeDefined();
    const pendientes = grupo("Cierre de pendientes", panel);
    expect(within(grupo("Ratificación directa", pendientes)).getByText("12")).toBeDefined();
    expect(within(grupo("Requieren pronunciamiento explícito", pendientes)).getByText("32")).toBeDefined();
  });

  it("atención: vista previa compacta, categorías visibles y «Ver todos»", async () => {
    await pintar();
    const panel = region("Casos que requieren atención");
    const tabla = within(panel).getByRole("table", { name: "Casos que requieren atención" });
    expect(within(tabla).getAllByRole("row")).toHaveLength(7); // encabezado + 6
    for (const [etiqueta, n] of [["Pronunciamiento requerido", 32], ["Incidencia PDF", 2], ["Incidencia de procesamiento", 1], ["Evidencia contradictoria", 1], ["Advertencia de identidad", 1], ["Retención", 0]] as const) {
      const chip = within(panel).getByRole("button", { name: `${etiqueta}: ${n}` }) as HTMLButtonElement;
      expect(chip.disabled).toBe(n === 0);
    }
    expect(within(panel).getByRole("button", { name: "Ver todos (35)" })).toBeDefined();
  });

  it("calidad rápida breve con incidencias abiertas; nunca «Errores técnicos»", async () => {
    await pintar();
    const panel = region("Calidad rápida del lote");
    expect(within(grupo("Validación fuente", panel)).getByText("93 / 93")).toBeDefined();
    expect(within(grupo("RUT coincidente", panel)).getByText("93 / 93")).toBeDefined();
    expect(within(grupo("Retenciones activas", panel)).getByText("0")).toBeDefined();
    expect(within(grupo("Advertencias de identidad", panel)).getByText("2")).toBeDefined();
    expect(within(grupo("Revisión especial", panel)).getByText("1")).toBeDefined();
    expect(within(grupo("Incidencias técnicas abiertas", panel)).getByText("3")).toBeDefined();
    expect(document.body.textContent).not.toMatch(/Errores técnicos/);
  });

  it("cabecera: última actualización, Actualizar vuelve a pedir y el estado del motor se deriva", async () => {
    await pintar();
    expect(screen.getByText("Última actualización: hace 3 min")).toBeDefined();
    expect(screen.getByText("Motor con incidencias · 1 abierta")).toBeDefined();
    expect(screen.getByText("Orientación v1.2.0")).toBeDefined();
    expect(screen.queryByText("Motor operativo")).toBeNull();
    const antes = llamadas("/admin/dashboard/overview").length;
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await waitFor(() => expect(llamadas("/admin/dashboard/overview").length).toBeGreaterThan(antes));
  });

  it("etiquetas en español en filtros y pestañas", async () => {
    await pintar();
    for (const etiqueta of ["Región", "Contrato", "Semana", "Médico", "Estado", "Orientación IA", "Pronunciamiento médico", "Perfil de evidencia", "Versión del motor"]) {
      expect(screen.getByLabelText(etiqueta)).toBeDefined();
    }
    for (const nombre of ["Resumen ejecutivo", "Tiempos del ciclo", "Calidad y operación"]) expect(screen.getByRole("tab", { name: nombre })).toBeDefined();
    expect(document.body.textContent).not.toMatch(/\b(REGION|CONTRACT|WEEK|DOCTOR|MOTOR|EVIDENCIA|PRONUNCIAMIENTO)\b/);
    expect((screen.getByLabelText("Semana") as HTMLSelectElement).value).toBe(W9);
    expect((screen.getByLabelText("Región") as HTMLSelectElement).disabled).toBe(true);
  });
});

describe("Dashboard ejecutivo · tiempos del ciclo", () => {
  it("G/H · ciclo médico sin telemetría: «—», «Sin datos todavía»; ningún minuto inventado", async () => {
    await pintar();
    pestana("Tiempos del ciclo");
    const ciclo = grupo("Tiempo de ciclo médico");
    expect(within(ciclo).getByText("—")).toBeDefined();
    expect(within(ciclo).getByText("Sin datos todavía")).toBeDefined();
    expect(within(ciclo).getByText("Disponible para revisiones iniciadas desde la incorporación de la telemetría.")).toBeDefined();
    expect(within(ciclo).getByText("Cobertura: 0 / 49 finalizados")).toBeDefined();
    const percentiles = grupo("P75 / P90 · ciclo médico");
    expect(within(percentiles).getByText("— / —")).toBeDefined();
    expect(within(percentiles).getByLabelText("Ayuda: Los percentiles se calcularán cuando existan revisiones con inicio registrado.")).toBeDefined();
    expect(within(region("Distribución del tiempo médico")).getByText("Aún no existen suficientes revisiones con inicio registrado.")).toBeDefined();
    expect(document.body.textContent).not.toMatch(/\b18 min|31 ?\/ ?52 min|\b43 s\b|2 h 14 min|\b16 min/);
  });

  it("I · tiempo operacional hasta ratificación: 84,4 min de mediana, con P75/P90 y n", async () => {
    await pintar();
    pestana("Tiempos del ciclo");
    const t = grupo("Tiempo operacional hasta ratificación");
    expect(within(t).getByText("84,4 min")).toBeDefined();
    expect(within(t).getByText("P75 102 min · P90 111,8 min")).toBeDefined();
    expect(within(t).getByText("Mediana · n = 49")).toBeDefined();
    expect(within(t).getByLabelText("Ayuda: Incluye el tiempo en cola desde la asignación.")).toBeDefined();
  });

  it("J · tiempo técnico de firma: 0,7 s, con 0,68 s en el detalle", async () => {
    await pintar();
    pestana("Tiempos del ciclo");
    const t = grupo("Tiempo técnico de firma");
    expect(within(t).getByText("0,7 s")).toBeDefined();
    expect(within(t).getByText("P50 0,68 s · P75 0,83 s · P90 0,97 s")).toBeDefined();
    expect(within(t).getByText("n = 49")).toBeDefined();
    expect(within(grupo("Tiempo operacional total")).getByText("84,4 min")).toBeDefined();
  });

  it("desglose y cobertura: los tramos sin registro no se estiman; sin dato no es cero", async () => {
    await pintar();
    pestana("Tiempos del ciclo");
    const desglose = region("Desglose del ciclo");
    expect(within(desglose).getAllByText("Sin registro")).toHaveLength(2);
    expect(within(desglose).getByText("0,7 s mediana")).toBeDefined();
    const cobertura = grupo("Cobertura de inicio de revisión");
    expect(within(cobertura).getByText("0 / 49")).toBeDefined();
    expect(within(cobertura).getByText("Sin dato no es cero minutos: los casos sin inicio registrado no se estiman.")).toBeDefined();
  });

  it("K · sin corrección 49, con corrección 0 y campos modificados con su cobertura real", async () => {
    await pintar();
    pestana("Tiempos del ciclo");
    const panel = region("Ratificado sin modificar vs. con corrección");
    expect(within(grupo("Sin corrección", panel)).getByText("49")).toBeDefined();
    expect(within(grupo("Con corrección", panel)).getByText("0")).toBeDefined();
    expect(within(panel).getByText("Ningún caso finalizado de la selección requirió corrección médica.")).toBeDefined();
    expect(panel.textContent).toMatch(/disponible para 1 de 54 correcciones\. No se extrapola/);
  });

  it("por médico: métricas operacionales, no ranking", async () => {
    await pintar();
    pestana("Tiempos del ciclo");
    const panel = region("Por médico");
    expect(within(panel).getByText("Métricas operacionales; no constituyen un ranking clínico.")).toBeDefined();
    const fila = within(panel).getByText("Profesional sintético").closest("tr") as HTMLElement;
    for (const texto of ["93", "49", "44", "52,7%", "0,68 s", "100% · n = 49", "0% · 0/49"]) expect(within(fila).getByText(texto)).toBeDefined();
  });
});

describe("Dashboard ejecutivo · calidad y operación", () => {
  it("F · perfiles de evidencia 53 / 33 / 7 con comparables", async () => {
    await pintar();
    pestana("Calidad y operación");
    expect(within(grupo("Perfil Especialista actual")).getByText("53")).toBeDefined();
    expect(within(grupo("Perfil Especialista actual")).getByText("casos · 41 comparables finalizados")).toBeDefined();
    expect(within(grupo("Perfil Longitudinal")).getByText("33")).toBeDefined();
    expect(within(grupo("Perfil Administrativa")).getByText("7")).toBeDefined();
    expect(screen.getByRole("figure", { name: "Concordancia e indeterminación por perfil de evidencia" })).toBeDefined();
  });

  it("N · incidencias técnicas ABIERTAS y fallos REGISTRADOS, con nombres distintos", async () => {
    await pintar();
    pestana("Calidad y operación");
    const panel = region("Incidencias técnicas");
    expect(within(grupo("Incidencias técnicas abiertas", panel)).getByText("3")).toBeDefined();
    expect(within(grupo("Fallos técnicos registrados", panel)).getByText("4")).toBeDefined();
    expect(within(panel).getByText("PDF del informe firmado")).toBeDefined();
    expect(document.body.textContent).not.toMatch(/Errores técnicos/);
  });

  it("procesamiento técnico derivado de las métricas: no todo es «Operativo»", async () => {
    await pintar();
    pestana("Calidad y operación");
    expect(within(grupo("Procesamiento IA")).getByText("Con incidencias")).toBeDefined();
    expect(within(grupo("Word/PDF")).getByText("Con incidencias")).toBeDefined();
    expect(within(grupo("Firma")).getByText("Operativo")).toBeDefined();
    expect(within(grupo("Extracción")).getByText("93 evaluadas · 7 degradadas · 2 no promovidas por calidad")).toBeDefined();
  });

  it("retenciones: estado limpio y enlace al módulo de Retenidos", async () => {
    await pintar();
    pestana("Calidad y operación");
    const panel = region("Retenciones e incidencias");
    expect(within(panel).getAllByText("Sin retenciones activas en la selección actual.").length).toBeGreaterThan(0);
    expect(within(panel).getByRole("link", { name: "Ver módulo de Retenidos" }).getAttribute("href")).toBe("/admin/retenidos");
  });
});

describe("Dashboard ejecutivo · drawer", () => {
  it("L · el drawer usa los filtros globales y los conserva al cerrarse", async () => {
    await pintar();
    fireEvent.change(screen.getByLabelText("Orientación IA"), { target: { value: "RECOVERABLE" } });
    await waitFor(() => expect(llamadas("/admin/dashboard/overview").some((u) => u.includes("presentedOrientation=RECOVERABLE"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "IA Recuperable, Médico · Recuperable: 43 casos" }));
    const panel = await screen.findByRole("dialog");
    await waitFor(() => expect(within(panel).getByText("#90000001")).toBeDefined());
    const pedido = llamadas("/admin/dashboard/cases").at(-1) as string;
    expect(pedido).toContain("segment=matrix%3ARECOVERABLE%3ARECOVERABLE");
    expect(pedido).toContain("presentedOrientation=RECOVERABLE");
    expect(pedido).toContain(`batchId=${W9}`);
    expect(within(panel).getByText(/los filtros globales se mantienen activos/)).toBeDefined();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((screen.getByLabelText("Orientación IA") as HTMLSelectElement).value).toBe("RECOVERABLE");
  });

  it("M · «Ver expediente» de ADMIN es un enlace a Informes: no registra inicio de revisión", async () => {
    await pintar();
    const atencion = region("Casos que requieren atención");
    fireEvent.click(within(atencion).getAllByRole("button", { name: "Ver detalle" })[0] as HTMLElement);
    const panel = await screen.findByRole("dialog", { name: "Expediente 90000001" });
    const tarjeta = await within(panel).findByRole("article", { name: "Caso 90000001" });
    expect(within(tarjeta).getByText("Requiere pronunciamiento explícito")).toBeDefined();
    expect(within(tarjeta).getByText("Sin registro")).toBeDefined();
    expect(within(tarjeta).getByText("Longitudinal")).toBeDefined();
    expect(within(tarjeta).getByText("Evidencia contradictoria")).toBeDefined();
    expect(within(tarjeta).getByText("Incidencia de procesamiento")).toBeDefined();
    const enlace = within(tarjeta).getByRole("link", { name: "Ver expediente" });
    expect(enlace.getAttribute("href")).toBe(`/admin/informes?semana=${W9}&tramite=90000001`);
    const evitarNavegacion = (e: Event) => e.preventDefault();
    document.addEventListener("click", evitarNavegacion);
    fireEvent.click(enlace);
    document.removeEventListener("click", evitarNavegacion);
    expect(llamadas("/medical-review/start")).toHaveLength(0);
    const metodos = fetchMock.mock.calls.map((c) => ((c[1] as RequestInit | undefined)?.method ?? "GET").toUpperCase());
    expect(metodos.every((m) => m === "GET")).toBe(true);
  });
});

describe("Dashboard ejecutivo · formato, semana por defecto y permisos", () => {
  it("sólo ADMIN entra; médico y calidad no", () => {
    expect(puedeAcceder("admin", "/admin/dashboard")).toBe(true);
    expect(puedeAcceder("medico", "/admin/dashboard")).toBe(false);
    expect(puedeAcceder("calidad", "/admin/dashboard")).toBe(false);
  });

  it("formatos: null es «—», n con elegibles, duraciones legibles", () => {
    expect(formatoPorcentaje(null)).toBe("—");
    expect(formatoPorcentaje(52.7)).toBe("52,7%");
    expect(formatoN(27, 49)).toBe("n = 27/49");
    expect(formatoN(49, 49)).toBe("n = 49");
    expect(formatoDuracion(0.679)).toBe("0,7 s");
    expect(formatoDuracionPrecisa(0.679)).toBe("0,68 s");
    expect(formatoDuracion(1080)).toBe("18 min");
    expect(formatoDuracion(5063.496)).toBe("84,4 min");
    expect(formatoDuracion(11000)).toBe("3 h 3 min");
    expect(formatoDuracion(null)).toBe("—");
    expect(nombreSemana("SEMANA_09_2026")).toBe("Semana 9");
    expect(nombreSemana("LOTE-DE-PRUEBA")).toBe("LOTE-DE-PRUEBA");
    expect(haceCuanto(new Date(Date.now() - 20_000).toISOString())).toBe("hace menos de 1 min");
  });

  it("la semana por defecto es la más reciente con casos", () => {
    const lotes = [...LOTES, lote("00000000-0000-4000-8000-0000000b0010", "SEMANA_10_2026", "2026-09-19T00:00:00.000Z", 0)] as unknown as BatchListItem[];
    expect(semanaMasReciente(lotes)).toBe(W9);
    expect(semanaMasReciente([])).toBeUndefined();
  });
});
