import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { pintarConQuery } from "@/test/utils";
import { Bandeja } from "./Bandeja";
import type { CaseClassification, OperationalCase } from "@/lib/backend";

/**
 * NINGÚN EXPEDIENTE ASIGNADO PUEDE QUEDARSE FUERA DE LA BANDEJA.
 *
 * El caso real: el médico tenía 93 asignados y su bandeja mostraba 90. Los tres
 * que faltaban estaban retenidos, y el backend los retiraba de la lista sin
 * decirlo. Él veía 5 + 85 y el panel del administrador decía 93, sin ninguna
 * forma de averiguar dónde estaban los otros tres.
 *
 * Estas pruebas congelan la propiedad, no la maquetación: las tres pestañas
 * suman siempre lo que el backend devuelve.
 *
 * Sin PII: ningún nombre, RUT ni diagnóstico.
 */
function caso(
  externalCaseId: string,
  classification: CaseClassification,
  opciones: { conInforme?: boolean; retenido?: boolean; qa?: OperationalCase["qa"] } = {},
): OperationalCase {
  const conInforme = opciones.conInforme ?? classification !== "NO_REPORT";
  return {
    caseId: `00000000-0000-4000-8000-${externalCaseId.padStart(12, "0")}`,
    scope: { contractCode: "INT_36", contractName: "Evaluaciones de salud irrecuperable · COMPIN Valparaíso", regionCode: "VALPARAISO", regionName: "Región de Valparaíso" },
    externalCaseId,
    previousExternalCaseId: null,
    classification,
    hold: opciones.retenido ?? classification === "HOLD"
      ? { active: true, statement: "Este caso se encuentra temporalmente retenido para revisión administrativa." }
      : null,
    sourceDocument: { downloadUrl: `/api/v1/cases/x-${externalCaseId}/source-document` },
    status: "ANALYZED",
    statusChangedAt: "2026-09-01T10:00:00.000Z",
    discoveredAt: "2026-09-01T09:00:00.000Z",
    failureClass: null,
    analysisAttempts: 1,
    batch: { id: "b1", name: "Semana 8", sequence: 8 },
    assignment: {
      doctorProfileId: "d1",
      fullName: "Profesional",
      professionalCode: "SIS-1",
      assignedAt: "2026-09-01T10:00:00.000Z",
      assignmentRunId: null,
    },
    report: conInforme
      ? {
          reportId: `r-${externalCaseId}`,
          version: 1,
          workflowStatus: classification === "SIGNED" ? "SIGNED" : "READY_FOR_REVIEW",
          readinessStatus: "READY",
          orientationAssessment: "INDETERMINATE",
          signedAt: null,
        }
      : null,
    ...(opciones.qa === undefined ? {} : { qa: opciones.qa }),
  };
}

/** La forma REAL de la semana 8: 5 pendientes, 3 retenidos, 85 firmados. */
const SEMANA_8: OperationalCase[] = [
  ...["32856808", "32977912", "33308996", "33309087", "33441193"].map((r) =>
    caso(r, "PENDING_REVIEW"),
  ),
  // Uno retenido CON informe y dos sin informe: los tres van a la misma pestaña.
  caso("32895245", "HOLD"),
  caso("33313853", "HOLD", { conInforme: false }),
  caso("34218380", "HOLD", { conInforme: false }),
  ...Array.from({ length: 85 }, (_, i) => caso(`9${String(i).padStart(6, "0")}`, "SIGNED")),
];

