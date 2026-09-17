import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { pintarConQuery } from "@/test/utils";
import { Informes } from "./Informes";
import type {
  DocumentosFirmados,
  EstadoDocumentoFirmado,
  OrientationReview,
  ReportListItem,
} from "@/lib/backend";

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

/**
 * CORREGIR UN INFORME YA FIRMADO — la mitad administrativa.
 *
 * Lo que se congela aquí: que la acción sólo exista sobre un informe FIRMADO,
 * que el motivo sea obligatorio, que confirmar llame a la ruta de autorización
 * de ESA versión, y que el historial siga mostrando la versión reemplazada con
 * su documento. Nada de esto crea una versión: eso lo hace el médico.
 */
function documentos(reportSnapshotId: string, version: number, pdf: EstadoDocumentoFirmado): DocumentosFirmados {
  const base = `/api/v1/reports/${reportSnapshotId}/signed-document`;
  return {
    reportSnapshotId,
    version,
    docx: { status: "READY", downloadUrl: `${base}?format=docx` },
    pdf: { status: pdf, downloadUrl: pdf === "READY" ? `${base}?format=pdf` : null },
  };
}

const V2 = "00000000-0000-4000-8000-0000000000b9";
const V3 = "00000000-0000-4000-8000-0000000000ba";

describe("Informes · corrección de un informe firmado", () => {
  const FIRMADO: ReportListItem = {
    ...INDETERMINADA,
    reportId: "00000000-0000-4000-8000-0000000000a9",
    caseId: "00000000-0000-4000-8000-0000000000c9",
    externalCaseId: "33315064",
    workflowStatus: "SIGNED",
    signedAt: "2026-09-16T14:16:11.000Z",
  };

  const VERSIONES = {
    caseId: FIRMADO.caseId,
    versions: [
      {
        reportSnapshotId: FIRMADO.reportId,
        version: 1,
        current: false,
        workflowStatus: "SIGNED",
        createdAt: "2026-09-16T14:10:00.000Z",
        supersededAt: "2026-09-17T10:00:00.000Z",
        approvedAt: "2026-09-16T14:16:00.000Z",
        signedAt: "2026-09-16T14:16:11.000Z",
        doctorName: "Médica de Prueba",
        determination: "RECOVERABLE",
        correctionReason: null,
        finalArtifact: { downloadUrl: `/api/v1/reports/${FIRMADO.reportId}/signed-document` },
        finalPdfArtifact: null,
        signedDocuments: documentos(FIRMADO.reportId, 1, "READY"),
      },
      {
        reportSnapshotId: "00000000-0000-4000-8000-0000000000b9",
        version: 2,
        current: true,
        workflowStatus: "SIGNED",
        createdAt: "2026-09-17T09:00:00.000Z",
        supersededAt: null,
        approvedAt: "2026-09-17T09:50:00.000Z",
        signedAt: "2026-09-17T10:00:00.000Z",
        doctorName: "Médica de Prueba",
        determination: "IRRECOVERABLE",
        correctionReason: "Ratificación realizada por error; se reabre para corregirlo.",
        finalArtifact: { downloadUrl: "/api/v1/reports/00000000-0000-4000-8000-0000000000b9/signed-document" },
        finalPdfArtifact: null,
        signedDocuments: documentos(V2, 2, "FAILED"),
      },
      {
        // Una corrección más, abierta y sin firmar: no tiene documentos finales.
        reportSnapshotId: V3,
        version: 3,
        current: false,
        workflowStatus: "READY_FOR_REVIEW",
        createdAt: "2026-09-17T11:00:00.000Z",
        supersededAt: null,
        approvedAt: null,
        signedAt: null,
        doctorName: null,
        determination: null,
        correctionReason: "Segunda revisión.",
        finalArtifact: null,
        finalPdfArtifact: null,
        signedDocuments: null,
      },
    ],
  };

  function backendFirmado() {
    return vi.fn(async (...args: unknown[]) => {
      const u = String(args[0]);
      const respuesta = (b: unknown) =>
        new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
      if (u.includes("/post-sign-correction")) return respuesta({ status: "OPEN", reason: "x" });
      if (u.includes("/versions")) return respuesta(VERSIONES);
      if (u.includes("/reports?")) return respuesta({ reports: [FIRMADO], total: 1, countsByWorkflowStatus: {} });
      return respuesta({ batches: [] });
    });
  }

  it("pide un motivo y, al confirmarlo, habilita la corrección de ESA versión firmada", async () => {
    const fetchMock = backendFirmado();
    vi.stubGlobal("fetch", fetchMock);
    pintarConQuery(<Informes />);
    await waitFor(() => expect(screen.getByText("33315064")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Habilitar corrección" }));
    expect(screen.getByText(/Corregir informe firmado/)).toBeDefined();
    // El aviso dice lo que NO va a pasar, que es lo que preocupa a quien autoriza.
    expect(screen.getByText(/no será modificado ni eliminado/i)).toBeDefined();

    const confirmar = screen.getAllByRole("button", { name: "Habilitar corrección" }).at(-1) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Motivo de corrección"), {
      target: { value: "Ratificación realizada por error; se reabre para corregirlo." },
    });
    expect(confirmar.disabled).toBe(false);
    fireEvent.click(confirmar);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((c) =>
          String(c[0]).includes(`/reports/${FIRMADO.reportId}/post-sign-correction`),
        ),
      ).toBe(true),
    );
    const llamada = fetchMock.mock.calls.find((c) => String(c[0]).includes("/post-sign-correction"));
    const cuerpo = JSON.parse(String((llamada?.[1] as RequestInit).body)) as { reason: string };
    expect(cuerpo.reason).toContain("Ratificación realizada por error");
  });

  it("el historial muestra la versión reemplazada junto a la vigente, con su documento", async () => {
    vi.stubGlobal("fetch", backendFirmado());
    pintarConQuery(<Informes />);
    await waitFor(() => expect(screen.getByText("33315064")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Historial" }));
    await waitFor(() => expect(screen.getByText("Vigente")).toBeDefined());
    expect(screen.getByText("Reemplazada")).toBeDefined();
    expect(screen.getByText("Sin firmar")).toBeDefined();
    expect(screen.getByText(/Ratificación realizada por error/)).toBeDefined();
    // D · la versión reemplazada conserva SUS documentos: la historia no se borra.
    expect(screen.getByRole("link", { name: "Descargar Word de la versión 1" }).getAttribute("href")).toBe(
      `/api/v1/reports/${FIRMADO.reportId}/signed-document?format=docx`,
    );
    expect(screen.getByRole("link", { name: "Descargar PDF de la versión 1" }).getAttribute("href")).toBe(
      `/api/v1/reports/${FIRMADO.reportId}/signed-document?format=pdf`,
    );
    // E · la vigente, los suyos; su PDF falló y se dice, sin enlace.
    expect(screen.getByRole("link", { name: "Descargar Word de la versión 2" }).getAttribute("href")).toContain(V2);
    expect(screen.queryByRole("link", { name: "Descargar PDF de la versión 2" })).toBeNull();
    expect(screen.getByText("PDF no disponible")).toBeDefined();
    // Una versión sin firmar no ofrece descargas finales inexistentes.
    expect(screen.queryByRole("link", { name: /versión 3/ })).toBeNull();
  });
});

