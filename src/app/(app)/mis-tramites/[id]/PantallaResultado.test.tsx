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
    canResolveAndApprove?: boolean;
    hasActiveSignature?: boolean;
    canDownloadSigned?: boolean;
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
    sourceDocument: { downloadUrl: "/api/v1/cases/00000000-0000-4000-8000-0000000000ca/source-document" },
    reviews: [],
    draftArtifact: { downloadUrl: "/api/v1/reports/x/download" },
    finalArtifact: null,
    capabilities: {
      hasActiveSignature: true,
      canResolveAndApprove: false,
      canDownloadSigned: false,
      ...capabilities,
    },
    licenses,
  };
}

/**
 * EL FORMULARIO LO DESCRIBE EL BACKEND, así que las pruebas lo sirven en vez de
 * inventarlo: es el mismo contrato que consume la pantalla en producción.
 */
const FORMULARIO = {
  reportSnapshotId: "00000000-0000-4000-8000-000000000001",
  version: 1,
  sections: [
    {
      id: "I",
      title: "I. IDENTIFICACIÓN DEL USUARIO",
      fields: [
        { key: "Nombre", label: "Nombre", kind: "TEXT", value: "PERSONA DE PRUEBA",
          editable: false, required: false, systemDetermined: true },
      ],
    },
    {
      id: "II",
      title: "II. ANTECEDENTES Y REVISIÓN DE LICENCIAS MÉDICAS",
      fields: [
        { key: "authorizedLicenseCount", label: "Total licencias autorizadas", kind: "INTEGER",
          value: "0", editable: true, required: false, systemDetermined: false },
        { key: "authorizedDaysKnown", label: "Total días autorizados", kind: "INTEGER",
          value: "0", editable: true, required: false, systemDetermined: false },
      ],
    },
    {
      id: "III",
      title: "III. ANÁLISIS DE ANTECEDENTES CLÍNICOS",
      fields: [
        { key: "clinicalAnalysis", label: "Análisis de antecedentes clínicos", kind: "LONG_TEXT",
          value: "", editable: true, required: false, systemDetermined: false },
      ],
    },
    {
      id: "IV",
      title: "IV. CONCLUSIÓN GENERAL",
      fields: [
        { key: "conclusion", label: "Conclusión general", kind: "LONG_TEXT",
          value: "", editable: true, required: true, systemDetermined: false },
      ],
    },
    {
      id: "V",
      title: "V. PROPUESTA DE EVALUACIÓN DE SALUD",
      fields: [
        { key: "assessment", label: "Evaluación", kind: "CHOICE", value: "",
          editable: true, required: true, systemDetermined: false,
          options: [
            { value: "RECOVERABLE", label: "SALUD RECUPERABLE" },
            { value: "IRRECOVERABLE", label: "SALUD IRRECUPERABLE" },
          ] },
      ],
    },
  ],
};

const json = (cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status: 200, headers: { "content-type": "application/json" } });

const fetchDevolviendo = (cuerpo: unknown) =>
  vi.fn(async (url: string) => json(String(url).includes("/manual-form") ? FORMULARIO : cuerpo));

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

/**
 * Abre el editor y ESPERA. El formulario lo describe el backend, así que
 * abrirlo es una llamada: sin esperarla, la prueba mira una pantalla que
 * todavía no existe.
 */
/** La llamada a un endpoint concreto, buscada por URL y no por su posición. */
function llamadaA(mock: { mock: { calls: unknown[][] } }, fragmento: string) {
  const call = mock.mock.calls.find((c) => String(c[0]).includes(fragmento));
  if (!call) throw new Error(`no se registró ninguna llamada a ${fragmento}`);
  return { url: String(call[0]), init: call[1] as { body: string } };
}

