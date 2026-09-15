import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { pintarConQuery } from "@/test/utils";
import { Bandeja } from "./Bandeja";
import { olvidarInicios } from "@/lib/inicio-revision";
import type { OperationalCase } from "@/lib/backend";

/**
 * «REVISAR» DECLARA EL INICIO DE LA REVISIÓN MÉDICA, SIN BLOQUEAR AL MÉDICO.
 *
 * El conteo real (una vez por asignación, doble clic, médico no asignado) lo
 * garantiza el servidor y lo prueban sus pruebas de integración. Aquí se fija
 * lo que hace la pantalla: sólo «Revisar» lo envía, con CSRF, sin repetir, y
 * un fallo no impide entrar al expediente. Sin PII.
 */

vi.mock("next/link", () => ({
  default: ({ children, href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) => (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
    >
      {children}
    </a>
  ),
}));

function caso(id: string, classification: "PENDING_REVIEW" | "SIGNED"): OperationalCase {
  return {
    caseId: `00000000-0000-4000-8000-${id.padStart(12, "0")}`,
    externalCaseId: id,
    previousExternalCaseId: null,
    classification,
    hold: null,
    sourceDocument: null,
    status: "ANALYZED",
    statusChangedAt: "2026-09-01T10:00:00.000Z",
    discoveredAt: "2026-09-01T09:00:00.000Z",
    failureClass: null,
    analysisAttempts: 1,
    batch: { id: "b1", name: "Semana 9", sequence: 9 },
    assignment: { doctorProfileId: "d1", fullName: "Profesional", professionalCode: "SIS-1", assignedAt: "2026-09-01T10:00:00.000Z", assignmentRunId: null },
    report: {
      reportId: `r-${id}`,
      version: 1,
      workflowStatus: classification === "SIGNED" ? "SIGNED" : "READY_FOR_REVIEW",
      readinessStatus: "READY",
      orientationAssessment: "RECOVERABLE",
      signedAt: null,
    },
  } as OperationalCase;
}

const CASOS = [caso("101", "PENDING_REVIEW"), caso("202", "SIGNED")];

function servidor(inicio: (url: string) => Response | Promise<Response>) {
  return vi.fn(async (url: string) => {
    if (String(url).includes("/medical-review/start")) return inicio(String(url));
    if (String(url).includes("/inbox")) {
      return new Response(JSON.stringify({ cases: CASOS, total: CASOS.length }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
}
const ok = () =>
  new Response(JSON.stringify({ caseId: "x", assignmentId: "y", startedAt: "2026-09-15T13:00:00.000Z", created: true }), { status: 200 });

async function pintar(fetchMock: ReturnType<typeof servidor>) {
  vi.stubGlobal("fetch", fetchMock);
  pintarConQuery(<Bandeja />);
  await waitFor(() => expect(screen.getByText("101")).toBeDefined());
}
const inicios = (m: ReturnType<typeof servidor>) => m.mock.calls.filter((c) => String(c[0]).includes("/medical-review/start"));

beforeEach(() => {
  olvidarInicios();
  document.cookie = "sir_csrf=token-de-prueba";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Bandeja · «Revisar» inicia la revisión médica", () => {
  it("A · pulsar «Revisar» envía POST /cases/:id/medical-review/start con CSRF", async () => {
    const m = servidor(ok);
    await pintar(m);
    fireEvent.click(screen.getByRole("link", { name: "Revisar" }));
    await waitFor(() => expect(inicios(m)).toHaveLength(1));
    const [url, init] = inicios(m)[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/v1/cases/${CASOS[0]?.caseId}/medical-review/start`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-csrf-token"]).toBe("token-de-prueba");
    expect(init.keepalive).toBe(true);
  });

  it("B/C · volver a pulsar o doble clic no repite la llamada en la sesión", async () => {
    const m = servidor(ok);
    await pintar(m);
    const enlace = screen.getByRole("link", { name: "Revisar" });
    fireEvent.click(enlace);
    fireEvent.click(enlace);
    await waitFor(() => expect(inicios(m)).toHaveLength(1));
    fireEvent.click(enlace);
    await new Promise((r) => setTimeout(r, 10));
    expect(inicios(m)).toHaveLength(1);
  });

  it("«Ver» en el histórico NO inicia revisión", async () => {
    const m = servidor(ok);
    await pintar(m);
    fireEvent.click(screen.getByRole("button", { name: /histórico/i }));
    fireEvent.click(screen.getByRole("link", { name: "Ver" }));
    await new Promise((r) => setTimeout(r, 10));
    expect(inicios(m)).toHaveLength(0);
  });

  it("un fallo técnico no bloquea al médico y el siguiente «Revisar» lo reintenta", async () => {
    let intentos = 0;
    const m = servidor(() => {
      intentos++;
      if (intentos === 1) throw new TypeError("sin red");
      return ok();
    });
    await pintar(m);
    const enlace = screen.getByRole("link", { name: "Revisar" });
    expect(() => fireEvent.click(enlace)).not.toThrow();
    await waitFor(() => expect(intentos).toBe(1));
    // Sigue en pantalla, sin error visible por la medición.
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(enlace);
    await waitFor(() => expect(intentos).toBe(2));
  });
});
