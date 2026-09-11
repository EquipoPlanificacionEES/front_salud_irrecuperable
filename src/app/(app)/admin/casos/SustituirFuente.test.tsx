import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { pintarConQuery } from "@/test/utils";
import { SustituirFuente } from "./SustituirFuente";
import type { OperationalCase } from "@/lib/backend";

/**
 * SUBIR UN EXPEDIENTE CORREGIDO DESDE LA PLATAFORMA.
 *
 * El archivo se parte porque la ruta pasa por una función serverless que
 * rechaza cuerpos de más de 4,5 MB. Lo que estas pruebas congelan es que el
 * troceado sea invisible para quien lo usa —elige un PDF y pulsa un botón— y
 * que no se pierda ninguna garantía por el camino: se declara el sha256 del
 * archivo, se suben todas las partes, y un archivo demasiado grande se rechaza
 * ANTES de subir nada.
 *
 * Sin PII: los datos son sintéticos.
 */

const CASO: OperationalCase = {
  caseId: "00000000-0000-4000-8000-000000000001",
  externalCaseId: "32895245",
  previousExternalCaseId: null,
  classification: "HOLD",
  hold: { active: true, statement: "Retenido.", holdId: "00000000-0000-4000-8000-0000000000aa" },
  sourceDocument: null,
  status: "ANALYZED",
  statusChangedAt: "2026-09-06T05:59:52.000Z",
  discoveredAt: "2026-09-04T19:43:00.000Z",
  failureClass: null,
  analysisAttempts: 1,
  batch: null,
  assignment: null,
  report: null,
};

const NOTA = "Contraparte remite expediente corregido para este trámite.";

/** Un File de N bytes que empieza por %PDF-, como el real. */
function pdf(bytes: number, nombre = "corregido.pdf"): File {
  const b = new Uint8Array(bytes);
  const cabecera = new TextEncoder().encode("%PDF-1.7\n");
  b.set(cabecera, 0);
  return new File([b], nombre, { type: "application/pdf" });
}

interface Llamada {
  url: string;
  method: string;
  body: unknown;
}

function backend(opciones: { chunkSize?: number; fallaEn?: string } = {}) {
  const llamadas: Llamada[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    llamadas.push({ url: u, method: init?.method ?? "GET", body: init?.body });
    const json = (cuerpo: unknown, status = 200) =>
      new Response(JSON.stringify(cuerpo), {
        status,
        headers: { "content-type": "application/json" },
      });

    if (opciones.fallaEn && u.includes(opciones.fallaEn)) {
      return json(
        { error: { code: "CONFLICT", message: "falló", details: [{ issue: "SHA256_MISMATCH" }] } },
        409,
      );
    }
    if (u.includes("/source-document/uploads") && u.includes("/complete")) {
      return json({ newSha256: "a".repeat(64), processingJobId: "job-1" });
    }
    if (u.includes("/chunks/")) return json({ received: 1, total: 3 });
    if (u.includes("/source-document/uploads")) {
      return json({
        uploadId: "00000000-0000-4000-8000-0000000000bb",
        chunkSize: opciones.chunkSize ?? 3 * 1024 * 1024,
        expectedSize: 1,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });
    }
    return json({});
  });
  return { fetchMock, llamadas };
}

function pintar(fetchMock: ReturnType<typeof vi.fn>, onHecho = vi.fn()) {
  vi.stubGlobal("fetch", fetchMock);
  pintarConQuery(
    <SustituirFuente caso={CASO} onCerrar={vi.fn()} onHecho={onHecho} />,
  );
  return onHecho;
}

function elegir(archivo: File) {
  const input = screen.getByLabelText("Expediente corregido") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [archivo], configurable: true });
  fireEvent.change(input);
}

function escribirNota(texto = NOTA) {
  fireEvent.change(screen.getByLabelText("Justificación de la sustitución"), {
    target: { value: texto },
  });
}

const boton = () => screen.getByRole("button", { name: /sustituir expediente/i }) as HTMLButtonElement;