async function abrirEditor(nombre: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: nombre }));
  await waitFor(() => expect(screen.getByPlaceholderText(/Redacta la conclusión general/)).toBeDefined());
}

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

    await abrirEditor(RECTIFICAR);
    fireEvent.change(screen.getByPlaceholderText(/Redacta la conclusión general/), {
      target: { value: "Conclusión escrita por el profesional." },
    });
    // El médico cambia la propuesta: es el caso que motivó todo esto.
    // El primer radio es IRRECOVERABLE (ver el orden en la pantalla).
    fireEvent.click(screen.getAllByRole("radio")[0] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: /guardar corrección/i }));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(2));
    const cuerpo = JSON.parse(llamadaA(fetchMock, "/reviews").init.body) as {
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/manual-form") ? json(FORMULARIO) : (cola.shift() as Response),
      ),
    );
    render(<PantallaResultado caseId="00000000-0000-4000-8000-0000000000ca" />);
    await waitFor(() => expect(screen.getByText(/Trámite 40252330/)).toBeDefined());

    await abrirEditor(RECTIFICAR);
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

/**
 * EL EXPEDIENTE QUE EL SISTEMA NO PUDO CERRAR.
 *
 * Cinco expedientes reales llegaron sin propuesta: la tabla de licencias venía
 * en un formato que el motor no supo leer. El médico los abría y no tenía
 * ningún botón con el que pronunciarse.
 *
 * La corrección es de PRODUCTO: sigue habiendo tres acciones, las mismas y con
 * los mismos nombres, y la única diferencia visible es que el botón de los
 * antecedentes se ve más. Nada en pantalla habla de la máquina ni de lo que no
 * pudo hacer.
 */
const ANTECEDENTES = /ver antecedentes/i;

const SIN_PROPUESTA = { canRequestChanges: true, canApprove: false, canResolveAndApprove: true };

