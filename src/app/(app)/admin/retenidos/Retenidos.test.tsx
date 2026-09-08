import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { pintarConQuery } from "@/test/utils";
import { Retenidos } from "./Retenidos";
import type { HeldCase } from "@/lib/backend";

/**
 * LA PANTALLA DESDE LA QUE SE LEVANTA UNA RETENCIÓN.
 *
 * Lo que estas pruebas congelan no es la maquetación: es que quien decide vea
 * las DOS dimensiones —la retención y el procesamiento—, que sepa ANTES de
 * pulsar qué va a pasar, y que no pueda levantar nada sin justificarlo.
 *
 * Sin PII: los expedientes son sintéticos.
 */
const CON_INFORME: HeldCase = {
  holdId: "00000000-0000-4000-8000-00000000h001".replace("h", "0"),
  caseId: "00000000-0000-4000-8000-00000000c001".replace("c", "0"),
  externalCaseId: "32895245",
  hold: { active: true, statement: "Retenido.", reason: "SOURCE_IDENTITY_CONFLICT" },
  detail: "Dos identidades detectadas en el expediente.",
  createdAt: "2026-09-07T12:17:45.000Z",
  doctor: { doctorProfileId: "d1", fullName: "Profesional de prueba" },
  report: { reportId: "r1", version: 1, workflowStatus: "READY_FOR_REVIEW" },
  processing: {
    caseStatus: "ANALYZED",
    failureClass: null,
    attempts: 5,
    lastRun: {
      runId: "run-1",
      trigger: "INITIAL_ANALYSIS",
      status: "COMPLETED",
      errorCode: null,
      errorMessage: null,
      createdAt: "2026-09-06T13:07:26.000Z",
      finishedAt: "2026-09-06T13:09:00.000Z",
    },
  },
  sourceDocument: { downloadUrl: "/api/v1/cases/x/source-document" },
  duplicates: [],
  classificationIfResolved: "PENDING_REVIEW",
};

const SIN_INFORME: HeldCase = {
  ...CON_INFORME,
  holdId: "00000000-0000-4000-8000-000000000002",
  caseId: "00000000-0000-4000-8000-000000000003",
  externalCaseId: "33313853",
  hold: { active: true, statement: "Retenido.", reason: "DUPLICATE_SOURCE_DOCUMENT" },
  detail: "Mismo contenido que otro expediente del lote.",
  report: null,
  processing: {
    caseStatus: "ANALYSIS_FAILED",
    failureClass: "TRANSIENT",
    attempts: 5,
    lastRun: {
      runId: "run-2",
      trigger: "INITIAL_ANALYSIS",
      status: "FAILED_TECHNICAL",
      errorCode: "PROVIDER_TRANSIENT",
      errorMessage: "AIProviderError",
      createdAt: "2026-09-04T19:56:03.000Z",
      finishedAt: null,
    },
  },
  duplicates: [{ caseId: "otro", externalCaseId: "34218380" }],
  classificationIfResolved: "NO_REPORT",
};

