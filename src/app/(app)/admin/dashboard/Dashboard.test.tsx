import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { pintarConQuery } from "@/test/utils";
import { Dashboard } from "./Dashboard";
import { formatoDuracion, formatoN, formatoPorcentaje, type DashboardOverview } from "@/lib/dashboard";
import { puedeAcceder } from "@/lib/roles";

/**
 * DASHBOARD ADMIN — lo que se muestra es lo que calculó el backend, con su base.
 *
 * Datos con la forma real de Semana 9 (sintéticos, sin PII): 93 casos, 49
 * finalizados, concordancia 100% sobre 49 comparables, 29 indeterminadas
 * pendientes, sin inicio de revisión registrado.
 */

const metrica = (n: number, eligible: number, p50: number | null, p75: number | null = p50, p90: number | null = p50) => ({
  n, eligible, coveragePercent: eligible ? Math.round((n / eligible) * 1000) / 10 : null, p50, p75, p90, mean: p50,
});

const OVERVIEW: DashboardOverview = {
  generatedAt: "2026-09-15T15:00:00.000Z",
  scope: { contractId: "00000000-0000-4000-8000-00000000c036", regionId: null },
  summary: {
    total: 93, finalized: 49, pending: 44, onHold: 0, progressPercent: 52.7,
    concordancePercent: 100, concordanceN: 49, overrides: 0, overridePercent: 0,
    indeterminate: 29, indeterminateRatePercent: 31.2, withOrientation: 93,
    medicalCycleP50: null, medicalCycleP90: null, medicalCycleN: 0, medicalCycleEligible: 49,
    signatureP50: 0.679, signatureN: 49, holdsActive: 0, technicalFailures: 3,
  },
  concordance: {
    source: "PRESENTED_TO_DOCTOR", comparable: 49, matches: 49, concordancePercent: 100,
    matrix: [
      { ai: "RECOVERABLE", doctor: "RECOVERABLE", n: 43 },
      { ai: "IRRECOVERABLE", doctor: "IRRECOVERABLE", n: 6 },
    ],
  },
  overrides: { comparable: 49, recoverableToIrrecoverable: 0, irrecoverableToRecoverable: 0, recoverableToIrrecoverablePercent: 0, irrecoverableToRecoverablePercent: 0, total: 0, totalPercent: 0 },
  indeterminateResolution: { total: 29, resolvedToRecoverable: 0, resolvedToIrrecoverable: 0, pending: 29, reasons: [{ code: "ORIENTATION_INDETERMINATE", n: 29 }] },
  orientationEvolution: {
    total: 93, unchanged: 80, changed: 13,
    transitions: [{ first: "RECOVERABLE", presented: "RECOVERABLE", n: 45 }, { first: "INDETERMINATE", presented: "RECOVERABLE", n: 13 }],
  },
  evidenceQuality: [
    { profile: "CURRENT_SPECIALIST_REPORT", cases: 53, finalized: 41, comparable: 41, matches: 41, overrides: 0, indeterminate: 0, withOrientation: 53, cycleN: 0, cycleP50: null, concordancePercent: 100, overridePercent: 0, indeterminatePercent: 0 },
  ],
  medicalOperations: [
    {
      doctorProfileId: "00000000-0000-4000-8000-0000000d0c01", doctorName: "Profesional sintético", assigned: 93, finalized: 49, pending: 44, onHold: 0,
      progressPercent: 52.7, cycleN: 0, cycleEligible: 49, cycleCoveragePercent: 0, cycleP50: null, cycleP75: null, cycleP90: null,
      signatureN: 49, signatureP50: 0.679, operationalN: 49, operationalP50: 5063.5, comparable: 49, matches: 49, overrides: 0,
      concordancePercent: 100, overridePercent: 0, indeterminatePercent: null,
    },
  ],
  cycleTimes: {
    assignmentToRatification: metrica(49, 49, 5063.5, 6122.5, 6710.5),
    assignmentToReviewStart: metrica(0, 93, null),
    reviewStartToRatification: metrica(0, 49, null),
    ratificationToSignature: metrica(49, 49, 0.679, 0.825, 0.966),
    reviewStartToSignature: metrica(0, 49, null),
    assignmentToSignature: metrica(49, 49, 5063.9),
    signatureToPdf: metrica(47, 49, 0.1),
    reviewStartCoverage: { eligibleFinalized: 49, withValidStart: 0, coveragePercent: 0, recordedNotValid: 0, pendingWithStart: 0 },
    distribution: {
      reviewStartToRatification: { lt10: 0, m10_20: 0, m20_30: 0, m30_60: 0, h1_2: 0, gt2h: 0 },
      assignmentToRatification: { lt10: 0, m10_20: 1, m20_30: 2, m30_60: 5, h1_2: 38, gt2h: 3 },
    },
    timelineP50: { assignedToRatifiedP50: 5063.5 },
  },
  interventions: {
    finalized: 49, unmodified: 49, corrected: 0, changedPronouncement: 0, textOnly: 0, pronouncedFromIndeterminate: 0, unmodifiedPercent: 100,
    fieldDetailCoverage: { corrected: 0, withFieldDetail: 0, coveragePercent: null }, modifiedFields: [],
  },
  resolutionPath: { finalizedDirect: 49, finalizedExplicit: 0, pendingDirect: 12, pendingExplicit: 32, finalizedExplicitPercent: 0 },
  preReportUsable: { unmodified: 49, finalized: 49, percent: 100 },
  policyVersions: [{ version: "1.2.0", cases: 93, finalized: 49, comparable: 49, matches: 49, overrides: 0, indeterminate: 29, withOrientation: 93, concordancePercent: 100, overridePercent: 0, indeterminatePercent: 31.2 }],
  operationalQuality: { preAssignment: [{ status: "PASS", n: 93 }], activeHoldsByReason: [], casesWithResolvedHolds: 0 },
  technicalQuality: {
    latestProcessingRun: [{ status: "COMPLETED", n: 92 }, { status: "FAILED_TECHNICAL", n: 1 }],
    extractionQuality: [{ status: "COMPLETE", n: 86 }], signedDocx: [{ status: "READY", n: 49 }], signedPdf: [{ status: "READY", n: 47 }],
    casesWithTechnicalFailure: 3,
  },
  attentionCases: {
    total: 2,
    byReason: [{ reason: "PROCESSING_FAILED", severity: "HIGH", n: 1 }, { reason: "PDF_FAILED", severity: "MEDIUM", n: 1 }],
    cases: [
      { caseId: "00000000-0000-4000-8000-00000000ca01", externalCaseId: "90000001", batchName: "Semana 9", doctorName: "Profesional sintético", presentedOrientation: "INDETERMINATE", doctorDetermination: null, status: "PENDING", reason: "PROCESSING_FAILED", holdReason: null, severity: "HIGH" },
    ],
  },
};