const responde = (cases: OperationalCase[]) =>
  vi.fn(async () =>
    new Response(JSON.stringify({ cases, total: cases.length }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

async function pintar(cases: OperationalCase[]) {
  vi.stubGlobal("fetch", responde(cases));
  pintarConQuery(<Bandeja />);
  await waitFor(() => expect(screen.getByRole("button", { name: /pendientes/i })).toBeDefined());
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal("fetch", responde([]));
});

describe("Bandeja · las tres pestañas cubren todo lo asignado", () => {
  it("reparte la semana 8 en 5 pendientes, 3 retenidos y 85 en histórico", async () => {
    await pintar(SEMANA_8);

    expect(screen.getByRole("button", { name: /pendientes \(5\)/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /retenidos \(3\)/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /histórico \(85\)/i })).toBeDefined();
  });

  it("las tres pestañas suman exactamente lo que devuelve el backend", async () => {
    await pintar(SEMANA_8);
    const leer = (patron: RegExp) => {
      const texto = screen.getByRole("button", { name: patron }).textContent ?? "";
      return Number(/\((\d+)\)/.exec(texto)?.[1] ?? -1);
    };

    const suma = leer(/pendientes/i) + leer(/retenidos/i) + leer(/histórico/i);
    expect(suma).toBe(SEMANA_8.length);
  });

  it("un expediente retenido aparece en Retenidos y NO entre los pendientes", async () => {
    await pintar(SEMANA_8);

    expect(screen.queryByText("32895245")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /retenidos/i }));

    for (const ref of ["32895245", "33313853", "34218380"]) {
      expect(screen.getByText(ref), ref).toBeDefined();
    }
  });

  it("un retenido SIN informe se puede abrir igual: no se queda sin camino", async () => {
    await pintar(SEMANA_8);
    fireEvent.click(screen.getByRole("button", { name: /retenidos/i }));

    const sinInforme = SEMANA_8.find((c) => c.externalCaseId === "33313853");
    if (!sinInforme) throw new Error("falta el caso del escenario");
    const fila = screen.getByText("33313853").closest("tr");
    const enlace = fila?.querySelector("a");
    // Antes decía «sin preinforme» y no había enlace: el único expediente que
    // el médico no podía ni abrir era justo el que menos entendía.
    expect(enlace?.getAttribute("href")).toBe(`/mis-tramites/${sinInforme.caseId}`);
  });

  it("la pestaña de retenidos NO aparece cuando no hay ninguno", async () => {
    await pintar([caso("1", "PENDING_REVIEW"), caso("2", "SIGNED")]);

    expect(screen.queryByRole("button", { name: /retenidos/i })).toBeNull();
    expect(screen.getByRole("button", { name: /pendientes \(1\)/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /histórico \(1\)/i })).toBeDefined();
  });

  it("una firma fallida sigue entre los pendientes: no se archiva como cerrada", async () => {
    await pintar([caso("1", "SIGNING_FAILED"), caso("2", "SIGNED")]);

    expect(screen.getByRole("button", { name: /pendientes \(1\)/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /histórico \(1\)/i })).toBeDefined();
  });

  it("un expediente sin informe está entre los pendientes, no en el histórico", async () => {
    await pintar([caso("1", "NO_REPORT", { conInforme: false })]);

    expect(screen.getByRole("button", { name: /pendientes \(1\)/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /histórico \(0\)/i })).toBeDefined();
  });

  it("«esperan tu pronunciamiento» cuenta sólo los que de verdad lo esperan", async () => {
    // Ni los retenidos, ni los que están firmándose, ni los que fallaron.
    await pintar([
      caso("1", "PENDING_REVIEW"),
      caso("2", "HOLD"),
      caso("3", "SIGNING"),
      caso("4", "SIGNING_FAILED"),
    ]);

    expect(screen.getByText(/1 esperan tu pronunciamiento/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /pendientes \(3\)/i })).toBeDefined();
  });

  it("el chip de un retenido dice Retenido, y no el estado de su informe", async () => {
    await pintar([caso("1", "HOLD")]);
    fireEvent.click(screen.getByRole("button", { name: /retenidos/i }));

    expect(screen.getByText("Retenido")).toBeDefined();
    expect(screen.queryByText("Por revisar")).toBeNull();
  });
});

/**
 * UN MÉDICO QUE TRABAJA DOS CONTRATOS.
 *
 * Su bandeja los trae juntos —lo que le autoriza a ver un expediente es que se
 * le haya asignado, no dónde esté mirando—, así que la pantalla tiene que
 * separarlos sin esconder ninguno.
 */
