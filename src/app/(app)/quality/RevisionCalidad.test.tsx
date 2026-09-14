import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { pintarConQuery } from "@/test/utils";
import { RevisionCalidad } from "./RevisionCalidad";
import type { OrientationReview, ReportListItem } from "@/lib/backend";

/**
 * CALIDAD · el motivo corto de la orientación y su fundamento, sin estorbar la
 * devolución al médico. Sin PII: los expedientes son sintéticos.
 */

const RATIFICADO: ReportListItem = {
  reportId: "00000000-0000-4000-8000-0000000000b1",
  caseId: "00000000-0000-4000-8000-0000000000d1",
  externalCaseId: "34300001",
  version: 1,
  createdAt: "2026-09-08T13:41:00.000Z",
  batch: null,
  doctor: null,
  workflowStatus: "SIGNED",
  readinessStatus: "READY",
  orientationAssessment: "IRRECOVERABLE",
  signedAt: "2026-09-09T10:00:00.000Z",
  orientationReason: {
    category: "IRRECOVERABLE_SUPPORTED",
    label: "Cuadro crónico sin respuesta a tratamientos",
    requiresClinicalReview: false,
  },
};

const REVIEW: OrientationReview = {
  reportId: RATIFICADO.reportId,
  caseId: RATIFICADO.caseId,
  externalCaseId: RATIFICADO.externalCaseId,
  assessment: "IRRECOVERABLE",
  category: "IRRECOVERABLE_SUPPORTED",
  label: RATIFICADO.orientationReason?.label ?? "",
  rationale: "Múltiples tratamientos sin respuesta documentada.",
  whatToReview: null,
  presentEvidence: [],
  missingEvidence: [],
  supportingSummary: [],
  opposingSummary: [],
  warnings: [],
  requiresClinicalReview: false,
  reviewFlags: [],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RevisionCalidad · orientación IA", () => {
  it("muestra el motivo corto y abre el fundamento; «Devolver al médico» sigue ahí", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const body = String(url).includes("/orientation-review")
          ? REVIEW
          : { reports: [RATIFICADO], total: 1, countsByWorkflowStatus: {} };
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    pintarConQuery(<RevisionCalidad />);

    await waitFor(() => expect(screen.getByText("34300001")).toBeDefined());
    expect(screen.getByText("Cuadro crónico sin respuesta a tratamientos")).toBeDefined();
    expect(screen.getByRole("button", { name: "Devolver al médico" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Ver fundamento" }));
    await waitFor(() => expect(screen.getByText("Múltiples tratamientos sin respuesta documentada.")).toBeDefined());
    expect(screen.getByText("Fundamento IA")).toBeDefined();

    // Filtro de cliente: otra orientación deja la vista vacía.
    fireEvent.change(screen.getByLabelText("Filtrar por orientación IA"), { target: { value: "RECOVERABLE" } });
    expect(screen.queryByText("34300001")).toBeNull();
    expect(screen.getByText("Sin informes en esta vista.")).toBeDefined();
  });
});
