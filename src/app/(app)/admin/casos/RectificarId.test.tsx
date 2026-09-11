import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { pintarConQuery } from "@/test/utils";
import { puedeAcceder } from "@/lib/roles";
import { Casos } from "./Casos";
import type { OperationalCase } from "@/lib/backend";

/**
 * RECTIFICAR EL IDENTIFICADOR DE UN EXPEDIENTE, DESDE LA PLATAFORMA.
 *
 * Lo que congelan estas pruebas no es la maquetación:
 *
 *   · la absorción de otro expediente NUNCA se elige sola — hay que verla y
 *     confirmarla;
 *   · sin justificación no se envía nada;
 *   · un rechazo del backend se lee en cristiano, no como un 409 pelado;
 *   · y la pantalla vive detrás del guardarraíl de /admin, al que un médico no
 *     entra.
 *
 * Sin PII: los expedientes son sintéticos.
 */

const ORIGEN: OperationalCase = {
  caseId: "00000000-0000-4000-8000-000000000001",
  externalCaseId: "34208241",
  previousExternalCaseId: null,
  classification: "SIGNED",
  hold: null,
  sourceDocument: null,
  status: "ANALYZED",
  statusChangedAt: "2026-09-08T13:41:00.000Z",
  discoveredAt: "2026-09-04T19:43:00.000Z",
  failureClass: null,
  analysisAttempts: 1,
  batch: null,
  assignment: null,
  report: {
    reportId: "00000000-0000-4000-8000-0000000000r1".replace("r", "0"),
    version: 2,
    workflowStatus: "SIGNED",
    readinessStatus: "READY",
    orientationAssessment: "RECOVERABLE",
    signedAt: "2026-09-08T13:45:00.000Z",
  },
};

const PLACEHOLDER: OperationalCase = {
  ...ORIGEN,
  caseId: "00000000-0000-4000-8000-000000000002",
  externalCaseId: "34218380",
  classification: "HOLD",
  hold: { active: true, statement: "Retenido." },
  status: "ANALYSIS_FAILED",
  report: null,
};

