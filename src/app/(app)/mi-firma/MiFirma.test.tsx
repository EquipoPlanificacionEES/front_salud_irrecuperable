import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pintarConQuery } from "@/test/utils";
import { MiFirma } from "./MiFirma";

/**
 * «MI FIRMA» ENSEÑA LA FIRMA COMO SE IMPRIME.
 *
 * Lo que se fija: la vista previa sale del endpoint que sirve la representación
 * derivada por el worker (la misma del informe), se espera mientras responde
 * 202, y la imagen original ya no se guarda en el navegador.
 *
 * Sin firmas reales: los bytes son un PNG de un píxel.
 */

const ESTADO = {
  doctorProfileId: "00000000-0000-4000-8000-0000000d0c7a",
  hasActiveSignature: true,
  totalVersions: 2,
  signature: {
    id: "00000000-0000-4000-8000-00000000f1a1",
    version: 2,
    status: "ACTIVE",
    mimeType: "image/jpeg",
    width: 1600,
    height: 1208,
    fileSize: 180000,
    updatedAt: "2026-09-10T12:00:00.000Z",
  },
};

const PNG_1PX = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:firma-impresa"), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

describe("MiFirma · vista previa de impresión", () => {
  it("pide la representación derivada, espera el 202 y muestra la que se imprime", async () => {
    let renders = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/v1/doctors/me/signature") return json(200, ESTADO);
      if (url === "/api/v1/doctors/me/signature/render") {
        renders++;
        if (renders === 1) return json(202, { status: "PENDING", retryAfterSeconds: 1 });
        return new Response(PNG_1PX, { status: 200, headers: { "content-type": "image/png" } });
      }
      return json(404, { error: { message: "no" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    pintarConQuery(<MiFirma />);
    expect(await screen.findByText("Preparando la vista previa…")).toBeDefined();
    const img = (await screen.findByAltText("Tu firma tal como se imprime", {}, { timeout: 3000 })) as HTMLImageElement;
    expect(img.src).toBe("blob:firma-impresa");
    expect(renders).toBe(2);
    expect(screen.getByText("Así se imprime en el informe")).toBeDefined();
    expect(screen.getByText("Los cuadros son la parte transparente")).toBeDefined();
  });

  it("borra la copia local de la firma original que dejaban versiones anteriores", async () => {
    localStorage.setItem("firma:u-1", "data:image/png;base64,AAAA");
    localStorage.setItem("otra-cosa", "se queda");
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { ...ESTADO, hasActiveSignature: false, signature: null })));
    pintarConQuery(<MiFirma />);
    await waitFor(() => expect(localStorage.getItem("firma:u-1")).toBeNull());
    expect(localStorage.getItem("otra-cosa")).toBe("se queda");
  });

  it("si la vista previa falla lo dice, sin romper la pantalla", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/render") ? json(500, { error: { message: "x" } }) : json(200, ESTADO),
      ),
    );
    pintarConQuery(<MiFirma />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/No se pudo cargar la vista previa/);
    expect(screen.getByText("Versión 2")).toBeDefined();
  });

  it("la pantalla ya no escribe la firma en localStorage", () => {
    const src = readFileSync(resolve(__dirname, "MiFirma.tsx"), "utf8");
    expect(src).not.toMatch(/localStorage\.setItem/);
  });
});
