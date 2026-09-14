import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pintarConQuery } from "@/test/utils";
import { puedeAcceder } from "@/lib/roles";
import { OrientationReviewCard } from "./OrientationReviewCard";
import type { OrientationReview } from "@/lib/backend";

/**
 * EL FUNDAMENTO DE LA ORIENTACIÓN IA.
 *
 * Lo que congelan estas pruebas: se titula «Orientación IA» (nunca «Decisión
 * IA»), el título del texto depende de si la orientación es conclusiva, una
 * evidencia contradictoria no se presenta como sugerencia de un lado, y la
 * tarjeta no revienta cargando ni con un error. Además, nada de esto llega a
 * la experiencia del médico.
 *
 * Sin PII: los expedientes son sintéticos.
 */

const BASE: OrientationReview = {
  reportId: "00000000-0000-4000-8000-0000000000a1",
  caseId: "00000000-0000-4000-8000-0000000000c1",
  externalCaseId: "34200001",
  assessment: "RECOVERABLE",
  category: "RECOVERABLE_SUPPORTED",
  label: "Tratamiento activo con evolución favorable",
  rationale: "Consta tratamiento en curso con respuesta parcial documentada.",
  whatToReview: null,
  presentEvidence: ["Tratamiento", "Evolución"],
  missingEvidence: ["Pronóstico", "Evaluación funcional"],
  supportingSummary: ["Respuesta parcial al tratamiento"],
  opposingSummary: [],
  warnings: [],
  requiresClinicalReview: false,
  reviewFlags: [],
};

function responder(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_url: string) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function pintar(review: OrientationReview) {
  const fetchMock = responder(200, review);
  pintarConQuery(<OrientationReviewCard reportId={review.reportId} />);
  await waitFor(() => expect(screen.getByText("Orientación IA")).toBeDefined());
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OrientationReviewCard", () => {
  it("RECOVERABLE: título, insignia, «Fundamento IA» y el fundamento; pide el endpoint correcto", async () => {
    const fetchMock = await pintar(BASE);
    expect(screen.getByText("Recuperable")).toBeDefined();
    expect(screen.getByText("Fundamento IA")).toBeDefined();
    expect(screen.getByText(BASE.rationale)).toBeDefined();
    expect(screen.getByText("Ayuda de revisión: la decisión es del profesional.")).toBeDefined();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`/api/v1/reports/${BASE.reportId}/orientation-review`);
    expect(screen.queryByText(/Decisión IA/i)).toBeNull();
    expect(screen.queryByText(/Diagnóstico IA/i)).toBeNull();
  });

  it("IRRECOVERABLE: «No recuperable» y «Fundamento IA»", async () => {
    await pintar({ ...BASE, assessment: "IRRECOVERABLE", category: "IRRECOVERABLE_SUPPORTED" });
    expect(screen.getByText("No recuperable")).toBeDefined();
    expect(screen.getByText("Fundamento IA")).toBeDefined();
  });

  it("INDETERMINATE: «Motivo», el motivo y «Qué falta / qué revisar»", async () => {
    await pintar({
      ...BASE,
      assessment: "INDETERMINATE",
      category: "MISSING_CLINICAL_DOMAINS",
      rationale: "No constan evolución ni pronóstico.",
      whatToReview: "Revisar si existe informe de evolución reciente.",
    });
    expect(screen.getByText("Indeterminada")).toBeDefined();
    expect(screen.getByText("Motivo")).toBeDefined();
    expect(screen.queryByText("Fundamento IA")).toBeNull();
    expect(screen.getByText("No constan evolución ni pronóstico.")).toBeDefined();
    expect(screen.getByText("Qué falta / qué revisar")).toBeDefined();
    expect(screen.getByText("Revisar si existe informe de evolución reciente.")).toBeDefined();
  });

  it("evidencia contradictoria: «Requiere revisión médica» y ninguna sugerencia de un lado", async () => {
    await pintar({
      ...BASE,
      assessment: "INDETERMINATE",
      category: "CONTRADICTORY_EVIDENCE",
      rationale: "Los antecedentes apuntan en direcciones opuestas.",
      requiresClinicalReview: true,
      reviewFlags: ["CONTRADICTORY_EVIDENCE"],
    });
    expect(screen.getByText("Requiere revisión médica")).toBeDefined();
    expect(screen.queryByText("Recuperable")).toBeNull();
    expect(screen.queryByText("No recuperable")).toBeNull();
    expect(screen.queryByText(/Decisión IA/i)).toBeNull();
  });

  it("los elementos considerados están plegados y se despliegan", async () => {
    await pintar({ ...BASE, opposingSummary: ["Cronicidad superior a dos años"] });
    const boton = screen.getByRole("button", { name: "Ver elementos considerados" });
    expect(boton.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("A favor de recuperación")).toBeNull();

    fireEvent.click(boton);
    expect(screen.getByRole("button", { name: "Ocultar elementos considerados" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(screen.getByText("A favor de recuperación")).toBeDefined();
    expect(screen.getByText("Respuesta parcial al tratamiento")).toBeDefined();
    expect(screen.getByText("En contra")).toBeDefined();
    expect(screen.getByText("Evidencia que no consta")).toBeDefined();
    expect(screen.getByText("Pronóstico")).toBeDefined();
    // Listas vacías: no se pintan.
    expect(screen.queryByText("Advertencias")).toBeNull();
  });

  it("cargando no revienta", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    pintarConQuery(<OrientationReviewCard reportId={BASE.reportId} />);
    expect(screen.getByText("Cargando fundamento…")).toBeDefined();
  });

  it("un error se lee en cristiano y no revienta", async () => {
    responder(403, { error: { code: "FORBIDDEN", message: "No tiene permiso para ver esto." } });
    pintarConQuery(<OrientationReviewCard reportId={BASE.reportId} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    expect(screen.getByText(/No se pudo cargar el fundamento/)).toBeDefined();
    expect(screen.getByText(/No tiene permiso para ver esto\./)).toBeDefined();
  });

  it("campos ausentes no la rompen", async () => {
    const incompleto = { ...BASE, assessment: null } as Partial<OrientationReview>;
    delete incompleto.supportingSummary;
    delete incompleto.warnings;
    await pintar(incompleto as OrientationReview);
    expect(screen.getByText("Sin orientación")).toBeDefined();
    expect(screen.getByText("Motivo")).toBeDefined();
  });

  it("no se pide nada mientras no esté habilitada", () => {
    const fetchMock = responder(200, BASE);
    pintarConQuery(<OrientationReviewCard reportId={BASE.reportId} enabled={false} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Orientación IA · fuera de la experiencia del médico", () => {
  it("un médico no entra a Informes ni a Calidad", () => {
    expect(puedeAcceder("medico", "/admin/informes")).toBe(false);
    expect(puedeAcceder("medico", "/quality")).toBe(false);
    expect(puedeAcceder("admin", "/admin/informes")).toBe(true);
    expect(puedeAcceder("calidad", "/quality")).toBe(true);
  });

  it("ningún archivo de /mis-tramites usa el fundamento ni el motivo de orientación", () => {
    const raiz = resolve(__dirname, "../app/(app)/mis-tramites");
    const archivos: string[] = [];
    const recorrer = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) recorrer(p);
        else if (/\.(tsx?|jsx?)$/.test(n)) archivos.push(p);
      }
    };
    recorrer(raiz);
    expect(archivos.length).toBeGreaterThan(0);
    for (const f of archivos) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/OrientationReviewCard|orientationReason|orientation-review|useOrientationReview/);
    }
  });
});