describe("PantallaResultado · resolver un informe sin propuesta", () => {
  it("se ofrecen las MISMAS tres acciones que en un informe con propuesta", async () => {
    await pintar(SIN_PROPUESTA);

    expect(screen.getByRole("link", { name: ANTECEDENTES })).toBeDefined();
    expect(screen.getByRole("button", { name: RECTIFICAR })).toBeDefined();
    expect(screen.getByRole("button", { name: RATIFICAR })).toBeDefined();
  });

  it("NO se le explica al médico que el sistema no concluyó", async () => {
    vi.stubGlobal("fetch", fetchDevolviendo(conSeccionV(informe(SIN_PROPUESTA))));
    render(<PantallaResultado caseId="00000000-0000-4000-8000-0000000000ca" />);
    await waitFor(() => expect(screen.getByText(/Trámite 40252330/)).toBeDefined());

    for (const prohibido of [
      /no pudo establecer/i, /revise manualmente/i, /información insuficiente/i,
      /evaluación manual/i, /inteligencia artificial/i, /\bIA\b/, /modelo/i,
      /orientación automática/i, /indeterminad/i,
    ]) {
      expect(screen.queryByText(prohibido), String(prohibido)).toBeNull();
    }
  });

  it("el botón de antecedentes se DESTACA, y sólo en este caso", async () => {
    await pintar(SIN_PROPUESTA);
    const destacado = screen.getByRole("link", { name: ANTECEDENTES }).className;

    cleanup();
    await pintar({ canRequestChanges: true, canApprove: true });
    const normal = screen.getByRole("link", { name: ANTECEDENTES }).className;

    expect(destacado).not.toBe(normal);
    // La diferencia es de énfasis, no de contenido: el texto no cambia.
    expect(screen.getByRole("link", { name: ANTECEDENTES }).textContent).toBe("Ver antecedentes");
  });

  it("los antecedentes apuntan al expediente del caso y se abren aparte", async () => {
    await pintar(SIN_PROPUESTA);
    const enlace = screen.getByRole("link", { name: ANTECEDENTES }) as HTMLAnchorElement;

    expect(enlace.getAttribute("href")).toContain("/source-document");
    expect(enlace.getAttribute("target")).toBe("_blank");
  });

  it("sin expediente almacenado no se ofrece el botón", async () => {
    const sin = { ...informe(SIN_PROPUESTA), sourceDocument: null };
    vi.stubGlobal("fetch", fetchDevolviendo(sin));
    render(<PantallaResultado caseId="00000000-0000-4000-8000-0000000000ca" />);
    await waitFor(() => expect(screen.getByText(/Trámite 40252330/)).toBeDefined());

    expect(screen.queryByRole("link", { name: ANTECEDENTES })).toBeNull();
  });

  it("ratificar abre el formulario de decisión en vez de firmar de inmediato", async () => {
    const fetchMock = fetchDevolviendo(conSeccionV(informe(SIN_PROPUESTA)));
    vi.stubGlobal("fetch", fetchMock);
    render(<PantallaResultado caseId="00000000-0000-4000-8000-0000000000ca" />);
    await waitFor(() => expect(screen.getByText(/Trámite 40252330/)).toBeDefined());
    const llamadasIniciales = fetchMock.mock.calls.length;

    await abrirEditor(RATIFICAR);

    // Sólo se pidió el formulario: no se ha mandado ninguna decisión.
    expect(fetchMock.mock.calls.length).toBe(llamadasIniciales + 1);
    expect(String(fetchMock.mock.calls[llamadasIniciales]?.[0])).toContain("/manual-form");
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("no se puede confirmar sin elegir una evaluación", async () => {
    vi.stubGlobal("fetch", fetchDevolviendo(conSeccionV(informe(SIN_PROPUESTA))));
    render(<PantallaResultado caseId="00000000-0000-4000-8000-0000000000ca" />);
    await waitFor(() => expect(screen.getByText(/Trámite 40252330/)).toBeDefined());

    await abrirEditor(RATIFICAR);
    fireEvent.change(screen.getByPlaceholderText(/Redacta la conclusión general/), {
      target: { value: "Conclusión escrita por el profesional." },
    });

    // Ninguna casilla viene premarcada: elegir es del médico.
    expect(screen.getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked)).toHaveLength(0);
    const confirmar = screen.getAllByRole("button", { name: RATIFICAR }).at(-1) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
  });

  it("tampoco sin conclusión, aun habiendo elegido evaluación", async () => {
    vi.stubGlobal("fetch", fetchDevolviendo(conSeccionV(informe(SIN_PROPUESTA))));
    render(<PantallaResultado caseId="00000000-0000-4000-8000-0000000000ca" />);
    await waitFor(() => expect(screen.getByText(/Trámite 40252330/)).toBeDefined());

    await abrirEditor(RATIFICAR);
    fireEvent.click(screen.getAllByRole("radio")[0] as HTMLElement);
    fireEvent.change(screen.getByPlaceholderText(/Redacta la conclusión general/), {
      target: { value: "   " },
    });

    const confirmar = screen.getAllByRole("button", { name: RATIFICAR }).at(-1) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
  });

  it("con las dos cosas, manda la decisión del médico al circuito de resolución", async () => {
    const fetchMock = fetchDevolviendo(conSeccionV(informe(SIN_PROPUESTA)));
    vi.stubGlobal("fetch", fetchMock);
    render(<PantallaResultado caseId="00000000-0000-4000-8000-0000000000ca" />);
    await waitFor(() => expect(screen.getByText(/Trámite 40252330/)).toBeDefined());

    await abrirEditor(RATIFICAR);
    fireEvent.change(screen.getByPlaceholderText(/Redacta la conclusión general/), {
      target: { value: "Conclusión escrita por el profesional." },
    });
    // El primer radio es IRRECOVERABLE (ver el orden en la pantalla).
    fireEvent.click(screen.getAllByRole("radio")[0] as HTMLElement);
    fireEvent.click(screen.getAllByRole("button", { name: RATIFICAR }).at(-1) as HTMLElement);

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(2));
    const { url, init } = llamadaA(fetchMock, "/resolve-and-approve");
    // NO se aprueba el informe sin pronunciamiento.
    expect(url).not.toMatch(/\/approve$/);
    const cuerpo = JSON.parse(init.body) as { assessment: string; conclusion: string };
    expect(cuerpo.assessment).toBe("IRRECOVERABLE");
    expect(cuerpo.conclusion).toBe("Conclusión escrita por el profesional.");
  });

  it("con propuesta formada, ratificar firma directamente: el camino normal no cambia", async () => {
    const fetchMock = fetchDevolviendo(informe({ canRequestChanges: true, canApprove: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PantallaResultado caseId="00000000-0000-4000-8000-0000000000ca" />);
    await waitFor(() => expect(screen.getByText(/Trámite 40252330/)).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: RATIFICAR }));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
    const segunda = fetchMock.mock.calls[1] as unknown as [string];
    expect(segunda[0]).toMatch(/\/approve$/);
  });

  it("con el expediente retenido no queda ninguna acción, y los antecedentes siguen a mano", async () => {
    const retenido = {
      ...informe({ canRequestChanges: false, canApprove: false, canResolveAndApprove: false }),
      hold: { active: true, statement: "Este caso se encuentra temporalmente retenido para revisión administrativa." },
    };
    vi.stubGlobal("fetch", fetchDevolviendo(retenido));
    render(<PantallaResultado caseId="00000000-0000-4000-8000-0000000000ca" />);
    await waitFor(() => expect(screen.getByText(/Trámite 40252330/)).toBeDefined());

    expect(screen.queryByRole("button", { name: RATIFICAR })).toBeNull();
    expect(screen.queryByRole("button", { name: RECTIFICAR })).toBeNull();
    expect(screen.getByRole("link", { name: ANTECEDENTES })).toBeDefined();
    expect(screen.getByText(/temporalmente retenido/)).toBeDefined();
  });
});

