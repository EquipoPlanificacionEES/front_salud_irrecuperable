import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { PantallaResultado } from "./PantallaResultado";

/**
 * RECTIFICAR SE MUESTRA POR `canRequestChanges` Y POR NADA MÁS.
 *
 * Estas pruebas congelan la regla de negocio, no la maquetación. El caso real
 * que las motiva llegó a producción así:
 *
 *   workflowStatus: READY_FOR_REVIEW
 *   readiness:      NOT_READY (CASE_ANALYSIS_NOT_VALIDATED)
 *   capabilities:   canRequestChanges = true, canApprove = false
 *
 * Es decir: el backend autorizaba la rectificación y el médico no la tenía a
 * mano. Un bloqueador clínico, una orientación que exige revisión humana o un
 * informe que no se puede aprobar son EXACTAMENTE las situaciones en que hay
 * algo que rectificar; ninguna de ellas puede esconder la acción.
 */

const RECTIFICAR = /no estoy de acuerdo, corregir/i;
const RATIFICAR = /^ratificar$/i;

function informe(capabilities: {
  canRequestChanges: boolean;
  canApprove: boolean;
  hasActiveSignature?: boolean;
}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    caseReference: "40252330",
    version: 1,
    createdAt: "2026-09-04T19:38:12.155Z",
    workflowStatus: "READY_FOR_REVIEW",
    sections: [
      {
        id: "IV",
        title: "IV. CONCLUSIÓN GENERAL",
        narrative: "Conclusión de prueba.",
        fields: [],
        items: [],
      },
    ],
    document: {
      documentKind: "PRE_REPORT",
      branding: {
        documentTitle: "PROPUESTA DE EVALUACIÓN TSI",
        institutionalHeading: "Evaluación de Salud Irrecuperable",
        institutionalSubheading: "del funcionario público",
        footerText: "Pie de prueba",
      },
      caseReference: "40252330",
      sections: [],
      proposal: { options: [], note: null },
      draftNotice: null,
    },
    proposal: { recoverableChecked: true, irrecoverableChecked: false, unresolvedNote: null },
    // EL PEOR ESCENARIO A PROPÓSITO: el análisis que sustenta el informe no está
    // validado. Es el estado del caso piloto real.
    readiness: {
      status: "NOT_READY",
      blockers: [
        {
          code: "CASE_ANALYSIS_NOT_VALIDATED",
          statement: "El análisis que sustenta el informe no está validado para producción.",
        },
      ],
    },
    reviews: [],
    draftArtifact: { downloadUrl: "/api/v1/reports/x/download" },
    finalArtifact: null,
    capabilities: { hasActiveSignature: true, ...capabilities },
    licenses: [],
  };
}

const fetchDevolviendo = (cuerpo: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { "content-type": "application/json" },
  }));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchDevolviendo(informe({ canRequestChanges: true, canApprove: false })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function pintar(capabilities: Parameters<typeof informe>[0]) {
  vi.stubGlobal("fetch", fetchDevolviendo(informe(capabilities)));
  render(<PantallaResultado caseId="00000000-0000-4000-8000-0000000000ca" />);
  await waitFor(() => expect(screen.getByText(/Trámite 40252330/)).toBeDefined());
}

describe("PantallaResultado · acción de rectificar", () => {
  it("A · canRequestChanges sin canApprove: rectificar visible, ratificar no disponible", async () => {
    await pintar({ canRequestChanges: true, canApprove: false });

    expect(screen.getByRole("button", { name: RECTIFICAR })).toBeDefined();
    expect(screen.queryByRole("button", { name: RATIFICAR })).toBeNull();
  });

  it("A · y el bloqueador clínico se sigue mostrando: informar no es impedir", async () => {
    await pintar({ canRequestChanges: true, canApprove: false });

    expect(screen.getByText(/no está validado para producción/)).toBeDefined();
    expect(screen.getByRole("button", { name: RECTIFICAR })).toBeDefined();
  });

  it("B · con las dos capacidades, se ofrecen las dos acciones", async () => {
    await pintar({ canRequestChanges: true, canApprove: true });

    expect(screen.getByRole("button", { name: RECTIFICAR })).toBeDefined();
    expect(screen.getByRole("button", { name: RATIFICAR })).toBeDefined();
  });

  it("C · sin canRequestChanges, la acción NO se ofrece", async () => {
    await pintar({ canRequestChanges: false, canApprove: false });

    expect(screen.queryByRole("button", { name: RECTIFICAR })).toBeNull();
  });

  it("C · tampoco cuando sólo se puede aprobar: cada botón responde a SU capacidad", async () => {
    await pintar({ canRequestChanges: false, canApprove: true });

    expect(screen.queryByRole("button", { name: RECTIFICAR })).toBeNull();
    expect(screen.getByRole("button", { name: RATIFICAR })).toBeDefined();
  });

  it("la barra de acciones NO queda al final del documento, fuera de la vista", async () => {
    // El botón estaba renderizado y no se veía: `sticky bottom-4` sobre el
    // último hijo del contenedor sólo se sostiene mientras ese contenedor está
    // a la vista, y era la última cosa de una página de varias pantallas.
    await pintar({ canRequestChanges: true, canApprove: false });

    const barra = screen.getByRole("button", { name: RECTIFICAR }).closest("div.fixed");
    expect(barra).not.toBeNull();
  });
});
