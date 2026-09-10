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
  opciones: { conInforme?: boolean; retenido?: boolean } = {},
): OperationalCase {
  const conInforme = opciones.conInforme ?? classification !== "NO_REPORT";
  return {
    caseId: `00000000-0000-4000-8000-${externalCaseId.padStart(12, "0")}`,
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