describe("bandeja de un médico con dos ámbitos", () => {
  const enOtraRegion = (externalCaseId: string): OperationalCase => ({
    ...caso(externalCaseId, "PENDING_REVIEW"),
    scope: { contractCode: "OTRO_CONTRATO", contractName: "Evaluaciones de salud irrecuperable · COMPIN Tarapacá", regionCode: "TARAPACA", regionName: "Región de Tarapacá" },
  });

  const mezcla = [
    caso("11111111", "PENDING_REVIEW"),
    caso("22222222", "PENDING_REVIEW"),
    enOtraRegion("33333333"),
  ];

  it("cada fila dice de qué ámbito es", async () => {
    await pintar(mezcla);
    expect(screen.getAllByText("Región de Valparaíso")).toHaveLength(2);
    expect(screen.getAllByText("Región de Tarapacá")).toHaveLength(1);
  });

  it("el selector cuenta por ámbito y filtra, sin volver a pedir nada", async () => {
    await pintar(mezcla);
    const llamadasAntes = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /Región de Tarapacá \(1\)/ }));
    await waitFor(() => expect(screen.getByText("33333333")).toBeDefined());
    expect(screen.queryByText("11111111")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Todas \(3\)/ }));
    await waitFor(() => expect(screen.getByText("11111111")).toBeDefined());
    expect(screen.getByText("33333333")).toBeDefined();

    // Cambiar de ámbito es filtrar lo que ya se trajo: ni una petición más.
    expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(llamadasAntes);
  });

  it("con UN solo ámbito no aparece el selector: no habría nada que separar", async () => {
    await pintar([caso("11111111", "PENDING_REVIEW")]);
    expect(screen.queryByRole("button", { name: /^Todas/ })).toBeNull();
  });
});

/**
 * LA BANDEJA ES DEL MÉDICO, NO DEL ÁMBITO ACTIVO.
 *
 * Lo que autoriza a un profesional a ver un expediente es que se le haya
 * ASIGNADO; el selector de la cabecera describe dónde está mirando, no qué le
 * pertenece. Filtrando por él, quien lleva dos contratos veía la mitad de su
 * trabajo y tenía que acordarse de cambiar de ámbito para encontrar el resto.
 */
describe("bandeja global de un médico con dos ámbitos", () => {
  const enOtro = (externalCaseId: string, clasificacion: CaseClassification = "PENDING_REVIEW"): OperationalCase => ({
    ...caso(externalCaseId, clasificacion),
    scope: {
      contractCode: "OTRO_CONTRATO",
      contractName: "Evaluaciones de salud irrecuperable · COMPIN Tarapacá",
      regionCode: "TARAPACA",
      regionName: "Región de Tarapacá",
    },
  });

  const mezcla = [
    caso("11111111", "PENDING_REVIEW"),
    caso("22222222", "PENDING_REVIEW"),
    caso("44444444", "SIGNED"),
    enOtro("33333333"),
    enOtro("55555555", "SIGNED"),
  ];

  it("por defecto trae TODOS sus casos, de los dos ámbitos", async () => {
    await pintar(mezcla);
    // Pendientes de los dos contratos, sin tocar ningún selector.
    expect(screen.getByText("11111111")).toBeDefined();
    expect(screen.getByText("33333333")).toBeDefined();
    expect(screen.getByRole("button", { name: /Todas \(5\)/ })).toBeDefined();
  });

  it("la pestaña de cada ámbito filtra, y sus cuentas salen de SUS casos", async () => {
    await pintar(mezcla);
    expect(screen.getByRole("button", { name: /Región de Valparaíso \(3\)/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Región de Tarapacá \(2\)/ })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Región de Tarapacá \(2\)/ }));
    await waitFor(() => expect(screen.getByText("33333333")).toBeDefined());
    expect(screen.queryByText("11111111")).toBeNull();
  });

  it("se combina con Pendientes e Histórico, y los contadores acompañan", async () => {
    await pintar(mezcla);
    // Todos: 3 pendientes (dos de Valparaíso, uno de Tarapacá) y 2 firmados.
    expect(screen.getByRole("button", { name: /Pendientes \(3\)/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Histórico \(2\)/ })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Región de Tarapacá/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Pendientes \(1\)/ })).toBeDefined());
    expect(screen.getByRole("button", { name: /Histórico \(1\)/ })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Histórico \(1\)/ }));
    await waitFor(() => expect(screen.getByText("55555555")).toBeDefined());
    expect(screen.queryByText("44444444")).toBeNull();
  });

  it("la búsqueda alcanza los casos de CUALQUIER ámbito suyo", async () => {
    await pintar(mezcla);
    fireEvent.change(screen.getByPlaceholderText(/Buscar por Nº de caso/i), { target: { value: "3333" } });
    await waitFor(() => expect(screen.getByText("33333333")).toBeDefined());
    expect(screen.queryByText("11111111")).toBeNull();
  });

  it("no inventa filas: sólo aparece lo que el servidor devolvió", async () => {
    // «Todas» significa todos MIS casos, nunca todos los del tenant: la lista
    // es exactamente la respuesta de /inbox.
    await pintar(mezcla);
    const filas = screen.getAllByRole("row").length - 1; // menos la cabecera
    expect(filas).toBe(3); // los pendientes, que es la pestaña por defecto
  });
});