/**
 * DESCARGAS EN EL LISTADO. La fila ofrece el Word y el PDF de la ÚLTIMA
 * VERSIÓN FIRMADA del expediente, con la ruta que trae el servidor — que durante
 * una corrección no es la de la fila.
 */
describe("Informes · descarga del informe firmado en Word y PDF", () => {
  const BASE: ReportListItem = {
    ...INDETERMINADA,
    reportId: "00000000-0000-4000-8000-0000000000e1",
    caseId: "00000000-0000-4000-8000-0000000000e2",
    externalCaseId: "33961795",
    workflowStatus: "SIGNED",
    signedAt: "2026-09-10T12:00:00.000Z",
  };

  it("A · Word y PDF listos: los dos botones", async () => {
    const fila = { ...BASE, signedDocuments: documentos(BASE.reportId, 1, "READY") };
    vi.stubGlobal("fetch", backend([fila]));
    pintarConQuery(<Informes />);
    await waitFor(() => expect(screen.getByText("33961795")).toBeDefined());

    expect(screen.getByRole("link", { name: "Descargar Word" }).getAttribute("href")).toBe(
      `/api/v1/reports/${BASE.reportId}/signed-document?format=docx`,
    );
    expect(screen.getByRole("link", { name: "Descargar PDF" }).getAttribute("href")).toBe(
      `/api/v1/reports/${BASE.reportId}/signed-document?format=pdf`,
    );
  });

  it("B · Word listo y PDF fallido: Word sí; PDF no disponible", async () => {
    const fila = { ...BASE, signedDocuments: documentos(BASE.reportId, 1, "FAILED") };
    vi.stubGlobal("fetch", backend([fila]));
    pintarConQuery(<Informes />);
    await waitFor(() => expect(screen.getByText("33961795")).toBeDefined());

    expect(screen.getByRole("link", { name: "Descargar Word" })).toBeDefined();
    expect(screen.queryByRole("link", { name: "Descargar PDF" })).toBeNull();
    expect(screen.getByText("PDF no disponible")).toBeDefined();
  });

  it("C · PDF en proceso: Word sí; PDF en proceso", async () => {
    const fila = { ...BASE, signedDocuments: documentos(BASE.reportId, 1, "PROCESSING") };
    vi.stubGlobal("fetch", backend([fila]));
    pintarConQuery(<Informes />);
    await waitFor(() => expect(screen.getByText("33961795")).toBeDefined());

    expect(screen.getByRole("link", { name: "Descargar Word" })).toBeDefined();
    expect(screen.getByText("PDF en proceso")).toBeDefined();
  });

  it("F · con una corrección abierta, la fila es la versión nueva y descarga la firmada anterior", async () => {
    const anterior = "00000000-0000-4000-8000-0000000000e9";
    const fila = {
      ...BASE,
      version: 2,
      workflowStatus: "READY_FOR_REVIEW" as const,
      signedDocuments: documentos(anterior, 1, "READY"),
    };
    vi.stubGlobal("fetch", backend([fila]));
    pintarConQuery(<Informes />);
    await waitFor(() => expect(screen.getByText("33961795")).toBeDefined());

    for (const nombre of ["Descargar Word", "Descargar PDF"]) {
      const href = screen.getByRole("link", { name: nombre }).getAttribute("href") ?? "";
      expect(href).toContain(anterior);
      expect(href).not.toContain(BASE.reportId);
    }
  });

  it("nunca firmado: sin descargas finales", async () => {
    vi.stubGlobal("fetch", backend([{ ...INDETERMINADA, signedDocuments: null }]));
    pintarConQuery(<Informes />);
    await waitFor(() => expect(screen.getByText("34200001")).toBeDefined());
    expect(screen.queryByRole("link", { name: /Descargar (Word|PDF)/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Firmado" })).toBeNull();
  });
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
