import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { KpiPanel } from "./KpiPanel";
import type { CaseClassification, OperationalCase } from "@/lib/backend";

/**
 * EL RESUMEN DEL MÉDICO TIENE QUE CUADRAR CON SU BANDEJA.
 *
 * El caso real: sobre los mismos 93 expedientes el resumen decía
 * «Por revisar 1 · En proceso 2 · Ratificados 90» y la bandeja mostraba
 * «Pendientes 0 · Retenidos 3 · Histórico 90». El resumen contaba por el estado
 * del informe e ignoraba la retención, así que repartía los tres retenidos por
 * dos categorías donde una retención no está.
 *
 * Sin PII: los expedientes son sintéticos.
 */
function caso(ref: string, classification: CaseClassification): OperationalCase {
  const conInforme = classification !== "NO_REPORT";
  return {
    caseId: `00000000-0000-4000-8000-${ref.padStart(12, "0")}`,
    externalCaseId: ref,
    classification,
    hold: classification === "HOLD" ? { active: true, statement: "Retenido." } : null,
    sourceDocument: null,
    status: "ANALYZED",
    statusChangedAt: "2026-09-01T10:00:00.000Z",
    discoveredAt: "2026-09-01T09:00:00.000Z",
    failureClass: null,
    analysisAttempts: 1,
    batch: null,
    assignment: {
      doctorProfileId: "d1",
      fullName: "Profesional",
      professionalCode: "SIS-1",
      assignedAt: "2026-09-01T10:00:00.000Z",
      assignmentRunId: null,
    },
    report: conInforme
      ? {
          reportId: `r-${ref}`,
          version: 1,
          // El retenido CON informe está READY_FOR_REVIEW: es exactamente el que
          // se colaba en «por revisar».
          workflowStatus: classification === "SIGNED" ? "SIGNED" : "READY_FOR_REVIEW",
          readinessStatus: "READY",
          orientationAssessment: null,
          signedAt: null,
        }
      : null,
  };
}

/** La forma REAL de producción: 90 firmados y 3 retenidos, uno con informe. */
const SEMANA_8: OperationalCase[] = [
  caso("32895245", "HOLD"),
  caso("33313853", "NO_REPORT"),
  caso("34218380", "NO_REPORT"),
  ...Array.from({ length: 90 }, (_, i) => caso(`9${String(i).padStart(6, "0")}`, "SIGNED")),
];
// Los dos sin informe están además retenidos: la categoría manda.
SEMANA_8[1]!.classification = "HOLD";
SEMANA_8[2]!.classification = "HOLD";

function responde(cases: OperationalCase[]) {
  return vi.fn(async () =>
    new Response(JSON.stringify({ cases, total: cases.length }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

async function pintar(cases: OperationalCase[]) {
  vi.stubGlobal("fetch", responde(cases));
  render(<KpiPanel rol="medico" nombre="Profesional" contrato="INT" />);
  await waitFor(() => expect(screen.getByText(/Asignados a ti/)).toBeDefined());
}

/** El valor que acompaña a una etiqueta del panel. */
function kpi(etiqueta: string): number {
  const label = screen.getByText(etiqueta);
  return Number(label.parentElement?.textContent?.replace(etiqueta, "").trim() ?? "-1");
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("KpiPanel · resumen del médico", () => {
  it("cuadra con la bandeja: los retenidos son retenidos y nada más", async () => {
    await pintar(SEMANA_8);

    expect(kpi("Asignados a ti")).toBe(93);
    expect(kpi("Por revisar")).toBe(0);
    expect(kpi("Retenidos")).toBe(3);
    expect(kpi("En proceso")).toBe(0);
    expect(kpi("Ratificados")).toBe(90);
  });

  it("un retenido NO se cuenta a la vez en «por revisar»", async () => {
    // Es el defecto exacto: tenía informe READY_FOR_REVIEW y se colaba ahí.
    await pintar([caso("1", "HOLD")]);

    expect(kpi("Retenidos")).toBe(1);
    expect(kpi("Por revisar")).toBe(0);
    expect(kpi("En proceso")).toBe(0);
  });

  it("un retenido sin informe NO se cuenta a la vez en «en proceso»", async () => {
    const sinInforme = caso("1", "NO_REPORT");
    sinInforme.classification = "HOLD";
    await pintar([sinInforme]);

    expect(kpi("Retenidos")).toBe(1);
    expect(kpi("En proceso")).toBe(0);
  });

  it("las categorías suman el total, sin solaparse", async () => {
    await pintar([
      caso("1", "PENDING_REVIEW"),
      caso("2", "HOLD"),
      caso("3", "NO_REPORT"),
      caso("4", "SIGNING"),
      caso("5", "SIGNED"),
    ]);

    const suma = kpi("Por revisar") + kpi("Retenidos") + kpi("En proceso") + kpi("Ratificados");
    expect(kpi("Asignados a ti")).toBe(5);
    expect(suma).toBe(5);
  });

  it("«en proceso» es lo que está en curso: sin informe todavía, o firmándose", async () => {
    await pintar([caso("1", "NO_REPORT"), caso("2", "SIGNING")]);
    expect(kpi("En proceso")).toBe(2);
  });

  it("una firma fallida aparece, en vez de perderse entre los ratificados", async () => {
    await pintar([caso("1", "SIGNING_FAILED"), caso("2", "SIGNED")]);

    expect(kpi("Error de firma")).toBe(1);
    expect(kpi("Ratificados")).toBe(1);
  });

  it("sin errores de firma, esa tarjeta no aparece", async () => {
    await pintar([caso("1", "SIGNED")]);
    expect(screen.queryByText("Error de firma")).toBeNull();
  });
});
