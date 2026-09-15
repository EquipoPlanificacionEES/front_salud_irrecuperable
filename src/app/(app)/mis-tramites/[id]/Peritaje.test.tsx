import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { pintarConQuery } from "@/test/utils";
import type { Cita, Peritaje } from "@/lib/backend";
import { FormularioPeritaje } from "./FormularioPeritaje";
import { PanelCita } from "./PanelCita";

/**
 * Lo que se verifica aquí es lo que QUEDA RENDERIZADO y lo que SALE POR LA RED,
 * no el estado interno: el requisito del cliente es que guardar no complete y
 * que completar no se confunda con guardar, y eso sólo se demuestra mirando la
 * petición que se manda.
 */

function peritaje(over: Partial<Peritaje> = {}): Peritaje {
  return {
    id: "per-1",
    status: "DRAFT",
    version: 3,
    values: { clinicalImpression: "Lo escrito antes." },
    formProfileKey: "PERITAJE_TELEMATICO_V1",
    formSchemaVersion: "1.0.0",
    sections: [{ id: "ENTREVISTA", title: "Lo informado durante la entrevista" }],
    fields: [
      { key: "diagnosesReportedAtInterview", label: "Diagnósticos informados", kind: "LONG_TEXT", sectionId: "ENTREVISTA", optional: false, options: [] },
      { key: "gafEeagScore", label: "Puntaje GAF/EEAG", kind: "INTEGER", sectionId: "ENTREVISTA", optional: true, options: [] },
    ],
    lastSavedAt: "2026-09-11T13:42:00.000Z",
    completedAt: null,
    missingForCompletion: [
      { key: "clinicalPrognosis", label: "Pronóstico", issue: "falta completarlo" },
    ],
    canComplete: false,
    ...over,
  };
}

const fetchMock = vi.fn();
afterEach(cleanup);
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  document.cookie = "sir_csrf=token-de-prueba";
});

function respuesta(cuerpo: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    text: () => Promise.resolve(JSON.stringify(cuerpo)),
  } as Response);
}