/** El backend simulado. `rectify` decide qué contesta la rectificación. */
function backend(options: {
  casos: OperationalCase[];
  ocupante?: OperationalCase | null;
  rectify?: () => { status: number; body: unknown };
}) {
  return vi.fn(async (url: string, init?: { body?: string; method?: string }) => {
    const u = String(url);
    if (u.includes("/correct-identity")) {
      const r = options.rectify?.() ?? { status: 200, body: { caseId: ORIGEN.caseId } };
      return new Response(JSON.stringify(r.body), {
        status: r.status,
        headers: { "content-type": "application/json" },
      });
    }
    if (u.includes("externalCaseId=")) {
      const encontrados = options.ocupante ? [options.ocupante] : [];
      return new Response(JSON.stringify({ cases: encontrados, total: encontrados.length }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (u.includes("/admin/cases")) {
      return new Response(JSON.stringify({ cases: options.casos, total: options.casos.length }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // Semanas y carga de médicos: la pantalla los pide para los desplegables.
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

async function pintar(options: Parameters<typeof backend>[0]) {
  const fetchMock = backend(options);
  vi.stubGlobal("fetch", fetchMock);
  pintarConQuery(<Casos />);
  await waitFor(() => expect(screen.getByText(options.casos[0]?.externalCaseId ?? "—")).toBeDefined());
  return fetchMock;
}

/** Abre el formulario de la primera fila. */
async function abrir(options: Parameters<typeof backend>[0]) {
  const fetchMock = await pintar(options);
  fireEvent.click(screen.getAllByRole("button", { name: /corregir id/i })[0] as HTMLElement);
  await waitFor(() => expect(screen.getByLabelText("Identificador nuevo")).toBeDefined());
  return fetchMock;
}

/** Elegir el tipo de corrección es obligatorio antes que nada. */
function elegirModo(modo: "RECTIFY_ID" | "REASSIGN_CASE" = "REASSIGN_CASE") {
  const radios = screen.getAllByRole("radio") as HTMLInputElement[];
  const i = modo === "RECTIFY_ID" ? 0 : 1;
  fireEvent.click(radios[i] as HTMLInputElement);
}

function escribir(nuevoId: string, nota: string, modo: "RECTIFY_ID" | "REASSIGN_CASE" = "REASSIGN_CASE") {
  elegirModo(modo);
  fireEvent.change(screen.getByLabelText("Identificador nuevo"), { target: { value: nuevoId } });
  fireEvent.change(screen.getByLabelText("Justificación"), { target: { value: nota } });
}

const NOTA = "Contraparte confirma que los antecedentes corresponden a este trámite.";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Rectificar identificador · pantalla de administración", () => {
  it("la acción vive en /admin, y un médico no entra ahí", () => {
    // La pantalla entera está detrás del guardarraíl de rutas: no hay un botón
    // que ocultar porque no hay pantalla a la que llegar.
    expect(puedeAcceder("medico", "/admin/casos")).toBe(false);
    expect(puedeAcceder("calidad", "/admin/casos")).toBe(false);
    expect(puedeAcceder("admin", "/admin/casos")).toBe(true);
  });

  it("muestra el identificador actual como sólo lectura y no deja enviar sin justificación", async () => {
    await abrir({ casos: [ORIGEN] });

    const actual = screen.getByDisplayValue("34208241") as HTMLInputElement;
    expect(actual.readOnly).toBe(true);

    const enviar = screen.getByRole("button", { name: /corregir identificador/i });
    expect((enviar as HTMLButtonElement).disabled).toBe(true);

    escribir("34218380", "corto");
    fireEvent.click(screen.getByRole("button", { name: /^comprobar$/i }));
    await waitFor(() => expect(screen.getByText(/está libre/i)).toBeDefined());

    // Con el identificador comprobado pero SIN justificación suficiente, sigue bloqueado.
    expect((screen.getByRole("button", { name: /corregir identificador/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("exige comprobar el identificador de destino antes de permitir enviar", async () => {
    await abrir({ casos: [ORIGEN] });
    escribir("34218380", NOTA);

    expect((screen.getByRole("button", { name: /corregir identificador/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText(/comprueba el identificador de destino/i)).toBeDefined();
  });

  it("cuando el destino está ocupado lo muestra con sus datos y EXIGE confirmar la absorción", async () => {
    await abrir({ casos: [ORIGEN], ocupante: PLACEHOLDER });
    escribir("34218380", NOTA);
    fireEvent.click(screen.getByRole("button", { name: /^comprobar$/i }));

    await waitFor(() => expect(screen.getByText("Existe un caso con este ID")).toBeDefined());
    expect(screen.getByText("Retención: sí")).toBeDefined();
    expect(screen.getByText("Aprobado: no")).toBeDefined();
    expect(screen.getByText("Firmado: no")).toBeDefined();

    // Sin marcar la casilla no se puede enviar.
    const enviar = () => screen.getByRole("button", { name: /corregir identificador/i }) as HTMLButtonElement;
    expect(enviar().disabled).toBe(true);
    expect(screen.getByText(/confirma la absorción/i)).toBeDefined();

    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(enviar().disabled).toBe(false));
  });

  it("no manda absorbCaseId por su cuenta: sólo cuando se confirmó", async () => {
    const fetchMock = await abrir({ casos: [ORIGEN], ocupante: PLACEHOLDER });
    escribir("34218380", NOTA);
    fireEvent.click(screen.getByRole("button", { name: /^comprobar$/i }));
    await waitFor(() => expect(screen.getByText("Existe un caso con este ID")).toBeDefined());
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /corregir identificador/i }));

    await waitFor(() => {
      const llamada = fetchMock.mock.calls.find((c) => String(c[0]).includes("/correct-identity"));
      expect(llamada).toBeDefined();
      const cuerpo = JSON.parse((llamada?.[1] as { body: string }).body) as Record<string, unknown>;
      expect(cuerpo["mode"]).toBe("REASSIGN_CASE");
      expect(cuerpo["targetExternalCaseId"]).toBe("34218380");
      expect(cuerpo["note"]).toBe(NOTA);
      expect(cuerpo["absorbCaseId"]).toBe(PLACEHOLDER.caseId);
    });
  });

  it("sin ocupante no viaja ningún absorbCaseId", async () => {
    const fetchMock = await abrir({ casos: [ORIGEN] });
    escribir("34999999", NOTA);
    fireEvent.click(screen.getByRole("button", { name: /^comprobar$/i }));
    await waitFor(() => expect(screen.getByText(/está libre/i)).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /corregir identificador/i }));

    await waitFor(() => {
      const llamada = fetchMock.mock.calls.find((c) => String(c[0]).includes("/correct-identity"));
      const cuerpo = JSON.parse((llamada?.[1] as { body: string }).body) as Record<string, unknown>;
      expect("absorbCaseId" in cuerpo).toBe(false);
    });
  });

  it("al terminar dice el identificador nuevo", async () => {
    await abrir({ casos: [ORIGEN], ocupante: PLACEHOLDER });
    escribir("34218380", NOTA);
    fireEvent.click(screen.getByRole("button", { name: /^comprobar$/i }));
    await waitFor(() => expect(screen.getByText("Existe un caso con este ID")).toBeDefined());
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /corregir identificador/i }));

    await waitFor(() => expect(screen.getByText(/Identificador corregido a 34218380/)).toBeDefined());
    expect(screen.getByText(/34218380 quedó absorbido|quedó absorbido/)).toBeDefined();
  });

  it("un 409 del backend se presenta legible, no como un código", async () => {
    await abrir({
      casos: [ORIGEN],
      ocupante: PLACEHOLDER,
      rectify: () => ({
        status: 409,
        body: {
          error: {
            code: "CONFLICT",
            message: "No se absorbe un expediente con un informe firmado.",
            details: [{ field: "absorbCaseId", issue: "CASE_SIGNED" }],
          },
        },
      }),
    });
    escribir("34218380", NOTA);
    fireEvent.click(screen.getByRole("button", { name: /^comprobar$/i }));
    await waitFor(() => expect(screen.getByText("Existe un caso con este ID")).toBeDefined());
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /corregir identificador/i }));

    await waitFor(() =>
      expect(
        screen.getByText("El expediente de destino tiene un informe firmado. No se absorbe."),
      ).toBeDefined(),
    );
  });

  it("un 403 dice que la sesión no puede, y no simula que funcionó", async () => {
    await abrir({
      casos: [ORIGEN],
      rectify: () => ({
        status: 403,
        body: { error: { code: "FORBIDDEN", message: "Forbidden", details: [] } },
      }),
    });
    escribir("34999999", NOTA);
    fireEvent.click(screen.getByRole("button", { name: /^comprobar$/i }));
    await waitFor(() => expect(screen.getByText(/está libre/i)).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /corregir identificador/i }));

    await waitFor(() => expect(screen.getByText(/no tiene permiso/i)).toBeDefined());
    expect(screen.queryByText(/Identificador corregido/)).toBeNull();
  });

  it("el listado muestra el identificador anterior cuando lo hay", async () => {
    await pintar({
      casos: [{ ...ORIGEN, externalCaseId: "34218380", previousExternalCaseId: "34208241" }],
    });

    expect(screen.getByText("34218380")).toBeDefined();
    expect(screen.getByText(/antes 34208241/)).toBeDefined();
  });

  it("un caso sin rectificar no muestra ningún identificador anterior", async () => {
    await pintar({ casos: [ORIGEN] });
    expect(screen.queryByText(/^antes /)).toBeNull();
  });
});

/**
 * LOS DOS MODOS, que son la razón de ser de esta pantalla.
 *
 * Elegir mal no es un detalle de redacción: si los antecedentes pertenecían a
 * otro trámite y se marca «el identificador era incorrecto», el trámite real
 * que lleva ese número no podrá existir nunca.
 */
describe("Corregir identificador · los dos tipos de error", () => {
  it("no deja enviar hasta elegir el tipo de corrección", async () => {
    await abrir({ casos: [ORIGEN] });

    expect(screen.getByText(/elige primero el tipo de corrección/i)).toBeDefined();
    expect(
      (screen.getByRole("button", { name: /corregir identificador/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("la reasignación advierte EXPRESAMENTE que el identificador quedará disponible", async () => {
    await abrir({ casos: [ORIGEN] });

    expect(
      screen.getByText(/QUEDARÁ DISPONIBLE para recibir su propio expediente/i),
    ).toBeDefined();
    expect(screen.getByText(/queda ligado a este expediente como historia/i)).toBeDefined();
  });

  it("manda el modo elegido, y RECTIFY_ID no promete liberar nada", async () => {
    const fetchMock = await abrir({ casos: [ORIGEN] });
    escribir("34999999", NOTA, "RECTIFY_ID");
    fireEvent.click(screen.getByRole("button", { name: /^comprobar$/i }));
    await waitFor(() => expect(screen.getByText(/está libre/i)).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /corregir identificador/i }));

    await waitFor(() => {
      const llamada = fetchMock.mock.calls.find((c) => String(c[0]).includes("/correct-identity"));
      const cuerpo = JSON.parse((llamada?.[1] as { body: string }).body) as Record<string, unknown>;
      expect(cuerpo["mode"]).toBe("RECTIFY_ID");
    });
    await waitFor(() =>
      expect(screen.queryByText(/queda disponible para su propio expediente/i)).toBeNull(),
    );
  });

  it("tras reasignar, dice que el identificador anterior queda disponible", async () => {
    await abrir({ casos: [ORIGEN] });
    escribir("34999999", NOTA, "REASSIGN_CASE");
    fireEvent.click(screen.getByRole("button", { name: /^comprobar$/i }));
    await waitFor(() => expect(screen.getByText(/está libre/i)).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /corregir identificador/i }));

    await waitFor(() =>
      expect(screen.getByText(/34208241 queda disponible para su propio expediente/i)).toBeDefined(),
    );
  });
});
