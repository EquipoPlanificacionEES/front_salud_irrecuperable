import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  thresholdStatus: "MET" | "NOT_MET" | "INDETERMINATE" | null = "NOT_MET",
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
    thresholdStatus,
    hold: null,
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
  thresholdStatus?: Parameters<typeof informe>[2],
) {
  vi.stubGlobal("fetch", fetchDevolviendo(informe(capabilities, licenses, thresholdStatus)));
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

  /**
   * LOS BLOQUEADORES DE `readiness` NO SE LE ENSEÑAN AL MÉDICO.
   *
   * Esta prueba afirmaba lo contrario. Se invirtió al mirar qué dicen de verdad
   * esos bloqueadores en el lote entero: los dos únicos que existen son
   * «El análisis que sustenta el informe no está validado para producción» y
   * «La verificación transversal del modelo de vista (RPT-QA) encontró al menos
   * un hallazgo crítico». Son estado de ingeniería —uno nombra un componente
   * interno y su código— y no dicen nada del expediente que el médico tiene
   * delante. Lo que sí necesita saber, las limitaciones factuales de los
   * antecedentes, va dentro del informe, en la Sección IV.
   *
   * Que la restricción no se explique con jerga interna no significa dejarla
   * inexplicada: rectificar sigue ofrecido, que es la salida que le corresponde.
   */
  it("A · el bloqueador técnico NO se muestra, y rectificar se sigue ofreciendo", async () => {
    await pintar({ canRequestChanges: true, canApprove: false });

    expect(screen.queryByText(/no está validado para producción/)).toBeNull();
    expect(screen.queryByText(/RPT-QA/)).toBeNull();
    expect(screen.queryByText(/no está listo para finalizar/i)).toBeNull();
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

/**
 * UN CERO NO PUEDE HACER DE VEREDICTO.
 *
 * `countsForThreshold` vale false tanto cuando el umbral no se alcanza como
 * cuando no se puede determinar si se alcanza, así que contarlo en el navegador
 * no distingue las dos cosas. El expediente real: 73 licencias autorizadas con
 * el tipo sin determinar, `thresholdStatus: INDETERMINATE`, y en pantalla un
 * «Computables para el umbral: 0» que el médico lee como «no alcanza».
 */
describe("PantallaResultado · umbral contractual", () => {
  const AUTORIZADAS_SIN_TIPO = [
    licencia(1, "AUTORIZADA"),
    licencia(2, "AUTORIZADA"),
    licencia(3, "REDUCIDA"),
  ];

  it("INDETERMINATE: no muestra el cero aislado", async () => {
    await pintar(PUEDE_ACTUAR, AUTORIZADAS_SIN_TIPO, "INDETERMINATE");

    expect(screen.queryByText(/Computables para el umbral/i)).toBeNull();
  });

  it("INDETERMINATE: lo dice, y dice dónde consta el motivo", async () => {
    await pintar(PUEDE_ACTUAR, AUTORIZADAS_SIN_TIPO, "INDETERMINATE");

    expect(screen.getByText(/Umbral contractual/i)).toBeDefined();
    expect(screen.getByText(/no determinable/i)).toBeDefined();
    expect(screen.getByText(/limitaciones de la Secci[oó]n IV/i)).toBeDefined();
  });

  it("INDETERMINATE: el universo hallado se sigue viendo entero", async () => {
    await pintar(PUEDE_ACTUAR, AUTORIZADAS_SIN_TIPO, "INDETERMINATE");

    expect(screen.getByText(/Licencias encontradas en el expediente/i)).toBeDefined();
    expect(screen.getByText("Autorizadas:")).toBeDefined();
    expect(screen.getByText("Reducidas:")).toBeDefined();
  });

  it("NOT_MET conserva el recuento: el cero ahí sí es un dato", async () => {
    await pintar(PUEDE_ACTUAR, undefined, "NOT_MET");

    expect(screen.getByText(/Computables para el umbral/i)).toBeDefined();
    expect(screen.queryByText(/Umbral contractual/i)).toBeNull();
  });

  it("MET conserva el recuento", async () => {
    await pintar(PUEDE_ACTUAR, [licencia(1, "AUTORIZADA", true)], "MET");

    expect(screen.getByText(/Computables para el umbral/i)).toBeDefined();
    expect(screen.queryByText(/Umbral contractual/i)).toBeNull();
  });

  it("null (snapshot antiguo) se comporta como antes y no rompe", async () => {
    await pintar(PUEDE_ACTUAR, undefined, null);

    expect(screen.getByText(/Computables para el umbral/i)).toBeDefined();
  });
});


/**
 * EXPEDIENTE RETENIDO.
 *
 * El backend ya cierra las dos capacidades, así que los botones desaparecen
 * solos. Lo que estas pruebas defienden es que la ficha lo DIGA —una pantalla
 * sin botones y sin explicación se lee como un fallo— y que lo diga sin el
 * motivo interno: por qué está retenido es un asunto administrativo.
 */
describe("PantallaResultado · caso retenido", () => {
  const RETENIDO = {
    active: true as const,
    statement: "Este caso se encuentra temporalmente retenido para revisión administrativa.",
  };

  async function pintarRetenido() {
    const cuerpo = {
      ...informe({ canRequestChanges: false, canApprove: false }),
      hold: RETENIDO,
    };
    vi.stubGlobal("fetch", fetchDevolviendo(cuerpo));
    render(<PantallaResultado caseId="00000000-0000-4000-8000-0000000000ca" />);
    await waitFor(() => expect(screen.getByText(/Trámite 40252330/)).toBeDefined());
  }

  it("dice que está retenido", async () => {
    await pintarRetenido();
    expect(screen.getByText(/temporalmente retenido para revisión administrativa/i)).toBeDefined();
  });

  it("no ofrece ratificar ni corregir", async () => {
    await pintarRetenido();
    expect(screen.queryByRole("button", { name: RATIFICAR })).toBeNull();
    expect(screen.queryByRole("button", { name: RECTIFICAR })).toBeNull();
  });

  it("no enseña el motivo interno de la retención", async () => {
    await pintarRetenido();
    const t = document.body.textContent ?? "";
    expect(t).not.toContain("SOURCE_IDENTITY_CONFLICT");
    expect(t).not.toContain("DUPLICATE_SOURCE_DOCUMENT");
  });

  it("el informe se sigue leyendo entero: retenido no es invisible", async () => {
    await pintarRetenido();
    expect(screen.getByText(/Conclusión redactada para el expediente/)).toBeDefined();
    expect(screen.getByText(/Licencias encontradas en el expediente/i)).toBeDefined();
  });
});

/**
 * J · LA CORRECCIÓN VIAJA ESTRUCTURADA Y LA PANTALLA MUESTRA LA VERSIÓN NUEVA.
 *
 * Antes se serializaba la decisión dentro de `comments` y el backend no la
 * leía: la pantalla decía «Puedes ratificar el informe con este cambio» y
 * ratificar aprobaba el informe original. Dos expedientes reales se firmaron
 * con la conclusión contraria a la del médico.
 */
describe("PantallaResultado · corrección estructurada", () => {
  function respuestas(): Response[] {
    const base = informe({ canRequestChanges: true, canApprove: true });
    // La Sección V tiene que existir para que se dibujen las casillas editables.
    const v1 = {
      ...base,
      document: {
        ...base.document,
        sections: [
          ...base.document.sections,
          { id: "V", title: "V. PROPUESTA DE EVALUACIÓN DE SALUD", fields: [], paragraphs: [] },
        ],
      },
    };
    const v2 = {
      ...v1,
      version: 2,
      proposal: { recoverableChecked: false, irrecoverableChecked: true, unresolvedNote: null },
      document: {
        ...v1.document,
        sections: [
          {
            id: "IV",
            title: "IV. CONCLUSIÓN GENERAL",
            fields: [],
            paragraphs: ["Conclusión escrita por el profesional."],
          },
        ],
      },
    };
    const json = (b: unknown) =>
      new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    return [json(v1), json({ newReportSnapshotId: "nuevo", newVersion: 2 }), json(v2)];
  }

  it("manda assessment y conclusion en `correction`, no dentro del comentario", async () => {
    const cola = respuestas();
    const fetchMock = vi.fn(async (_u?: unknown, init?: unknown) => {
      void _u;
      void init;
      return cola.shift() as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PantallaResultado caseId="00000000-0000-4000-8000-0000000000ca" />);
    await waitFor(() => expect(screen.getByText(/Trámite 40252330/)).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: RECTIFICAR }));
    fireEvent.change(screen.getByPlaceholderText(/Redacta la conclusión general/), {
      target: { value: "Conclusión escrita por el profesional." },
    });
    // El médico cambia la propuesta: es el caso que motivó todo esto.
    // El primer radio es IRRECOVERABLE (ver el orden en la pantalla).
    fireEvent.click(screen.getAllByRole("radio")[0] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: /guardar corrección/i }));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
    const envio = fetchMock.mock.calls[1]?.[1] as { body: string } | undefined;
    if (!envio) throw new Error("no se registró la llamada de corrección");
    const cuerpo = JSON.parse(envio.body) as {
      comments: string;
      correction: { assessment: string; conclusion: string };
    };
    expect(cuerpo.correction.assessment).toBe("IRRECOVERABLE");
    expect(cuerpo.correction.conclusion).toBe("Conclusión escrita por el profesional.");
    // La decisión NO se serializa dentro del comentario.
    expect(cuerpo.comments).not.toMatch(/IV\. CONCLUSIÓN GENERAL:/);
    expect(cuerpo.comments).not.toMatch(/Salud irrecuperable/i);
  });

  it("después de guardar muestra la versión nueva, y no invita a ratificar la vieja", async () => {
    const cola = respuestas();
    vi.stubGlobal("fetch", vi.fn(async () => cola.shift() as Response));
    render(<PantallaResultado caseId="00000000-0000-4000-8000-0000000000ca" />);
    await waitFor(() => expect(screen.getByText(/Trámite 40252330/)).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: RECTIFICAR }));
    fireEvent.change(screen.getByPlaceholderText(/Redacta la conclusión general/), {
      target: { value: "Conclusión escrita por el profesional." },
    });
    fireEvent.click(screen.getByRole("button", { name: /guardar corrección/i }));

    await waitFor(() => expect(screen.getByText(/Versión 2/)).toBeDefined());
    expect(screen.getByText(/revísala antes de ratificar/i)).toBeDefined();
    expect(screen.queryByText(/Puedes ratificar el informe con este cambio/i)).toBeNull();
    expect(screen.getByText(/Conclusión escrita por el profesional/)).toBeDefined();
  });
});
