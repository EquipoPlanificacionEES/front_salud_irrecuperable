import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { pintarConQuery } from "@/test/utils";
import { RevisionCalidad } from "./RevisionCalidad";
import type { OrientationReview, ReportListItem } from "@/lib/backend";

/**
 * CALIDAD · el motivo corto de la orientación y su fundamento, sin estorbar la
 * devolución al médico. Sin PII: los expedientes son sintéticos.
 */

/**
 * RATIFICADO Y TODAVÍA SIN DOCUMENTO. Es el caso para el que nació «Devolver al
 * médico»: aún no hay informe firmado que conservar.
 */
const RATIFICADO: ReportListItem = {
  reportId: "00000000-0000-4000-8000-0000000000b1",
  caseId: "00000000-0000-4000-8000-0000000000d1",
  externalCaseId: "34300001",
  version: 1,
  createdAt: "2026-09-08T13:41:00.000Z",
  batch: null,
  doctor: null,
  workflowStatus: "APPROVED",
  readinessStatus: "READY",
  orientationAssessment: "IRRECOVERABLE",
  signedAt: null,
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

/**
 * UN SOLO MECANISMO PARA UN INFORME FIRMADO.
 *
 * Devolver al médico abre la versión siguiente marcando la anterior —y sus
 * documentos— como superados. Sobre un informe ya firmado eso esconde el
 * documento emitido, así que ahí el único camino es la autorización de
 * corrección de Administración. Calidad lo lee, no lo ejecuta.
 */
describe("RevisionCalidad · un informe firmado no se devuelve por aquí", () => {
  const FIRMADO: ReportListItem = {
    ...RATIFICADO,
    reportId: "00000000-0000-4000-8000-0000000000b2",
    externalCaseId: "33315064",
    workflowStatus: "SIGNED",
    signedAt: "2026-09-16T14:16:11.000Z",
  };

  it("no ofrece la acción antigua y explica cuál es el camino", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ reports: [FIRMADO], total: 1, countsByWorkflowStatus: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    pintarConQuery(<RevisionCalidad />);

    await waitFor(() => expect(screen.getByText("33315064")).toBeDefined());
    expect(screen.queryByRole("button", { name: "Devolver al médico" })).toBeNull();
    expect(
      screen.getByText(/sólo pueden reabrirse mediante una autorización de corrección/i),
    ).toBeDefined();
  });

  it("un informe ratificado y aún sin documento sí se puede devolver", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ reports: [RATIFICADO], total: 1, countsByWorkflowStatus: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    pintarConQuery(<RevisionCalidad />);

    await waitFor(() => expect(screen.getByText("34300001")).toBeDefined());
    expect(screen.getByRole("button", { name: "Devolver al médico" })).toBeDefined();
  });
});