/**
 * El informe TAL COMO LLEGA cuando el sistema no concluyó: ninguna casilla
 * marcada y la Sección V presente, que es donde el médico elige.
 */
function conSeccionV(base: ReturnType<typeof informe>) {
  return {
    ...base,
    proposal: {
      recoverableChecked: false,
      irrecoverableChecked: false,
      unresolvedNote: "Sin selección representable: requiere pronunciamiento profesional.",
    },
    document: {
      ...base.document,
      sections: [
        ...base.document.sections,
        { id: "V", title: "V. PROPUESTA DE EVALUACIÓN DE SALUD", fields: [], paragraphs: [] },
      ],
    },
  };
}

/**
 * EN LA FICHA NO SE DESCARGA EL BORRADOR.
 *
 * El preinforme se lee entero en esa misma pantalla, así que ofrecer además
 * «Descargar PDF» y «Descargar preinforme (.docx)» era ofrecer lo mismo tres
 * veces — y dos de ellas en documentos que no son el del expediente. Lo que sí
 * se descarga es el informe FIRMADO, que es el que sale de la institución.
 *
 * El fixture SIGUE mandando `draftArtifact`, porque la API lo sigue mandando:
 * lo que se comprueba es que la pantalla no lo ofrezca aunque llegue.
 */
const DESCARGA_BORRADOR = /descargar (pdf|preinforme|borrador)/i;
const DESCARGA_FIRMADO = /descargar informe/i;