const CASOS = {
  segment: "matrix:RECOVERABLE:RECOVERABLE", total: 1, limit: 25, offset: 0,
  cases: [{
    caseId: "00000000-0000-4000-8000-00000000ca02", externalCaseId: "90000002", batchName: "Semana 9", doctorName: "Profesional sintético",
    presentedOrientation: "RECOVERABLE", firstOrientation: "RECOVERABLE", doctorDetermination: "RECOVERABLE", status: "FINALIZED",
    requiresExplicitPronouncement: false, evidenceProfile: "CURRENT_SPECIALIST_REPORT", policyVersion: "1.2.0",
    assignedAt: "2026-09-14T12:32:00.000Z", reviewStartedAt: null, ratifiedAt: "2026-09-14T13:56:00.000Z", signedAt: "2026-09-14T13:56:01.000Z",
    corrections: 0, attentionReason: null, attentionSeverity: null, holdReason: null,
  }],
};

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/admin/dashboard/overview")) return json(OVERVIEW);
    if (u.includes("/admin/dashboard/cases")) return json(CASOS);
    if (u.includes("/admin/batches")) return json({ batches: [{ batch: { id: "00000000-0000-4000-8000-0000000b0009", name: "Semana 9" }, summary: {} }] });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function pintar() {
  pintarConQuery(<Dashboard />);
  await waitFor(() => expect(screen.getByText("Concordancia IA–Médico", { selector: "p" })).toBeDefined());
}
const tarjeta = (etiqueta: string) => (screen.getByText(etiqueta, { selector: "p" }).closest("div,button") as HTMLElement);