describe("formulario del peritaje", () => {
  it("precarga lo guardado y rotula lo opcional", () => {
    pintarConQuery(<FormularioPeritaje caseId="c1" peritaje={peritaje()} />);
    expect(screen.getByText("Lo informado durante la entrevista")).toBeTruthy();
    // GAF/EEAG se ve marcado como opcional: no es exigible para cerrar.
    expect(screen.getAllByText("opcional").length).toBeGreaterThan(0);
  });

  it("muestra el último guardado", () => {
    pintarConQuery(<FormularioPeritaje caseId="c1" peritaje={peritaje()} />);
    expect(screen.getByText(/Último guardado:/)).toBeTruthy();
    expect(screen.getByText(/Borrador/)).toBeTruthy();
  });

  it("GUARDAR manda sólo lo tocado y la versión leída — y NO completa", async () => {
    fetchMock.mockImplementation(() => respuesta(peritaje({ version: 4 })));
    pintarConQuery(<FormularioPeritaje caseId="c1" peritaje={peritaje()} />);

    fireEvent.change(screen.getByLabelText(/Diagnósticos informados/), {
      target: { value: "Dicho en la entrevista." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/cases/c1/telematic-assessment/draft");
    expect(init.method).toBe("PUT");
    const cuerpo = JSON.parse(init.body);
    expect(cuerpo.expectedVersion).toBe(3);
    // SÓLO lo tocado: lo que no se editó lo conserva el servidor.
    expect(Object.keys(cuerpo.values)).toEqual(["diagnosesReportedAtInterview"]);
    // Y bajo ningún concepto la ruta de completar.
    expect(url).not.toMatch(/complete/);
  });

  it("COMPLETAR es otra petición, a otra ruta", async () => {
    fetchMock.mockImplementation(() => respuesta(peritaje({ status: "COMPLETED" })));
    pintarConQuery(<FormularioPeritaje caseId="c1" peritaje={peritaje()} />);

    fireEvent.click(screen.getByRole("button", { name: "Completar peritaje" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/cases/c1/telematic-assessment/complete");
    expect(init.method).toBe("POST");
  });

  it("COMPLETAR con cambios sin guardar: primero GUARDA lo tocado y después completa", async () => {
    fetchMock
      .mockImplementationOnce(() => respuesta(peritaje({ version: 4, values: { diagnosesReportedAtInterview: "Nuevo." } })))
      .mockImplementationOnce(() => respuesta(peritaje({ status: "COMPLETED", version: 5 })));
    pintarConQuery(<FormularioPeritaje caseId="c1" peritaje={peritaje()} />);

    fireEvent.change(screen.getByLabelText(/Diagnósticos informados/), { target: { value: "Nuevo." } });
    fireEvent.click(screen.getByRole("button", { name: "Completar peritaje" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [urlGuardar, initGuardar] = fetchMock.mock.calls[0];
    expect(urlGuardar).toBe("/api/v1/cases/c1/telematic-assessment/draft");
    const cuerpo = JSON.parse(initGuardar.body);
    expect(cuerpo).toEqual({ expectedVersion: 3, values: { diagnosesReportedAtInterview: "Nuevo." } });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/cases/c1/telematic-assessment/complete");
  });

  it("COMPLETAR con cambios sin guardar y un 409 al guardar: NO completa y no borra lo escrito", async () => {
    fetchMock.mockImplementation(() => respuesta({ error: { message: "Conflicto." } }, 409));
    pintarConQuery(<FormularioPeritaje caseId="c1" peritaje={peritaje()} />);

    const campo = screen.getByLabelText(/Diagnósticos informados/) as HTMLTextAreaElement;
    fireEvent.change(campo, { target: { value: "No se pierde." } });
    fireEvent.click(screen.getByRole("button", { name: "Completar peritaje" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).not.toMatch(/complete/);
    expect(campo.value).toBe("No se pierde.");
  });

  it("un 409 AVISA y NO borra lo escrito", async () => {
    fetchMock.mockImplementation(() =>
      respuesta({ error: { message: "El borrador cambió desde que lo abriste." } }, 409),
    );
    pintarConQuery(<FormularioPeritaje caseId="c1" peritaje={peritaje()} />);

    const campo = screen.getByLabelText(/Diagnósticos informados/) as HTMLTextAreaElement;
    fireEvent.change(campo, { target: { value: "Texto que no se puede perder." } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/cambió desde otra sesión/i);
    // Lo escrito SIGUE EN PANTALLA. Perder texto clínico en silencio es el peor
    // fallo posible aquí.
    expect(campo.value).toMatch(/Texto que no se puede perder/);
  });

  it("dice qué falta para completar, con las palabras del servidor", () => {
    pintarConQuery(<FormularioPeritaje caseId="c1" peritaje={peritaje()} />);
    expect(screen.getByText(/Pronóstico: falta completarlo/)).toBeTruthy();
  });

  it("un peritaje COMPLETADO no se sigue editando", () => {
    pintarConQuery(
      <FormularioPeritaje caseId="c1" peritaje={peritaje({ status: "COMPLETED", completedAt: "x" })} />,
    );
    expect((screen.getByRole("button", { name: "Guardar borrador" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Completado/)).toBeTruthy();
  });
});

function cita(over: Partial<Cita> = {}): Cita {
  return {
    id: "cita-1",
    caseId: "c1",
    status: "SCHEDULED",
    modality: "TELEMATIC",
    scheduledAt: "2026-09-15T14:00:00.000Z",
    durationMinutes: 30,
    timezone: "America/Santiago",
    meetingUrl: "https://meet.example.com/abc-defg-hij",
    doctorProfileId: null,
    coordinationNote: null,
    ...over,
  };
}

describe("panel de la cita", () => {
  it("el botón de unirse abre en otra pestaña SIN exponer la de origen", () => {
    pintarConQuery(<PanelCita cita={cita()} />);
    const enlace = screen.getByRole("link", { name: "Unirse a la reunión" }) as HTMLAnchorElement;
    expect(enlace.href).toBe("https://meet.example.com/abc-defg-hij");
    expect(enlace.target).toBe("_blank");
    // Sin `noopener`, la pestaña abierta puede reescribir la de origen — y la
    // de origen es una sesión clínica.
    expect(enlace.rel).toMatch(/noopener/);
    expect(enlace.rel).toMatch(/noreferrer/);
  });

  it("sin sala NO hay botón, y se dice por qué", () => {
    pintarConQuery(<PanelCita cita={cita({ meetingUrl: null })} />);
    expect(screen.queryByRole("link", { name: "Unirse a la reunión" })).toBeNull();
    expect(screen.getByText(/Lo carga coordinación/)).toBeTruthy();
  });

  it("la hora se muestra en la zona en que se ACORDÓ, no en otra", () => {
    // Convertirla a la del navegador daría dos horas distintas para la misma
    // cita según quién mire. La prueba no adivina el desfase de Chile —que
    // cambia con el horario de verano—: fija una zona sin ambigüedad y
    // comprueba que el mismo instante se lee distinto en otra.
    pintarConQuery(<PanelCita cita={cita({ timezone: "UTC" })} />);
    expect(screen.getByText("14:00")).toBeTruthy();

    cleanup();
    pintarConQuery(<PanelCita cita={cita({ timezone: "America/Santiago" })} />);
    expect(screen.queryByText("14:00")).toBeNull();
  });
});