describe("PantallaResultado · descargas", () => {
  it("pendiente: antecedentes sí, borrador no, informe final tampoco", async () => {
    await pintar({ canRequestChanges: true, canApprove: true });

    expect(screen.getByRole("link", { name: ANTECEDENTES })).toBeDefined();
    expect(screen.queryByRole("button", { name: DESCARGA_BORRADOR })).toBeNull();
    expect(screen.queryByRole("link", { name: DESCARGA_BORRADOR })).toBeNull();
    expect(screen.queryByRole("link", { name: DESCARGA_FIRMADO })).toBeNull();
    // Y las acciones médicas siguen donde estaban.
    expect(screen.getByRole("button", { name: RECTIFICAR })).toBeDefined();
    expect(screen.getByRole("button", { name: RATIFICAR })).toBeDefined();
  });

  it("sin propuesta: mismas descargas, y los antecedentes destacados", async () => {
    await pintar(SIN_PROPUESTA);

    expect(screen.getByRole("link", { name: ANTECEDENTES })).toBeDefined();
    expect(screen.queryByRole("button", { name: DESCARGA_BORRADOR })).toBeNull();
    expect(screen.queryByRole("link", { name: DESCARGA_BORRADOR })).toBeNull();
    expect(screen.getByRole("button", { name: RATIFICAR })).toBeDefined();
    expect(screen.getByRole("button", { name: RECTIFICAR })).toBeDefined();
  });

  it("ratificado: aparece la descarga del informe firmado, y sigue sin haber borrador", async () => {
    const firmado = {
      ...informe({ canRequestChanges: false, canApprove: false, canDownloadSigned: true }),
      workflowStatus: "SIGNED",
      finalArtifact: { downloadUrl: "/api/v1/reports/x/signed-document?format=docx" },
    };
    vi.stubGlobal("fetch", fetchDevolviendo(firmado));
    render(<PantallaResultado caseId="00000000-0000-4000-8000-0000000000ca" />);
    await waitFor(() => expect(screen.getByText(/Trámite 40252330/)).toBeDefined());

    const enlace = screen.getByRole("link", { name: DESCARGA_FIRMADO }) as HTMLAnchorElement;
    expect(enlace.getAttribute("href")).toContain("/signed-document");
    expect(screen.queryByRole("button", { name: DESCARGA_BORRADOR })).toBeNull();
    expect(screen.queryByRole("link", { name: DESCARGA_BORRADOR })).toBeNull();
    // Los antecedentes siguen a mano, y sin destacar: no hay nada que resolver.
    const antecedentes = screen.getByRole("link", { name: ANTECEDENTES });
    expect(antecedentes).toBeDefined();
    expect(antecedentes.className).not.toContain("font-semibold");
  });

  it("con el artefacto presente pero sin la capacidad, NO se ofrece la descarga", async () => {
    // La autoridad es el backend: `canDownloadSigned` es la misma capacidad que
    // autoriza la descarga en el servidor, y un artefacto suelto no la sustituye.
    const raro = {
      ...informe({ canRequestChanges: false, canApprove: false, canDownloadSigned: false }),
      finalArtifact: { downloadUrl: "/api/v1/reports/x/signed-document?format=docx" },
    };
    vi.stubGlobal("fetch", fetchDevolviendo(raro));
    render(<PantallaResultado caseId="00000000-0000-4000-8000-0000000000ca" />);
    await waitFor(() => expect(screen.getByText(/Trámite 40252330/)).toBeDefined());

    expect(screen.queryByRole("link", { name: DESCARGA_FIRMADO })).toBeNull();
  });

  it("el enlace de antecedentes sigue saliendo de sourceDocument.downloadUrl", async () => {
    await pintar({ canRequestChanges: true, canApprove: true });
    const enlace = screen.getByRole("link", { name: ANTECEDENTES }) as HTMLAnchorElement;

    expect(enlace.getAttribute("href")).toBe(
      "/api/v1/cases/00000000-0000-4000-8000-0000000000ca/source-document",
    );
  });
});


/**
 * EL EXPEDIENTE RETENIDO QUE NO TIENE INFORME.
 *
 * Dos de los tres retenidos en producción fallaron el análisis y no tienen
 * ningún `ReportSnapshot`: pedir su informe responde 404. Antes eso era una
 * pantalla de error y, como además no aparecían en la bandeja, el médico no
 * tenía forma de saber que existían.
 */