describe("Dashboard ADMIN · resumen", () => {
  it("concordancia con su n y la definición en la ayuda; nunca «precisión»", async () => {
    await pintar();
    const t = tarjeta("Concordancia IA–Médico");
    expect(within(t).getByText("100%")).toBeDefined();
    expect(within(t).getByText("n = 49 casos comparables finalizados")).toBeDefined();
    expect(within(t).getByLabelText(/Calculado únicamente sobre casos finalizados cuya orientación presentada/)).toBeDefined();
    expect(document.body.textContent).not.toMatch(/precisi[oó]n|accuracy|tasa de acierto/i);
  });

  it("sin inicio de revisión registrado: «—» y la cobertura 0/49, sin inventar un tiempo", async () => {
    await pintar();
    const t = tarjeta("Tiempo de ciclo médico (mediana)");
    expect(within(t).getByText("—")).toBeDefined();
    expect(within(t).getByText(/Sin inicio de revisión registrado · n = 0\/49/)).toBeDefined();
  });

  it("tiempo técnico de firma y tiempos del ciclo con p50/p75/p90 y n", async () => {
    await pintar();
    expect(within(tarjeta("Tiempo técnico de firma (mediana)")).getByText("0,7 s")).toBeDefined();
    const tabla = screen.getByRole("table", { name: "Tiempos del ciclo" });
    const fila = within(tabla).getByText("Tiempo operacional hasta ratificación").closest("tr") as HTMLElement;
    // La mediana va en la celda destacada; el promedio (secundario) puede coincidir.
    expect(within(fila).getAllByText("1 h 24 min")[0]?.className).toMatch(/font-medium/);
    expect(within(fila).getByText("n = 49")).toBeDefined();
    const ciclo = within(tabla).getByText("Tiempo de ciclo médico").closest("tr") as HTMLElement;
    expect(within(ciclo).getByText(/n = 0\/49/)).toBeDefined();
  });
});

describe("Dashboard ADMIN · matriz y drilldown", () => {
  it("la fila INDETERMINADA se ve distinta y dice que no entra en la concordancia", async () => {
    await pintar();
    const matriz = screen.getByRole("table", { name: "Matriz de concordancia" });
    const fila = matriz.querySelector('[data-fila="INDETERMINATE"]') as HTMLElement;
    expect(fila.className).toMatch(/bg-zinc-50/);
    expect(within(fila).getByText(/fuera de la concordancia/)).toBeDefined();
  });

  it("clic en una celda abre el panel con los casos del segmento, con los mismos filtros", async () => {
    await pintar();
    fireEvent.click(screen.getByRole("button", { name: "IA Recuperable, médico Recuperable: 43" }));
    const panel = await screen.findByRole("dialog");
    await waitFor(() => expect(within(panel).getByText("90000002")).toBeDefined());
    const llamada = fetchMock.mock.calls.map((c) => String(c[0])).find((u) => u.includes("/admin/dashboard/cases"));
    expect(llamada).toContain("segment=matrix%3ARECOVERABLE%3ARECOVERABLE");
    expect(within(panel).getByText("sin registro")).toBeDefined();
  });

  it("la evolución del motor se muestra aparte de los overrides", async () => {
    await pintar();
    const evolucion = screen.getByRole("region", { name: "Cambio de orientación durante el procesamiento" });
    expect(within(evolucion).getByText("Indeterminada → Recuperable")).toBeDefined();
    const overrides = screen.getByRole("region", { name: "Overrides médicos" });
    expect(within(overrides).queryByText(/Indeterminada/)).toBeNull();
  });
});

describe("Dashboard ADMIN · filtros", () => {
  it("cambiar un filtro vuelve a pedir el overview con ese parámetro", async () => {
    await pintar();
    fireEvent.change(screen.getByLabelText("Orientación presentada IA"), { target: { value: "INDETERMINATE" } });
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/admin/dashboard/overview?presentedOrientation=INDETERMINATE"))).toBe(true),
    );
  });
});

describe("Dashboard ADMIN · permisos y formato", () => {
  it("sólo ADMIN entra; médico y calidad no", () => {
    expect(puedeAcceder("admin", "/admin/dashboard")).toBe(true);
    expect(puedeAcceder("medico", "/admin/dashboard")).toBe(false);
    expect(puedeAcceder("calidad", "/admin/dashboard")).toBe(false);
  });

  it("formatos: null es «—», n con elegibles, duraciones legibles", () => {
    expect(formatoPorcentaje(null)).toBe("—");
    expect(formatoN(27, 49)).toBe("n = 27/49");
    expect(formatoN(49, 49)).toBe("n = 49");
    expect(formatoDuracion(0.679)).toBe("0,7 s");
    expect(formatoDuracion(1080)).toBe("18 min");
    expect(formatoDuracion(5063.5)).toBe("1 h 24 min");
    expect(formatoDuracion(null)).toBe("—");
  });
});
