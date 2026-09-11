import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { pintarConQuery } from "@/test/utils";
import { FormularioAgendamiento } from "./FormularioAgendamiento";

const fetchMock = vi.fn();
afterEach(cleanup);
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  document.cookie = "sir_csrf=token";
});

function respuesta(cuerpo: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400, status, text: () => Promise.resolve(JSON.stringify(cuerpo)),
  } as Response);
}

const CITA = {
  id: "cita-1", caseId: "c1", status: "SCHEDULED", modality: "TELEMATIC",
  scheduledAt: "2026-09-15T14:00:00.000Z", durationMinutes: 30,
  timezone: "UTC", meetingUrl: null, doctorProfileId: null, coordinationNote: null,
};

describe("agendamiento desde coordinación", () => {
  it("sin cita previa, CREA", async () => {
    // GET devuelve null (no hay cita); el POST de creación devuelve la cita.
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === "POST" ? respuesta(CITA) : respuesta(null),
    );
    pintarConQuery(<FormularioAgendamiento caseId="c1" zona="UTC" />);

    await waitFor(() => expect(screen.getByText(/Sin agendar/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-09-15" } });
    fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "14:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar agendamiento" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => c[1]?.method === "POST");
      expect(post).toBeTruthy();
      // La hora escrita en la zona del contrato viaja en UTC.
      expect(JSON.parse(post![1].body).scheduledAt).toBe("2026-09-15T14:00:00.000Z");
    });
  });

  it("con cita previa, MODIFICA — y recupera lo guardado", async () => {
    fetchMock.mockImplementation(() => respuesta(CITA));
    pintarConQuery(<FormularioAgendamiento caseId="c1" zona="UTC" />);

    // Recupera: la fecha y la hora vuelven a leerse como se escribieron.
    await waitFor(() =>
      expect((screen.getByLabelText("Fecha") as HTMLInputElement).value).toBe("2026-09-15"),
    );
    expect((screen.getByLabelText("Hora") as HTMLInputElement).value).toBe("14:00");

    fireEvent.click(screen.getByRole("button", { name: "Guardar agendamiento" }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((c) => c[1]?.method === "PATCH");
      expect(patch).toBeTruthy();
      expect(patch![0]).toBe("/api/v1/appointments/cita-1");
    });
  });

  it("un enlace que no es https NO se puede guardar", async () => {
    fetchMock.mockImplementation(() => respuesta(null));
    pintarConQuery(<FormularioAgendamiento caseId="c1" zona="UTC" />);
    await waitFor(() => expect(screen.getByText(/Sin agendar/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Enlace de la sala"), {
      target: { value: "http://sala-sin-cifrar.example" },
    });

    // Una sala de teleconsulta sin cifrar no es un detalle de validación.
    expect(screen.getByText(/tiene que empezar por https/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Guardar agendamiento" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
