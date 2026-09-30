import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { pintarConQuery } from "@/test/utils";
import { ControlPrevio, categoriaDe, seArreglaReleyendo } from "./ControlPrevio";

/**
 * CONTROL PREVIO · CADA ADVERTENCIA CON LA ACCIÓN QUE DE VERDAD LA DESTRABA.
 *
 * Coordinación no tiene por qué traducir códigos internos. Una limitación de la
 * fuente se valida —queda escrito quién la miró—; un dato que sólo el
 * profesional puede leer se le devuelve; y una prueba de que los antecedentes
 * están mal no se arregla con una nota. Ofrecer el botón equivocado es peor que
 * no ofrecer ninguno: invita a cerrar por escrito algo que había que corregir.
 *
 * Expedientes sintéticos, sin PII.
 */

const LOTE = "00000000-0000-4000-8000-0000000000b1";

function hallazgo(over: Partial<Parameters<typeof categoriaDe>[0]> & Record<string, unknown> = {}) {
  return {
    code: "MASTER_COVERAGE_PARTIAL",
    statement: "El listado maestro no imprime el total de todos sus bloques.",
    evidence: "2024=12; sin total: 2025 (20 fila(s))",
    severity: "REVIEW_REQUIRED",
    blocksMedicalWork: false,
    blocksFinalization: true,
    findingKey: "k1",
    resolvedAt: null,
    resolutionNote: null,
    ...over,
  };
}

function caso(findings: ReturnType<typeof hallazgo>[]) {
  return {
    caseId: "00000000-0000-4000-8000-0000000000c1",
    externalCaseId: "33346702",
    blocksMedicalWork: findings.some((f) => f.blocksMedicalWork),
    blocksFinalization: findings.some((f) => f.blocksFinalization),
    findings,
  };
}

/** Semanas, informe del lote y conciliación: lo que la pantalla pide al abrir. */
function servidor(findings: ReturnType<typeof hallazgo>[], extra: Record<string, unknown> = {}) {
  return vi.fn(async (url: string, init?: { method?: string }) => {
    const u = String(url);
    const cuerpo = (data: unknown) =>
      new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
    if (u.includes("/admin/batches") && u.endsWith("/qa")) {
      return cuerpo({ version: "1.5.0", totalCases: 1, cases: [caso(findings)] });
    }
    if (u.includes("/final-documents/reconcile")) return cuerpo({ emitted: [] });
    if (u.includes("/admin/batches")) {
      return cuerpo({ batches: [{ batch: { id: LOTE, name: "TARAPACA_ENTREGA_2", status: "OPEN" } }] });
    }
    for (const [clave, valor] of Object.entries(extra)) {
      if (u.includes(clave)) return cuerpo(valor);
    }
    if (init?.method === "POST" || init) return cuerpo({ ok: true });
    return cuerpo({});
  });
}

async function abrir(findings: ReturnType<typeof hallazgo>[], extra: Record<string, unknown> = {}) {
  vi.stubGlobal("fetch", servidor(findings, extra));
  pintarConQuery(<ControlPrevio />);
  await cargarLote();
}