describe("PantallaResultado · retenido sin informe", () => {
  const CASE_ID = "00000000-0000-4000-8000-0000000000ca";

  /** El informe responde 404 y la bandeja sí conoce el caso. */
  function backend(caso: Record<string, unknown> | null) {
    return vi.fn(async (url: string) => {
      if (url.includes("/report")) {
        return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "no" } }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ cases: caso ? [caso] : [], total: caso ? 1 : 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
  }

  const RETENIDO = {
    caseId: CASE_ID,
    externalCaseId: "33313853",
    classification: "HOLD",
    hold: {
      active: true,
      statement: "Este caso se encuentra temporalmente retenido para revisión administrativa.",
    },
    sourceDocument: { downloadUrl: `/api/v1/cases/${CASE_ID}/source-document` },
    report: null,
  };

  it("muestra el trámite, el estado y el motivo, sin inventar una ficha clínica", async () => {
    vi.stubGlobal("fetch", backend(RETENIDO));
    render(<PantallaResultado caseId={CASE_ID} />);
    await waitFor(() => expect(screen.getByText(/Trámite 33313853/)).toBeDefined());

    expect(screen.getByText("Retenido")).toBeDefined();
    expect(screen.getByText(/retenido para revisión administrativa/i)).toBeDefined();
    // Ni secciones, ni casillas, ni conclusión: no hay informe que mostrar.
    expect(screen.queryByText(/CONCLUSIÓN GENERAL/i)).toBeNull();
    expect(screen.queryByText(/PROPUESTA DE EVALUACIÓN/i)).toBeNull();
  });

  it("ofrece los antecedentes, que es lo único accionable", async () => {
    vi.stubGlobal("fetch", backend(RETENIDO));
    render(<PantallaResultado caseId={CASE_ID} />);
    await waitFor(() => expect(screen.getByText(/Trámite 33313853/)).toBeDefined());

    const enlace = screen.getByRole("link", { name: /ver antecedentes/i }) as HTMLAnchorElement;
    expect(enlace.getAttribute("href")).toContain("/source-document");
    expect(enlace.getAttribute("target")).toBe("_blank");
  });

  it("no ofrece ninguna acción médica", async () => {
    vi.stubGlobal("fetch", backend(RETENIDO));
    render(<PantallaResultado caseId={CASE_ID} />);
    await waitFor(() => expect(screen.getByText(/Trámite 33313853/)).toBeDefined());

    expect(screen.queryByRole("button", { name: RATIFICAR })).toBeNull();
    expect(screen.queryByRole("button", { name: RECTIFICAR })).toBeNull();
  });

  it("no habla de la máquina ni de por qué no se pudo analizar", async () => {
    vi.stubGlobal("fetch", backend(RETENIDO));
    render(<PantallaResultado caseId={CASE_ID} />);
    await waitFor(() => expect(screen.getByText(/Trámite 33313853/)).toBeDefined());

    for (const prohibido of [/\bIA\b/, /inteligencia artificial/i, /análisis fall/i, /error/i]) {
      expect(screen.queryByText(prohibido), String(prohibido)).toBeNull();
    }
  });

  it("si el caso NO es suyo, sigue siendo un error y no una ficha vacía", async () => {
    vi.stubGlobal("fetch", backend(null));
    render(<PantallaResultado caseId={CASE_ID} />);
    await waitFor(() => expect(screen.getByText(/todavía no tiene preinforme/i)).toBeDefined());

    expect(screen.queryByText(/Trámite/)).toBeNull();
  });
});


/**
 * EL FORMULARIO ESTRUCTURADO.
 *
 * No es un editor de Word ni una plantilla nueva: son los MISMOS campos que ya
 * imprime el informe. El backend dice cuáles se ofrecen, cuáles no pudo
 * establecer y cuáles son obligatorios; aquí no se inventa ninguna regla.
 */
describe("PantallaResultado · formulario estructurado", () => {
  /** El informe con las cinco secciones, que es donde viven los editores. */
  function conTodasLasSecciones(base: ReturnType<typeof informe>) {
    return {
      ...base,
      proposal: { recoverableChecked: false, irrecoverableChecked: false, unresolvedNote: null },
      document: {
        ...base.document,
        sections: [
          { id: "I", title: "I. IDENTIFICACIÓN DEL USUARIO", fields: [], paragraphs: [] },
          ...base.document.sections,
          { id: "III", title: "III. ANÁLISIS DE ANTECEDENTES CLÍNICOS", fields: [], paragraphs: [] },
          { id: "V", title: "V. PROPUESTA DE EVALUACIÓN DE SALUD", fields: [], paragraphs: [] },
        ],
      },
    };
  }

  async function abrirFormulario(capacidades = SIN_PROPUESTA) {
    const fetchMock = fetchDevolviendo(conTodasLasSecciones(informe(capacidades)));
    vi.stubGlobal("fetch", fetchMock);
    render(<PantallaResultado caseId="00000000-0000-4000-8000-0000000000ca" />);
    await waitFor(() => expect(screen.getByText(/Trámite 40252330/)).toBeDefined());
    await abrirEditor(RATIFICAR);
    return fetchMock;
  }

  it("ofrece las cifras que manda el backend, y señala las que hay que completar", async () => {
    await abrirFormulario();

    expect(screen.getByText("Total licencias autorizadas")).toBeDefined();
    expect(screen.getByText("Total días autorizados")).toBeDefined();
    // Dos cifras que el sistema no pudo establecer → dos avisos.
    expect(screen.getAllByText(/por completar/i)).toHaveLength(2);
  });

  it("la identificación no se puede editar desde el formulario", async () => {
    await abrirFormulario();

    // La Sección I se muestra en modo lectura, sin ningún control.
    const seccion = screen.getByText(/I\. IDENTIFICACIÓN DEL USUARIO/).closest("section");
    expect(seccion?.querySelector("input")).toBeNull();
    expect(seccion?.querySelector("textarea")).toBeNull();
  });

  it("permite escribir el análisis clínico de la Sección III", async () => {
    await abrirFormulario();

    expect(screen.getByPlaceholderText(/Análisis de los antecedentes clínicos/)).toBeDefined();
  });

  it("manda sólo las cifras que el médico cambió", async () => {
    const fetchMock = await abrirFormulario();

    fireEvent.change(screen.getByPlaceholderText(/Redacta la conclusión general/), {
      target: { value: "Conclusión del profesional." },
    });
    fireEvent.click(screen.getAllByRole("radio")[0] as HTMLElement);
    // Sólo una de las dos cifras.
    const dias = screen.getByText("Total días autorizados").closest("label")?.querySelector("input");
    fireEvent.change(dias as HTMLElement, { target: { value: "764" } });
    fireEvent.click(screen.getAllByRole("button", { name: RATIFICAR }).at(-1) as HTMLElement);

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(2));
    const cuerpo = JSON.parse(llamadaA(fetchMock, "/resolve-and-approve").init.body) as {
      figures?: Record<string, number>;
      conclusion: string;
      assessment: string;
    };
    // La que no tocó NO viaja: un campo intacto no es un cero.
    expect(cuerpo.figures).toEqual({ authorizedDaysKnown: 764 });
    expect(cuerpo.assessment).toBe("IRRECOVERABLE");
    expect(cuerpo.conclusion).toBe("Conclusión del profesional.");
  });

  it("sin tocar ninguna cifra, no manda el bloque de cifras", async () => {
    const fetchMock = await abrirFormulario();

    fireEvent.change(screen.getByPlaceholderText(/Redacta la conclusión general/), {
      target: { value: "Conclusión del profesional." },
    });
    fireEvent.click(screen.getAllByRole("radio")[0] as HTMLElement);
    fireEvent.click(screen.getAllByRole("button", { name: RATIFICAR }).at(-1) as HTMLElement);

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(2));
    const cuerpo = JSON.parse(llamadaA(fetchMock, "/resolve-and-approve").init.body) as {
      figures?: Record<string, number>;
      clinicalAnalysis?: string;
    };
    expect(cuerpo.figures).toBeUndefined();
    expect(cuerpo.clinicalAnalysis).toBeUndefined();
  });

  it("«Corregir» abre EL MISMO formulario: no hay dos", async () => {
    const fetchMock = fetchDevolviendo(conTodasLasSecciones(informe(SIN_PROPUESTA)));
    vi.stubGlobal("fetch", fetchMock);
    render(<PantallaResultado caseId="00000000-0000-4000-8000-0000000000ca" />);
    await waitFor(() => expect(screen.getByText(/Trámite 40252330/)).toBeDefined());

    await abrirEditor(RECTIFICAR);

    expect(screen.getByText("Total licencias autorizadas")).toBeDefined();
    expect(screen.getByPlaceholderText(/Análisis de los antecedentes clínicos/)).toBeDefined();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });
});