/**
 * LO QUE LA BANDEJA LE DICE AL MÉDICO SOBRE LAS ADVERTENCIAS.
 *
 * AQUÍ HABÍA UN BADGE «Advertencia administrativa» y se retiró. Avisaba de que la
 * emisión del documento «quedaría pendiente de coordinación», y eso dejó de ser
 * cierto en octubre de 2026: ratificar emite. El aviso sobrevivió al cambio de
 * regla y le enseñaba al médico a esperar un permiso que ya no existe, sobre
 * expedientes que podía cerrar él mismo.
 *
 * Lo que SÍ se señala es lo contrario: cuando el expediente NO se puede trabajar.
 * Eso él no lo puede resolver redactando, y tiene que saberlo antes de abrirlo.
 */
describe("Bandeja · advertencias y lo que de verdad cierra un expediente", () => {
  const SIN_BLOQUEO = { warningCount: 2, finalizationBlockerCount: 2, blocksMedicalWork: false };
  const NO_TRABAJABLE = { warningCount: 2, finalizationBlockerCount: 1, blocksMedicalWork: true };

  it("E · ya NO existe el badge «Advertencia administrativa»", async () => {
    await pintar([caso("33346702", "PENDING_REVIEW", { qa: SIN_BLOQUEO })]);
    expect(screen.queryByText("Advertencia administrativa")).toBeNull();
  });

  it("F · ya NO existe el aviso de validación por coordinación", async () => {
    await pintar([caso("33346702", "PENDING_REVIEW", { qa: SIN_BLOQUEO })]);
    expect(screen.queryByTitle(/quedará pendiente de coordinación/i)).toBeNull();
    expect(screen.queryByText(/pendiente de coordinación/i)).toBeNull();
  });

  it("un expediente trabajable con observaciones se muestra sólo como «Por revisar»", async () => {
    await pintar([caso("33346702", "PENDING_REVIEW", { qa: SIN_BLOQUEO })]);
    expect(screen.getByText("33346702")).toBeDefined();
    // Ningún adorno: el detalle de la observación vive DENTRO del caso.
    expect(screen.queryByTestId("chip-no-trabajable")).toBeNull();
  });

  it("un expediente que NO se puede trabajar SÍ lo dice, y dice de quién depende", async () => {
    await pintar([caso("33361146", "PENDING_REVIEW", { qa: NO_TRABAJABLE })]);
    const chip = screen.getByTestId("chip-no-trabajable");
    expect(chip.textContent).toBe("Pendiente de relectura");
    expect(chip.getAttribute("title")).toMatch(/no es algo que puedas resolver/i);
  });

  it("un RETENIDO no lleva además el aviso de relectura: su motivo ya lo explica", async () => {
    await pintar([caso("32895245", "HOLD", { qa: NO_TRABAJABLE })]);
    expect(screen.queryByTestId("chip-no-trabajable")).toBeNull();
  });

  it("«sin evaluar» no es «sin advertencias»: sin qa no se adorna ni se declara limpio", async () => {
    await pintar([caso("33441193", "PENDING_REVIEW")]);
    expect(screen.queryByTestId("chip-no-trabajable")).toBeNull();
  });

  /**
   * G y H · DÓNDE CAE UN EXPEDIENTE. La clasificación la decide el servidor; lo
   * que se congela aquí es que la bandeja la respeta y no la reinterpreta.
   */
  it("G · un expediente con corrección post-firma abierta llega como PENDIENTE", async () => {
    await pintar([caso("33754938", "PENDING_REVIEW", { qa: NO_TRABAJABLE })]);
    expect(screen.getByText("33754938")).toBeDefined();
  });

  it("H · un firmado sin corrección abierta está en Histórico, no en Pendientes", async () => {
    await pintar([caso("33536456", "SIGNED")]);
    // No está en la pestaña inicial.
    expect(screen.queryByText("33536456")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /histórico/i }));
    await waitFor(() => expect(screen.getByText("33536456")).toBeDefined());
  });
});
