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

/** Licencia sintética. Sin datos de ninguna persona real. */
function licencia(n: number, effectiveState: string, countsForThreshold = false) {
  return {
    folio: `9000${n}`,
    cie10: "F32.1",
    startsOn: "2024-03-01",
    endsOn: "2024-03-10",
    authorizedDays: countsForThreshold ? 10 : 0,
    authorizedDaysKnown: true,
    effectiveState,
    includedInPeriod: true,
    countsForThreshold,
  };
}

/**
 * 77 licencias, TODAS con el estado administrativo sin determinar. Es la forma
 * del expediente real que destapó el defecto: la pantalla resumía «Total
 * licencias evaluadas (autorizadas): 0 · Total días: 0» y las 77 no aparecían
 * por ninguna parte.
 */
const SETENTA_Y_SIETE_INDETERMINADAS = Array.from({ length: 77 }, (_, i) =>
  licencia(i, "INDETERMINADO"),
);

function informe(
  capabilities: {
    canRequestChanges: boolean;
    canApprove: boolean;
    hasActiveSignature?: boolean;
  },
  licenses: ReturnType<typeof licencia>[] = SETENTA_Y_SIETE_INDETERMINADAS,
) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    caseReference: "40252330",
    version: 1,
    createdAt: "2026-09-04T19:38:12.155Z",
    workflowStatus: "READY_FOR_REVIEW",
    // EL VOLCADO INTERNO, TAL COMO LO MANDA LA API. Va sucio a propósito, con
    // las cuatro clases de contenido que se colaron a la pantalla del médico en
    // expedientes reales. Ninguna puede aparecer.
    sections: [
      {
        id: "II",
        title: "II. ANTECEDENTES Y REVISIÓN DE LICENCIAS MÉDICAS",
        narrative: "",
        fields: [{ label: "Criterio de período", value: "CLIENT_CONFIRMED" }],
        items: [],
      },
      {
        id: "IV",
        title: "IV. CONCLUSIÓN GENERAL",
        narrative: "[REC-2] Tratamiento activo. [NOR-3] Reintegro vigente.",
        fields: [],
        items: [
          "Verificar que la falta de evidencia no obedezca a un expediente incompleto.",
          "Ninguna cantidad de indicadores reemplaza el juicio profesional.",
        ],
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
      sections: [
        {
          id: "II",
          title: "II. ANTECEDENTES Y REVISIÓN DE LICENCIAS MÉDICAS",
          fields: [
            { label: "Total licencias autorizadas", value: "0" },
            { label: "Total días autorizados", value: "0 días" },
          ],
          paragraphs: [],
        },
        {
          id: "IV",
          title: "IV. CONCLUSIÓN GENERAL",
          fields: [],
          paragraphs: ["Conclusión redactada para el expediente."],
        },
      ],
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
    licenses,
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

async function pintar(
  capabilities: Parameters<typeof informe>[0],
  licenses?: Parameters<typeof informe>[1],
) {
  vi.stubGlobal("fetch", fetchDevolviendo(informe(capabilities, licenses)));
  render(<PantallaResultado caseId="00000000-0000-4000-8000-0000000000ca" />);
  await waitFor(() => expect(screen.getByText(/Trámite 40252330/)).toBeDefined());
}

const PUEDE_ACTUAR = { canRequestChanges: true, canApprove: false };

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

/**
 * LA PANTALLA DEL MÉDICO SE COMPONE DESDE `document` Y NO DESDE `sections`.
 *
 * `sections` es el volcado interno del snapshot y la API lo sigue enviando: lo
 * necesitan administración, auditoría y QA. Lo que no puede es llegar a quien
 * firma. Estas pruebas mandan un `sections` DELIBERADAMENTE SUCIO y comprueban
 * que ni una sola de sus cuatro clases de contenido aparece en pantalla,
 * mientras el texto de `document` sí está.
 *
 * Es exactamente lo que se leyó sobre expedientes reales antes de la
 * corrección; el PDF ya se componía bien desde `document` y la pantalla no.
 */
describe("PantallaResultado · el médico sólo ve la proyección client-facing", () => {
  it("no muestra el criterio de período ni su token de política", async () => {
    await pintar(PUEDE_ACTUAR);

    expect(screen.queryByText(/Criterio de período/i)).toBeNull();
    expect(screen.queryByText(/CLIENT_CONFIRMED/)).toBeNull();
    expect(screen.queryByText(/Confirmado por el cliente/i)).toBeNull();
  });

  it("no muestra códigos de indicador [REC-*] ni [NOR-*]", async () => {
    await pintar(PUEDE_ACTUAR);

    expect(screen.queryByText(/\[REC-\d+\]/)).toBeNull();
    expect(screen.queryByText(/\[NOR-\d+\]/)).toBeNull();
  });

  it("no muestra la guía dirigida al revisor ni los guardarraíles del motor", async () => {
    await pintar(PUEDE_ACTUAR);

    expect(screen.queryByText(/Verificar que la falta de evidencia/i)).toBeNull();
    expect(screen.queryByText(/Ninguna cantidad de indicadores/i)).toBeNull();
  });

  it("sí muestra la conclusión redactada que viene en `document`", async () => {
    await pintar(PUEDE_ACTUAR);

    expect(screen.getByText(/Conclusión redactada para el expediente/)).toBeDefined();
  });
});

/**
 * CERO LICENCIAS COMPUTABLES NO ES CERO LICENCIAS ENCONTRADAS.
 *
 * El expediente de la prueba trae 77 licencias y ninguna computa. La pantalla
 * anterior resumía «Total licencias evaluadas (autorizadas): 0 · Total días: 0»
 * y las 77 desaparecían: el médico leía un expediente vacío que no lo estaba.
 */
describe("PantallaResultado · universo de licencias", () => {
  it("dice cuántas licencias trae el expediente, computen o no", async () => {
    await pintar(PUEDE_ACTUAR);

    expect(screen.getByText(/Licencias encontradas en el expediente/i)).toBeDefined();
    expect(screen.getAllByText("77").length).toBeGreaterThan(0);
  });

  it("nombra el estado que impide computarlas en vez de callarlas", async () => {
    await pintar(PUEDE_ACTUAR);

    expect(screen.getByText(/Estado no determinable/i)).toBeDefined();
    expect(screen.getByText(/Computables para el umbral/i)).toBeDefined();
  });

  it("conserva los totales oficiales del backend junto al universo", async () => {
    await pintar(PUEDE_ACTUAR);

    expect(screen.getByText(/Total licencias autorizadas/i)).toBeDefined();
    expect(screen.getByText(/Total días autorizados/i)).toBeDefined();
  });

  it("tampoco pierde los estados que no son ni autorizada ni rechazada", async () => {
    // REDUCIDA existe en expedientes reales y el dominio SÍ suma sus días. El
    // censo anterior sólo conocía dos cubos y las descartaba en silencio.
    await pintar(PUEDE_ACTUAR, [
      licencia(1, "AUTORIZADA", true),
      licencia(2, "REDUCIDA", true),
      licencia(3, "REDUCIDA", true),
      licencia(4, "RECHAZADA"),
    ]);

    // "Autorizadas" aparece además en el total oficial del documento, así que
    // se cuentan las apariciones en vez de exigir una sola.
    expect(screen.getByText("Reducidas:")).toBeDefined();
    expect(screen.getByText("Rechazadas:")).toBeDefined();
    expect(screen.getByText("Autorizadas:")).toBeDefined();
  });
});
