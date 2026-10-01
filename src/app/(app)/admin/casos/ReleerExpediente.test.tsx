import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { pintarConQuery } from "@/test/utils";
import { Casos } from "./Casos";
import type { OperationalCase } from "@/lib/backend";

/**
 * RELEER UN EXPEDIENTE MAL LEÍDO, DESDE ADMINISTRACIÓN → CASOS.
 *
 * POR QUÉ ESTÁ AQUÍ. La acción vivía sólo en Control previo, y esa pantalla salió
 * del menú cuando dejó de ser un paso del flujo. Pero reprocesar nunca fue eso:
 * es soporte técnico, y al quitar la pantalla se quedó sin ruta alcanzable el
 * único expediente que lo necesitaba —33361146, cuyo maestro declara 1 licencia y
 * del que se leyeron 22—.
 *
 * LO QUE SE CONGELA: que el botón aparece SÓLO cuando el expediente no se puede
 * trabajar, que lo que se ofrece reprocesar es lo que el servidor acepta, y que
 * llama al endpoint ya desplegado.
 *
 * Sin PII: todo sintético.
 */

const SCOPE = {
  contractCode: "INT_37",
  contractName: "Evaluaciones de salud irrecuperable · COMPIN Tarapacá",
  regionCode: "TARAPACA",
  regionName: "Región de Tarapacá",
};

function caso(extra: Partial<OperationalCase> = {}): OperationalCase {
  return {
    caseId: "00000000-0000-4000-8000-0000000000c1",
    scope: SCOPE,
    externalCaseId: "33361146",
    previousExternalCaseId: null,
    classification: "PENDING_REVIEW",
    hold: null,
    sourceDocument: null,
    status: "REPORT_GENERATED",
    statusChangedAt: "2026-09-28T15:24:42.000Z",
    discoveredAt: "2026-09-28T15:09:14.000Z",
    failureClass: null,
    analysisAttempts: 1,
    batch: { id: "00000000-0000-4000-8000-0000000000b1", name: "TARAPACA_ENTREGA_2", sequence: 2 },
    assignment: null,
    report: null,
    ...extra,
  } as OperationalCase;
}

const MAL_LEIDO = caso({ qa: { warningCount: 2, finalizationBlockerCount: 1, blocksMedicalWork: true } });
const SOLO_OBSERVACION = caso({
  caseId: "00000000-0000-4000-8000-0000000000c2",
  externalCaseId: "33346702",
  qa: { warningCount: 1, finalizationBlockerCount: 1, blocksMedicalWork: false },
});
const FIRMADO = caso({
  caseId: "00000000-0000-4000-8000-0000000000c3",
  externalCaseId: "33754938",
  classification: "SIGNED",
  qa: { warningCount: 3, finalizationBlockerCount: 2, blocksMedicalWork: true },
});

const HALLAZGO_RELEIBLE = {
  code: "SOURCE_LICENSE_COUNT_MISMATCH",
  statement: "La lectura trajo más licencias de las que el listado maestro declara.",
  evidence: "el documento declara 1 y la lectura trajo 22",
  severity: "BLOCKING",
  blocksMedicalWork: true,
  blocksFinalization: true,
  findingKey: "a".repeat(64),
  resolvedAt: null,
  resolutionNote: null,
};
const HALLAZGO_NO_RELEIBLE = {
  code: "MASTER_COVERAGE_UNVERIFIED",
  statement: "No se pudo comprobar cuántas licencias imprime el listado maestro.",
  evidence: "12 licencia(s) leídas",
  severity: "REVIEW_REQUIRED",
  blocksMedicalWork: false,
  blocksFinalization: true,
  findingKey: "b".repeat(64),
  resolvedAt: null,
  resolutionNote: null,
};

function backend(options: {
  casos: OperationalCase[];
  findings?: unknown[];
  reprocess?: () => { status: number; body: unknown };
}) {
  const envios: { url: string; method?: string }[] = [];
  const mock = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const u = String(url);
    envios.push({ url: u, method: init?.method });
    const json = (b: unknown, status = 200) =>
      new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (u.includes("/reprocess")) {
      const r = options.reprocess?.() ?? { status: 202, body: { caseId: MAL_LEIDO.caseId, jobId: "j1" } };
      return json(r.body, r.status);
    }
    if (u.match(/\/admin\/cases\/[^/]+\/qa$/)) return json({ findings: options.findings ?? [] });
    if (u.includes("/admin/cases")) return json({ cases: options.casos, total: options.casos.length });
    return json([]);
  });
  return { mock, envios };
}

