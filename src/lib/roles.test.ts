import { describe, expect, it } from "vitest";
import { HOME_POR_ROL, esRol, rolPrincipal } from "./roles";

/**
 * El login navega al destino final usando el rol que ya viene en la respuesta de
 * `POST /auth/login`, en vez de ir a "/" y hacer que el servidor lo averigüe.
 * Esto fija esa traducción.
 */
describe("rolPrincipal", () => {
  it("traduce los roles del backend a los del front", () => {
    expect(rolPrincipal(["ADMIN"])).toBe("admin");
    expect(rolPrincipal(["DOCTOR"])).toBe("medico");
    expect(rolPrincipal(["QUALITY"])).toBe("calidad");
  });

  it("toma el primero que reconoce, e ignora lo que no conoce", () => {
    expect(rolPrincipal(["ALGO_NUEVO", "DOCTOR"])).toBe("medico");
    expect(rolPrincipal(["DOCTOR", "ADMIN"])).toBe("medico");
  });

  it("sin roles utilizables devuelve null, y entonces el login cae al camino largo", () => {
    expect(rolPrincipal([])).toBeNull();
    expect(rolPrincipal(undefined)).toBeNull();
    expect(rolPrincipal(["DESCONOCIDO"])).toBeNull();
  });

  it("todo rol reconocido tiene destino", () => {
    for (const r of ["ADMIN", "DOCTOR", "QUALITY"]) {
      const rol = rolPrincipal([r]);
      expect(rol).not.toBeNull();
      expect(HOME_POR_ROL[rol!]).toMatch(/^\//);
    }
  });

  it("esRol sigue distinguiendo lo que es un rol de lo que no", () => {
    expect(esRol("medico")).toBe(true);
    expect(esRol("DOCTOR")).toBe(false);
    expect(esRol(null)).toBe(false);
  });
});