function backend(holds: HeldCase[], onResolve?: (url: string, body: unknown) => unknown) {
  return vi.fn(async (url: string, init?: { body?: string }) => {
    if (String(url).includes("/resolve")) {
      const cuerpo = onResolve?.(String(url), JSON.parse(init?.body ?? "{}")) ?? {
        holdStatus: "RESOLVED",
        operationalStatus: "PENDING_REVIEW",
        processingJobId: null,
      };
      return new Response(JSON.stringify(cuerpo), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ holds, total: holds.length }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

async function pintar(holds: HeldCase[], onResolve?: (url: string, body: unknown) => unknown) {
  const fetchMock = backend(holds, onResolve);
  vi.stubGlobal("fetch", fetchMock);
  pintarConQuery(<Retenidos />);
  await waitFor(() => expect(screen.getByText(holds[0]?.externalCaseId ?? "vacío")).toBeDefined());
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Retenidos · gestión administrativa", () => {
  it("muestra la retención y el procesamiento como dos cosas distintas", async () => {
    await pintar([SIN_INFORME]);

    expect(screen.getByText("Documento fuente duplicado")).toBeDefined();
    // Y el fallo técnico, que es OTRA dimensión: el proveedor de IA, no el duplicado.
    expect(screen.getByText(/PROVIDER_TRANSIENT/)).toBeDefined();
    expect(screen.getByText("Sin informe")).toBeDefined();
  });

  it("dice ANTES de pulsar qué va a pasar al levantarla", async () => {
    await pintar([CON_INFORME]);
    fireEvent.click(screen.getByRole("button", { name: /revisar/i }));

    expect(screen.getByText(/vuelve automáticamente a la bandeja del médico/i)).toBeDefined();
  });

  it("avisa de que un expediente sin informe NO llega al médico por levantarla", async () => {
    await pintar([SIN_INFORME]);
    fireEvent.click(screen.getByRole("button", { name: /revisar/i }));

    expect(screen.getByText(/NO lo envía al médico/i)).toBeDefined();
    // Y ofrece el reproceso, ya marcado: es lo que hace falta.
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  });

  it("no deja resolver sin motivo", async () => {
    await pintar([CON_INFORME]);
    fireEvent.click(screen.getByRole("button", { name: /revisar/i }));

    const boton = screen.getByRole("button", { name: /resolver retención/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText(/Qué se revisó/), { target: { value: "corto" } });
    expect((screen.getByRole("button", { name: /resolver retención/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("manda el motivo, y sin reproceso cuando el expediente ya tiene informe", async () => {
    const fetchMock = await pintar([CON_INFORME]);
    fireEvent.click(screen.getByRole("button", { name: /revisar/i }));
    fireEvent.change(screen.getByPlaceholderText(/Qué se revisó/), {
      target: { value: "Revisado el expediente original; se descarta el conflicto de identidad." },
    });
    fireEvent.click(screen.getByRole("button", { name: /resolver retención/i }));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
    const llamada = fetchMock.mock.calls.find((c) => String(c[0]).includes("/resolve"));
    const cuerpo = JSON.parse((llamada?.[1] as { body: string }).body) as Record<string, unknown>;
    expect(cuerpo.resolutionNote).toContain("se descarta el conflicto");
    expect(cuerpo.reprocess).toBeUndefined();
  });

  it("con expediente sin informe, el botón pide reprocesar y lo manda", async () => {
    const fetchMock = await pintar([SIN_INFORME], () => ({
      holdStatus: "RESOLVED",
      operationalStatus: "NO_REPORT",
      processingJobId: "00000000-0000-4000-8000-00000000job".replace("job", "001"),
    }));
    fireEvent.click(screen.getByRole("button", { name: /revisar/i }));
    fireEvent.change(screen.getByPlaceholderText(/Qué se revisó/), {
      target: { value: "Revisados los antecedentes; el duplicado no afecta a este trámite." },
    });
    fireEvent.click(screen.getByRole("button", { name: /resolver y reprocesar/i }));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
    const llamada = fetchMock.mock.calls.find((c) => String(c[0]).includes("/resolve"));
    expect(JSON.parse((llamada?.[1] as { body: string }).body).reprocess).toBe(true);
  });

  it("muestra los expedientes con el mismo contenido, como pista", async () => {
    await pintar([SIN_INFORME]);
    fireEvent.click(screen.getByRole("button", { name: /revisar/i }));

    expect(screen.getByText(/34218380.*pista para investigar, no una conclusión/)).toBeDefined();
  });

  it("«Mantener retenido» cierra el detalle sin mandar nada", async () => {
    const fetchMock = await pintar([CON_INFORME]);
    const llamadasIniciales = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /revisar/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /mantener retenido/i })[0] as HTMLElement);

    expect(screen.queryByPlaceholderText(/Qué se revisó/)).toBeNull();
    expect(fetchMock.mock.calls.length).toBe(llamadasIniciales);
  });

  it("ofrece los antecedentes de todos, incluidos los que no tienen informe", async () => {
    await pintar([SIN_INFORME]);
    const enlace = screen.getByRole("link", { name: /ver antecedentes/i }) as HTMLAnchorElement;
    expect(enlace.getAttribute("href")).toContain("/source-document");
  });

  it("sin retenciones lo dice, en vez de dejar una tabla muda", async () => {
    vi.stubGlobal("fetch", backend([]));
    pintarConQuery(<Retenidos />);
    await waitFor(() => expect(screen.getByText(/No hay expedientes retenidos/)).toBeDefined());
  });
});