async function pintar(options: Parameters<typeof backend>[0]) {
  const { mock, envios } = backend(options);
  vi.stubGlobal("fetch", mock);
  pintarConQuery(<Casos />);
  await waitFor(() => expect(screen.getByText(options.casos[0]?.externalCaseId ?? "—")).toBeDefined());
  return { mock, envios };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Administración → Casos · releer un expediente mal leído", () => {
  it("A · un expediente que NO se puede trabajar ofrece Reprocesar", async () => {
    await pintar({ casos: [MAL_LEIDO] });
    expect(screen.getByRole("button", { name: "Reprocesar" })).toBeDefined();
  });

  it("B · una observación que NO cierra el trabajo no lo ofrece", async () => {
    await pintar({ casos: [SOLO_OBSERVACION] });
    // Releer no traería un total que el documento no imprime: ofrecerlo mentiría.
    expect(screen.queryByRole("button", { name: "Reprocesar" })).toBeNull();
  });

  it("un expediente sin evaluar tampoco: «sin evaluar» no es «sin advertencias»", async () => {
    await pintar({ casos: [caso({ qa: null })] });
    expect(screen.queryByRole("button", { name: "Reprocesar" })).toBeNull();
  });

  it("D · al abrirlo pide el control previo de ESE expediente y ofrece el hallazgo releíble", async () => {
    const { envios } = await pintar({ casos: [MAL_LEIDO], findings: [HALLAZGO_RELEIBLE] });
    fireEvent.click(screen.getByRole("button", { name: "Reprocesar" }));

    await waitFor(() => expect(screen.getByTestId("releer-expediente")).toBeDefined());
    expect(envios.some((e) => e.url.endsWith(`/admin/cases/${MAL_LEIDO.caseId}/qa`))).toBe(true);
    expect(screen.getByText(/más licencias de las que el listado maestro declara/)).toBeDefined();
    expect(screen.getByText(/declara 1 y la lectura trajo 22/)).toBeDefined();
  });

  it("D2 · reprocesar llama al endpoint desplegado, con el findingKey", async () => {
    const { envios } = await pintar({ casos: [MAL_LEIDO], findings: [HALLAZGO_RELEIBLE] });
    fireEvent.click(screen.getByRole("button", { name: "Reprocesar" }));
    await waitFor(() => expect(screen.getByTestId("releer-expediente")).toBeDefined());

    const botones = screen.getAllByRole("button", { name: "Reprocesar" });
    fireEvent.click(botones[botones.length - 1] as HTMLElement);

    await waitFor(() =>
      expect(
        envios.some(
          (e) =>
            e.method === "POST" &&
            e.url === `/api/v1/admin/cases/${MAL_LEIDO.caseId}/qa/${HALLAZGO_RELEIBLE.findingKey}/reprocess`,
        ),
      ).toBe(true),
    );
  });

  it("dentro del panel, un hallazgo que NO se arregla releyendo no trae botón", async () => {
    await pintar({ casos: [MAL_LEIDO], findings: [HALLAZGO_NO_RELEIBLE] });
    fireEvent.click(screen.getByRole("button", { name: "Reprocesar" }));
    await waitFor(() => expect(screen.getByTestId("releer-expediente")).toBeDefined());

    expect(screen.getByText(/No hay ninguna advertencia que se arregle releyendo/)).toBeDefined();
    expect(screen.getByText(/NO se arreglan releyendo/)).toBeDefined();
    // NINGÚN «Reprocesar»: el de la fila se oculta al abrir el panel, y el panel
    // no ofrece ninguno porque este hallazgo no se arregla releyendo.
    expect(screen.queryAllByRole("button", { name: "Reprocesar" })).toHaveLength(0);
  });

  it("C · un expediente FIRMADO: el servidor lo rechaza y se lee en cristiano", async () => {
    await pintar({
      casos: [FIRMADO],
      findings: [HALLAZGO_RELEIBLE],
      reprocess: () => ({
        status: 422,
        body: {
          error: {
            code: "DOMAIN_RULE_VIOLATED",
            message: "Este expediente ya tiene un informe firmado emitido.",
            details: [],
          },
        },
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Reprocesar" }));
    await waitFor(() => expect(screen.getByTestId("releer-expediente")).toBeDefined());

    const botones = screen.getAllByRole("button", { name: "Reprocesar" });
    fireEvent.click(botones[botones.length - 1] as HTMLElement);

    await waitFor(() =>
      expect(screen.getByText(/ya tiene un informe firmado emitido/)).toBeDefined(),
    );
  });
});
