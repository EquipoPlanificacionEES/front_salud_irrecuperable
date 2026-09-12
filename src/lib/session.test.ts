import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DE DÓNDE SALE «DÓNDE ESTOY».
 *
 * Aquí está el defecto que llegó a producción, y por qué ninguna prueba lo
 * atrapó: el componente del selector era correcto: pintaba fielmente el ámbito
 * que le pasaran. Lo que estaba mal era el dato que le llegaba — el contrato
 * de ORIGEN de la cuenta, que no se mueve al cambiar de región.
 *
 * Un defecto de CABLEADO no se ve probando los extremos. Por eso la prueba va
 * justo aquí, en la traducción de la respuesta del backend.
 */

const BACKEND = "https://backend.example.org";

function respuesta(body: unknown) {
  return { ok: true, json: () => Promise.resolve(body) } as Response;
}

const ME = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "persona@example.org",
  displayName: "Persona",
  roles: ["ADMIN"],
  tenant: { contractId: "c-origen", contractName: "Contrato de origen" },
  scopes: [],
  doctorProfile: null,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  process.env["BACKEND_URL"] = BACKEND;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

async function verificar(body: unknown) {
  fetchMock.mockResolvedValue(respuesta(body));
  const { verificarSesion } = await import("./session");
  return verificarSesion("cookie-de-sesion");
}

describe("traducción de /auth/me", () => {
  it("el ámbito ACTIVO manda sobre el contrato de origen", async () => {
    const s = await verificar({
      ...ME,
      activeScope: { contractId: "c-maule", regionId: "r-maule" },
    });

    // Esto es lo que el selector pinta.
    expect(s?.activoContractId).toBe("c-maule");
    expect(s?.activoRegionId).toBe("r-maule");
    // Y el de origen sigue siendo el de origen: son dos cosas distintas.
    expect(s?.contratoId).toBe("c-origen");
  });

  it("sin ámbito elegido, el efectivo ES el de origen", async () => {
    const s = await verificar({
      ...ME,
      activeScope: { contractId: "c-origen", regionId: null },
    });

    expect(s?.activoContractId).toBe("c-origen");
    expect(s?.activoRegionId).toBeNull();
  });

  it("contra un backend que todavía NO publica activeScope, se usa el de origen", async () => {
    // Durante el despliegue el backend viejo puede seguir respondiendo. Antes
    // que romper, esta versión se comporta como la anterior.
    const s = await verificar(ME);

    expect(s?.activoContractId).toBe("c-origen");
    expect(s?.activoRegionId).toBeNull();
  });
});