/** La pantalla no carga sola: coordinación pulsa «Revisar la semana». */
async function cargarLote() {
  // Hay que esperar a que la semana esté cargada: sin lote elegido el botón no hace nada.
  await waitFor(() => expect(screen.getByRole("option", { name: "TARAPACA_ENTREGA_2" })).toBeDefined());
  fireEvent.click(screen.getByRole("button", { name: "Revisar la semana" }));
  await waitFor(() => expect(screen.getByText(/33346702/)).toBeDefined());
  fireEvent.click(screen.getByRole("button", { name: "Revisar" }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("categoriaDe · de qué depende la acción", () => {
  it("la cobertura del maestro es limitación de la fuente", () => {
    expect(categoriaDe({ code: "MASTER_COVERAGE_PARTIAL", blocksMedicalWork: false })).toBe("LIMITACION_FUENTE");
    expect(categoriaDe({ code: "MASTER_COVERAGE_UNVERIFIED", blocksMedicalWork: false })).toBe("LIMITACION_FUENTE");
  });

  it("lo que sólo el profesional puede leer es aporte médico", () => {
    expect(categoriaDe({ code: "LICENSE_STATES_ALL_UNKNOWN", blocksMedicalWork: false })).toBe("APORTE_MEDICO");
    expect(categoriaDe({ code: "AUTHORIZED_DAYS_UNAVAILABLE", blocksMedicalWork: false })).toBe("APORTE_MEDICO");
  });

  it("sólo tres códigos se arreglan releyendo", () => {
    expect(seArreglaReleyendo("SOURCE_LICENSE_COUNT_MISMATCH")).toBe(true);
    expect(seArreglaReleyendo("MASTER_ROW_WITHOUT_EVIDENCE")).toBe(true);
    expect(seArreglaReleyendo("STALE_ANALYSIS")).toBe(true);
    expect(seArreglaReleyendo("IDENTITY_UNRESOLVED")).toBe(false);
    expect(seArreglaReleyendo("MASTER_COVERAGE_PARTIAL")).toBe(false);
  });

  it("un recuento que no cuadra es técnico", () => {
    expect(categoriaDe({ code: "SOURCE_LICENSE_COUNT_MISMATCH", blocksMedicalWork: true })).toBe("TECNICO");
    expect(categoriaDe({ code: "MASTER_ROW_WITHOUT_EVIDENCE", blocksMedicalWork: true })).toBe("TECNICO");
  });

  /** Que cierre el trabajo médico manda sobre el mapa: no hay excepciones. */
  it("cualquier hallazgo que cierre el trabajo médico es técnico", () => {
    expect(categoriaDe({ code: "MASTER_COVERAGE_PARTIAL", blocksMedicalWork: true })).toBe("TECNICO");
  });
});

describe("ControlPrevio · la acción que corresponde a cada advertencia", () => {
  it("B · cobertura parcial: se valida la limitación, no se devuelve al médico", async () => {
    await abrir([hallazgo({ code: "MASTER_COVERAGE_PARTIAL" })]);
    expect(screen.getByRole("button", { name: "Validar limitación de fuente" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Devolver al médico" })).toBeNull();
  });

  it("C · cobertura no comprobable: también se valida la limitación", async () => {
    await abrir([hallazgo({ code: "MASTER_COVERAGE_UNVERIFIED" })]);
    expect(screen.getByRole("button", { name: "Validar limitación de fuente" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Devolver al médico" })).toBeNull();
  });

  it("A · estados ilegibles: se devuelve al médico, y no se ofrece validar", async () => {
    await abrir([hallazgo({ code: "LICENSE_STATES_ALL_UNKNOWN" })]);
    expect(screen.getByRole("button", { name: "Devolver al médico" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Validar limitación de fuente" })).toBeNull();
  });

  /**
   * Un defecto técnico NO se cierra por escrito ni devolviéndolo. Antes eso
   * dejaba a coordinación sin salida y el aviso lo decía; ahora la salida es
   * releerlo, así que lo que se comprueba es que las otras dos siguen sin
   * ofrecerse.
   */
  it("D · un defecto técnico no se cierra con una nota ni devolviendo", async () => {
    await abrir([
      hallazgo({ code: "SOURCE_LICENSE_COUNT_MISMATCH", blocksMedicalWork: true, severity: "BLOCKING" }),
    ]);
    expect(screen.queryByRole("button", { name: "Validar limitación de fuente" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Devolver al médico" })).toBeNull();
    expect(screen.getByText(/hay que volver a leerlos/)).toBeDefined();
  });

  it("I · una advertencia que no cierra nada no ofrece ninguna acción", async () => {
    await abrir([
      hallazgo({ code: "MASTER_COVERAGE_NOT_CHECKED", blocksFinalization: false, severity: "WARNING" }),
    ]);
    expect(screen.queryByRole("button", { name: "Validar limitación de fuente" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Devolver al médico" })).toBeNull();
  });

  it("H · con dos advertencias, cada una ofrece lo suyo", async () => {
    await abrir([
      hallazgo({ code: "MASTER_COVERAGE_UNVERIFIED", findingKey: "k1" }),
      hallazgo({ code: "LICENSE_STATES_ALL_UNKNOWN", findingKey: "k2", severity: "BLOCKING" }),
    ]);
    expect(screen.getByRole("button", { name: "Validar limitación de fuente" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Devolver al médico" })).toBeDefined();
  });

  it("E · devolver pide motivo y no llama al servidor sin él", async () => {
    const fetchMock = servidor([hallazgo({ code: "LICENSE_STATES_ALL_UNKNOWN" })]);
    vi.stubGlobal("fetch", fetchMock);
    pintarConQuery(<ControlPrevio />);
    await cargarLote();
    fireEvent.click(screen.getByRole("button", { name: "Devolver al médico" }));

    const confirmar = screen.getByRole("button", { name: "Confirmar devolución" }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
    fireEvent.click(confirmar);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("return-to-doctor"))).toBe(false);
  });

  it("F · con motivo, devuelve por el endpoint de siempre y con el motivo dentro", async () => {
    const fetchMock = servidor([hallazgo({ code: "LICENSE_STATES_ALL_UNKNOWN" })], {
      "/report": { id: "00000000-0000-4000-8000-0000000000a9" },
    });
    vi.stubGlobal("fetch", fetchMock);
    pintarConQuery(<ControlPrevio />);
    await cargarLote();
    fireEvent.click(screen.getByRole("button", { name: "Devolver al médico" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Completar manualmente las cifras de la Sección II." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar devolución" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("return-to-doctor"))).toBe(true),
    );
    const llamada = fetchMock.mock.calls.find((c) => String(c[0]).includes("return-to-doctor"))!;
    const cuerpo = JSON.parse(String((llamada[1] as { body?: string }).body));
    expect(cuerpo.reason).toContain("Sección II");
    // Se pidió el informe del caso para saber qué versión devolver.
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/cases/") && String(c[0]).endsWith("/report"))).toBe(true);
  });

  it("cancelar no devuelve nada", async () => {
    const fetchMock = servidor([hallazgo({ code: "LICENSE_STATES_ALL_UNKNOWN" })]);
    vi.stubGlobal("fetch", fetchMock);
    pintarConQuery(<ControlPrevio />);
    await cargarLote();
    fireEvent.click(screen.getByRole("button", { name: "Devolver al médico" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Devolver al médico" })).toBeDefined();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("return-to-doctor"))).toBe(false);
  });

  it("A · un recuento que no cuadra se relee: Reprocesar visible, y nada más", async () => {
    await abrir([
      hallazgo({ code: "SOURCE_LICENSE_COUNT_MISMATCH", blocksMedicalWork: true, severity: "BLOCKING" }),
    ]);
    expect(screen.getByRole("button", { name: "Reprocesar" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Validar limitación de fuente" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Devolver al médico" })).toBeNull();
  });

  it("B · filas sin evidencia: Reprocesar visible", async () => {
    await abrir([
      hallazgo({ code: "MASTER_ROW_WITHOUT_EVIDENCE", blocksMedicalWork: true, severity: "BLOCKING" }),
    ]);
    expect(screen.getByRole("button", { name: "Reprocesar" })).toBeDefined();
  });

  it("C · estados ilegibles: NO se relee, se devuelve al médico", async () => {
    await abrir([hallazgo({ code: "LICENSE_STATES_ALL_UNKNOWN" })]);
    expect(screen.queryByRole("button", { name: "Reprocesar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Devolver al médico" })).toBeDefined();
  });

  it("D2 · cobertura parcial: NO se relee, se valida la limitación", async () => {
    await abrir([hallazgo({ code: "MASTER_COVERAGE_PARTIAL" })]);
    expect(screen.queryByRole("button", { name: "Reprocesar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Validar limitación de fuente" })).toBeDefined();
  });

  it("un defecto técnico que NO se arregla releyendo no ofrece el botón", async () => {
    await abrir([
      hallazgo({ code: "IDENTITY_UNRESOLVED", blocksMedicalWork: true, severity: "BLOCKING" }),
    ]);
    expect(screen.queryByRole("button", { name: "Reprocesar" })).toBeNull();
    expect(screen.getByText(/hay que corregir los antecedentes/)).toBeDefined();
  });

  it("E/F · reprocesar pide confirmación y llama al endpoint protegido", async () => {
    const fetchMock = servidor([
      hallazgo({ code: "SOURCE_LICENSE_COUNT_MISMATCH", blocksMedicalWork: true, severity: "BLOCKING" }),
    ]);
    vi.stubGlobal("fetch", fetchMock);
    pintarConQuery(<ControlPrevio />);
    await cargarLote();

    fireEvent.click(screen.getByRole("button", { name: "Reprocesar" }));
    // Antes de confirmar no se ha llamado a nadie.
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/reprocess"))).toBe(false);
    expect(screen.getByText(/No se modifica el trabajo del profesional/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar reproceso" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/reprocess"))).toBe(true),
    );
    // J · ni asignaciones ni revisiones: sólo el reproceso.
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("assignment"))).toBe(false);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/reviews"))).toBe(false);
  });

  it("cancelar el reproceso no llama a nadie", async () => {
    const fetchMock = servidor([
      hallazgo({ code: "SOURCE_LICENSE_COUNT_MISMATCH", blocksMedicalWork: true, severity: "BLOCKING" }),
    ]);
    vi.stubGlobal("fetch", fetchMock);
    pintarConQuery(<ControlPrevio />);
    await cargarLote();
    fireEvent.click(screen.getByRole("button", { name: "Reprocesar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Reprocesar" })).toBeDefined();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/reprocess"))).toBe(false);
  });

  it("H · si la advertencia desaparece tras releer, su acción desaparece", async () => {
    // El servidor devuelve el caso ya sin hallazgos en la segunda carga.
    let vuelta = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        const cuerpo = (d: unknown) =>
          new Response(JSON.stringify(d), { status: 200, headers: { "content-type": "application/json" } });
        if (u.includes("/admin/batches") && u.endsWith("/qa")) {
          vuelta += 1;
          const findings =
            vuelta === 1
              ? [hallazgo({ code: "SOURCE_LICENSE_COUNT_MISMATCH", blocksMedicalWork: true })]
              : [];
          return cuerpo({ version: "1.5.0", totalCases: 1, cases: [caso(findings)] });
        }
        if (u.includes("/final-documents/reconcile")) return cuerpo({ emitted: [] });
        if (u.includes("/admin/batches")) {
          return cuerpo({ batches: [{ batch: { id: LOTE, name: "TARAPACA_ENTREGA_2", status: "OPEN" } }] });
        }
        return cuerpo({ ok: true });
      }),
    );
    pintarConQuery(<ControlPrevio />);
    await cargarLote();
    fireEvent.click(screen.getByRole("button", { name: "Reprocesar" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar reproceso" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Reprocesar" })).toBeNull());
  });

  it("dice qué falta, sin obligar a leer el código interno", async () => {
    await abrir([hallazgo({ code: "LICENSE_STATES_ALL_UNKNOWN" })]);
    expect(screen.getByText(/Sólo el profesional puede consignarlo/)).toBeDefined();
  });
});
