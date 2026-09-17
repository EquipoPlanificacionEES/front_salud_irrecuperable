import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { pintarConQuery } from "@/test/utils";
import type { ExportJob, ExportPreflight } from "@/lib/backend";
import { disponibles, Exportaciones } from "./Exportaciones";

/**
 * DESCARGA MASIVA SEMANAL EN WORD Y EN PDF.
 *
 * Lo que se congela: dos botones independientes; el recuento del servidor
 * debajo de cada uno, sin decir «disponibles» cuando faltan; que pedir uno no
 * bloquee el otro; y que al terminar el aviso diga cuántos faltan en vez de dar
 * la descarga por completa. Sin PII: todo sintético.
 */

const LOTE = "00000000-0000-4000-8000-00000000ba09";

function previo(pdfReady: number, total = 93): ExportPreflight {
  const faltan = total - pdfReady;
  return {
    totalCases: total,
    currentSigned: total,
    noSignedReport: 0,
    word: { ready: total },
    pdf: { ready: pdfReady, failed: faltan, pending: 0, missing: 0 },
    pdfUnavailable: Array.from({ length: faltan }, (_, i) => ({ externalCaseId: `3396${i}`, status: "FAILED" as const })),
  };
}

function trabajo(extra: Partial<ExportJob>): ExportJob {
  return {
    id: "00000000-0000-4000-8000-0000000e0001",
    type: "SIGNED_REPORTS_ZIP",
    status: "PENDING",
    filters: { batchId: LOTE },
    format: "PDF",
    unavailableItems: 2,
    totalItems: 91,
    processedItems: 0,
    progressPercent: 0,
    createdAt: "2026-09-17T15:00:00.000Z",
    completedAt: null,
    expiresAt: null,
    downloadAvailable: false,
    fileSize: null,
    error: null,
    ...extra,
  };
}

/** Un backend mínimo: una semana, el recuento, el listado de exportaciones y el POST. */
function backend(opciones: { previo: ExportPreflight; trabajos?: () => ExportJob[] }) {
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/admin/batches")) {
      return json({
        batches: [
          {
            batch: { id: LOTE, name: "SEMANA_09_2026", sequence: 9, status: "OPEN" },
            summary: { totalCases: 93, classification: { SIGNED: 93 } },
          },
        ],
      });
    }
    if (u.includes("/admin/doctor-workload")) return json({ doctors: [] });
    if (u.includes("/exports/preflight")) return json(opciones.previo);
    if (u.endsWith("/exports") && init?.method === "POST") return json(trabajo({}), 202);
    if (u.includes("/exports?")) return json({ exports: opciones.trabajos?.() ?? [] });
    return json({});
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Exportaciones · ZIP Word y ZIP PDF", () => {
  it("«N disponibles» sólo si están todos", () => {
    expect(disponibles(93, 93)).toBe("93 disponibles");
    expect(disponibles(91, 93)).toBe("91 de 93 disponibles");
  });

  it("todos disponibles: dos botones, y el recuento de cada formato", async () => {
    vi.stubGlobal("fetch", backend({ previo: previo(93) }));
    pintarConQuery(<Exportaciones />);

    await waitFor(() => expect(screen.getByText(/PDF:/)).toBeDefined());
    expect(screen.getByRole("button", { name: "Descargar ZIP Word" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Descargar ZIP PDF" })).toBeDefined();
    expect(screen.getByText(/Word:/).parentElement?.textContent).toBe("Word: 93 disponibles");
    expect(screen.getByText(/PDF:/).parentElement?.textContent).toBe("PDF: 93 disponibles");
    expect(screen.queryByText(/listado de los PDF no disponibles/)).toBeNull();
  });

  it("faltan PDF: «91 de 93 disponibles» y aviso de que irán listados", async () => {
    vi.stubGlobal("fetch", backend({ previo: previo(91) }));
    pintarConQuery(<Exportaciones />);

    await waitFor(() => expect(screen.getByText(/PDF:/).parentElement?.textContent).toBe("PDF: 91 de 93 disponibles"));
    expect(screen.getByText("Se incluirá un listado de los PDF no disponibles.")).toBeDefined();
  });

  it("sin ningún PDF listo, el botón PDF no se ofrece activo; el Word sí", async () => {
    vi.stubGlobal("fetch", backend({ previo: previo(0) }));
    pintarConQuery(<Exportaciones />);

    await waitFor(() => expect(screen.getByText("Ningún PDF disponible en este alcance.")).toBeDefined());
    expect((screen.getByRole("button", { name: "Descargar ZIP PDF" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Descargar ZIP Word" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("pedir el PDF manda format=pdf, muestra su carga y NO bloquea el Word; al quedar listo baja solo y dice cuántos faltan", async () => {
    let listo = false;
    const fetchMock = backend({
      previo: previo(91),
      trabajos: () => [trabajo(listo ? { status: "READY", downloadAvailable: true, processedItems: 91, progressPercent: 100 } : {})],
    });
    vi.stubGlobal("fetch", fetchMock);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    pintarConQuery(<Exportaciones />);

    await waitFor(() => expect(screen.getByText(/PDF:/).parentElement?.textContent).toBe("PDF: 91 de 93 disponibles"));
    fireEvent.click(screen.getByRole("button", { name: /^SEMANA_09_2026/ }));
    // Elegir la semana vuelve a contar para ese alcance: se espera al recuento.
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Descargar ZIP PDF" }) as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Descargar ZIP PDF" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Preparando ZIP PDF…" })).toBeDefined());
    const word = screen.getByRole("button", { name: "Descargar ZIP Word" }) as HTMLButtonElement;
    expect(word.disabled).toBe(false);

    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "POST");
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({
      type: "SIGNED_REPORTS_ZIP",
      format: "pdf",
      filters: { batchId: LOTE },
    });

    listo = true;
    await waitFor(() => expect(click).toHaveBeenCalled(), { timeout: 6000 });
    expect(screen.getByText(/ZIP PDF descargado: 91 PDF\. Faltan 2; van listados en PDF_NO_DISPONIBLES\.csv/)).toBeDefined();
    expect(screen.queryByText(/completa/i)).toBeNull();
    // Y la fila del historial dice formato y lo que falta.
    expect(screen.getByText(/2 no disponible\(s\), listado incluido/)).toBeDefined();
    expect(screen.getByRole("link", { name: "Descargar ZIP PDF" }).getAttribute("href")).toBe(
      "/api/v1/exports/00000000-0000-4000-8000-0000000e0001/download",
    );
  }, 10_000);

  it("una exportación antigua, sin formato, se muestra como Word", async () => {
    vi.stubGlobal(
      "fetch",
      backend({
        previo: previo(93),
        trabajos: () => [
          { ...trabajo({ status: "READY", downloadAvailable: true }), format: undefined, unavailableItems: undefined },
        ],
      }),
    );
    pintarConQuery(<Exportaciones />);
    await waitFor(() => expect(screen.getByRole("link", { name: "Descargar ZIP Word" })).toBeDefined());
  });
});
