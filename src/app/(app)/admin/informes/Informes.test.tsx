import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { pintarConQuery } from "@/test/utils";
import { Informes } from "./Informes";
import type { OrientationReview, ReportListItem } from "@/lib/backend";

/**
 * INFORMES (ADMIN) · el motivo corto de la orientación y su fundamento.
 * Sin PII: los expedientes son sintéticos.
 */

const INDETERMINADA: ReportListItem = {
  reportId: "00000000-0000-4000-8000-0000000000a1",
  caseId: "00000000-0000-4000-8000-0000000000c1",
  externalCaseId: "34200001",
  version: 1,
  createdAt: "2026-09-08T13:41:00.000Z",
  batch: null,
  doctor: null,
  workflowStatus: "READY_FOR_REVIEW",
  readinessStatus: "READY",
  orientationAssessment: "INDETERMINATE",
  signedAt: null,
  orientationReason: {
    category: "MISSING_CLINICAL_DOMAINS",
    label: "Falta evolución y pronóstico",
    requiresClinicalReview: true,
  },
};

const RECUPERABLE: ReportListItem = {
  ...INDETERMINADA,
  reportId: "00000000-0000-4000-8000-0000000000a2",
  caseId: "00000000-0000-4000-8000-0000000000c2",
  externalCaseId: "34200002",
  orientationAssessment: "RECOVERABLE",
  orientationReason: { category: "RECOVERABLE_SUPPORTED", label: "Tratamiento activo", requiresClinicalReview: false },
};

const REVIEW: OrientationReview = {
  reportId: INDETERMINADA.reportId,
  caseId: INDETERMINADA.caseId,
  externalCaseId: INDETERMINADA.externalCaseId,
  assessment: "INDETERMINATE",
  category: "MISSING_CLINICAL_DOMAINS",
  label: "Falta evolución y pronóstico",
  rationale: "No constan evolución ni pronóstico.",
  whatToReview: "Buscar informe de evolución.",
  presentEvidence: [],
  missingEvidence: [],
  supportingSummary: [],
  opposingSummary: [],
  warnings: [],
  requiresClinicalReview: true,
  reviewFlags: [],
};

function backend(reports: ReportListItem[]) {
  return vi.fn(async (url: string) => {
    const u = String(url);
    const json = (b: unknown) =>
      new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    if (u.includes("/orientation-review")) return json(REVIEW);
    if (u.includes("/reports?")) return json({ reports, total: reports.length, countsByWorkflowStatus: {} });
    return json({ batches: [] });
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Informes · orientación IA", () => {
  it("muestra el motivo corto, la revisión médica y abre el fundamento a demanda", async () => {
    const fetchMock = backend([INDETERMINADA, RECUPERABLE]);
    vi.stubGlobal("fetch", fetchMock);
    pintarConQuery(<Informes />);

    await waitFor(() => expect(screen.getByText("34200001")).toBeDefined());
    expect(screen.getAllByText("Falta evolución y pronóstico").length).toBeGreaterThan(0);
    expect(screen.getByText("Requiere revisión médica")).toBeDefined();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/orientation-review"))).toBe(false);

    const botones = screen.getAllByRole("button", { name: "Ver fundamento" });
    expect(botones).toHaveLength(2);
    fireEvent.click(botones[0] as HTMLElement);

    await waitFor(() => expect(screen.getByText("No constan evolución ni pronóstico.")).toBeDefined());
    expect(screen.getByText("Motivo")).toBeDefined();
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes(`/reports/${INDETERMINADA.reportId}/orientation-review`)),
    ).toBe(true);
  });

  it("el filtro de orientación viaja al servidor", async () => {
    const fetchMock = backend([INDETERMINADA]);
    vi.stubGlobal("fetch", fetchMock);
    pintarConQuery(<Informes />);
    await waitFor(() => expect(screen.getByText("34200001")).toBeDefined());

    fireEvent.change(screen.getByLabelText("Filtrar por orientación IA"), { target: { value: "INDETERMINATE" } });
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("orientation=INDETERMINATE"))).toBe(true),
    );
  });

  it("el filtro de estado tiene una opción por estado real, sin textos repetidos, y viaja al servidor", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      const json = (b: unknown) =>
        new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
      if (u.includes("/reports?")) {
        return json({
          reports: [INDETERMINADA],
          total: 1,
          countsByWorkflowStatus: { READY_FOR_REVIEW: 44, APPROVED: 1, SIGNING: 2, SIGNED: 46 },
        });
      }
      return json({ batches: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    pintarConQuery(<Informes />);
    await waitFor(() => expect(screen.getByText("34200001")).toBeDefined());

    const select = screen.getByLabelText("Filtrar por estado") as HTMLSelectElement;
    const textos = [...select.options].map((o) => o.textContent);
    expect(textos).toEqual([
      "Cualquier estado",
      "Por revisar (médico)",
      "Devuelto al médico",
      "Ratificado · pendiente de firma",
      "Ratificado · firmando",
      "Ratificado · firmado",
      "Firma fallida",
    ]);
    expect(new Set(textos).size).toBe(textos.length);

    // Los contadores se suman bajo su texto visible: una sola chapa «Ratificado».
    expect(screen.getByText("Ratificado: 49")).toBeDefined();
    expect(screen.getByText("Por revisar: 44")).toBeDefined();
    expect(screen.queryAllByText(/^Ratificado: /)).toHaveLength(1);

    fireEvent.change(select, { target: { value: "SIGNED" } });
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("workflowStatus=SIGNED"))).toBe(true),
    );
  });

  it("el filtro por motivo de indeterminación deja sólo esas filas", async () => {
    vi.stubGlobal("fetch", backend([INDETERMINADA, RECUPERABLE]));
    pintarConQuery(<Informes />);
    await waitFor(() => expect(screen.getByText("34200002")).toBeDefined());

    fireEvent.change(screen.getByLabelText("Motivo de indeterminación"), {
      target: { value: "MISSING_CLINICAL_DOMAINS" },
    });
    expect(screen.queryByText("34200002")).toBeNull();
    expect(screen.getByText("34200001")).toBeDefined();
  });
});