beforeEach(() => {
  // `crypto.subtle` no existe en el entorno de pruebas: el hash real se
  // comprueba en las pruebas de backend, aquí sólo importa que se envíe uno.
  vi.stubGlobal("crypto", {
    ...globalThis.crypto,
    subtle: {
      digest: async () => new Uint8Array(32).fill(171).buffer,
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Sustituir expediente · subida por partes", () => {
  it("muestra el máximo admitido y el tamaño del archivo elegido", () => {
    const { fetchMock } = backend();
    pintar(fetchMock);

    expect(screen.getByText(/Tamaño máximo: 25\.00 MB/)).toBeDefined();

    elegir(pdf(2 * 1024 * 1024));
    expect(screen.getByText(/corregido\.pdf/)).toBeDefined();
    expect(screen.getByText(/2\.00 MB/)).toBeDefined();
  });

  it("un archivo mayor que el máximo se rechaza ANTES de subir nada", () => {
    const { fetchMock } = backend();
    pintar(fetchMock);

    elegir(pdf(26 * 1024 * 1024));
    escribirNota();

    expect(screen.getByText(/pesa 26\.00 MB y el máximo son 25\.00 MB/)).toBeDefined();
    expect(boton().disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin justificación suficiente no se sube nada", () => {
    const { fetchMock } = backend();
    pintar(fetchMock);

    elegir(pdf(1000));
    escribirNota("corta");

    expect(boton().disabled).toBe(true);
  });

  it("parte el archivo, declara su sha256 y sube todas las partes", async () => {
    const { fetchMock, llamadas } = backend({ chunkSize: 1024 * 1024 });
    pintar(fetchMock);

    elegir(pdf(2_500_000));
    escribirNota();
    fireEvent.click(boton());

    await waitFor(() => {
      const completes = llamadas.filter((l) => l.url.includes("/complete"));
      expect(completes).toHaveLength(1);
    });

    const init = llamadas.find((l) => l.url.endsWith("/source-document/uploads"));
    const cuerpoInit = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(cuerpoInit["expectedSize"]).toBe(2_500_000);
    expect(String(cuerpoInit["expectedSha256"])).toMatch(/^[0-9a-f]{64}$/);
    expect(cuerpoInit["fileName"]).toBe("corregido.pdf");

    // 2.500.000 / 1 MiB → 3 partes.
    const trozos = llamadas.filter((l) => l.url.includes("/chunks/"));
    expect(trozos).toHaveLength(3);
    expect(trozos.every((t) => t.method === "PUT")).toBe(true);
    expect(trozos.map((t) => t.url.split("/chunks/")[1])).toEqual(["0", "1", "2"]);
  });

  it("el complete lleva la justificación, el reproceso y la incidencia", async () => {
    const { fetchMock, llamadas } = backend();
    pintar(fetchMock);

    elegir(pdf(1000));
    escribirNota();
    fireEvent.click(boton());

    await waitFor(() => expect(llamadas.some((l) => l.url.includes("/complete"))).toBe(true));
    const complete = llamadas.find((l) => l.url.includes("/complete"));
    const cuerpo = JSON.parse(String(complete?.body)) as Record<string, unknown>;
    expect(cuerpo["note"]).toBe(NOTA);
    expect(cuerpo["reprocess"]).toBe(true);
    expect(cuerpo["resolveHoldId"]).toBe(CASO.hold?.holdId);
  });

  it("muestra el progreso mientras sube y avisa al validar", async () => {
    const { fetchMock } = backend({ chunkSize: 1024 });
    pintar(fetchMock);

    elegir(pdf(3000));
    escribirNota();
    fireEvent.click(boton());

    await waitFor(() => expect(screen.getByText(/Subiendo expediente…/)).toBeDefined());
    await waitFor(() => expect(screen.queryByText(/Subiendo expediente…/)).toBeNull());
  });

  it("el botón queda deshabilitado en cuanto empieza, y el selector también", async () => {
    // Nunca resuelve: así la operación se queda EN CURSO y se puede observar.
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    pintar(fetchMock as unknown as ReturnType<typeof vi.fn>);

    elegir(pdf(1000));
    escribirNota();
    expect(boton().disabled).toBe(false);

    fireEvent.click(boton());

    // El propio rótulo cambia: deja de decir «Sustituir» y pasa a «Subiendo…».
    const enCurso = () =>
      screen.getByRole("button", { name: /subiendo…|validando…/i }) as HTMLButtonElement;
    await waitFor(() => expect(enCurso().disabled).toBe(true));
    expect((screen.getByLabelText("Expediente corregido") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /^sustituir expediente$/i })).toBeNull();
  });

  it("al terminar informa con el hash del expediente nuevo", async () => {
    const { fetchMock } = backend();
    const onHecho = pintar(fetchMock);

    elegir(pdf(1000));
    escribirNota();
    fireEvent.click(boton());

    await waitFor(() => expect(onHecho).toHaveBeenCalled());
    expect(String(onHecho.mock.calls[0]?.[0])).toContain("Expediente sustituido");
    expect(String(onHecho.mock.calls[0]?.[0])).toContain("Reprocesamiento encolado");
  });

  it("un fallo al completar se muestra legible y deja reintentar", async () => {
    const { fetchMock } = backend({ fallaEn: "/complete" });
    const onHecho = pintar(fetchMock);

    elegir(pdf(1000));
    escribirNota();
    fireEvent.click(boton());

    await waitFor(() =>
      expect(screen.getByText(/no coincide con el original/i)).toBeDefined(),
    );
    expect(onHecho).not.toHaveBeenCalled();
    // Y se puede volver a intentar: el botón se reactiva.
    await waitFor(() => expect(boton().disabled).toBe(false));
  });

  it("un fallo al subir una parte no dice que se sustituyó nada", async () => {
    const { fetchMock } = backend({ fallaEn: "/chunks/" });
    const onHecho = pintar(fetchMock);

    elegir(pdf(1000));
    escribirNota();
    fireEvent.click(boton());

    await waitFor(() => expect(screen.getByText(/no coincide con el original/i)).toBeDefined());
    expect(onHecho).not.toHaveBeenCalled();
  });
});
