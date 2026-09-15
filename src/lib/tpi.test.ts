import { describe, expect, it } from "vitest";
import { describirEtapaTpi, ETAPAS_TPI } from "./tpi";

/**
 * EL TPI SE LEE EN LENGUA, IGUAL QUE EN EL INFORME.
 *
 * Las etiquetas son las de `describeTpiStage` (backend). Si esta prueba cambia,
 * tiene que cambiar allí también: el editor y el documento no pueden decir cosas
 * distintas del mismo dato.
 */
describe("describirEtapaTpi", () => {
  it("A · NO_TPI → «No»", () => {
    expect(describirEtapaTpi("NO_TPI")).toBe("No");
  });

  it.each([
    ["IN_PROGRESS", "En trámite"],
    ["FINAL_EXECUTED", "Ejecutoriado"],
    ["UNKNOWN", "No consta en el expediente"],
  ])("B · %s → «%s»", (codigo, etiqueta) => {
    expect(describirEtapaTpi(codigo)).toBe(etiqueta);
  });

  it("cubre exactamente los cuatro valores de TpiStage, todos con etiqueta humana", () => {
    expect(Object.keys(ETAPAS_TPI).sort()).toEqual(["FINAL_EXECUTED", "IN_PROGRESS", "NO_TPI", "UNKNOWN"]);
    for (const etiqueta of Object.values(ETAPAS_TPI)) expect(etiqueta).not.toMatch(/^[A-Z_]+$/);
  });

  it("vacío sigue vacío y un valor no reconocido no se inventa", () => {
    expect(describirEtapaTpi("")).toBe("");
    expect(describirEtapaTpi(null)).toBe("");
    expect(describirEtapaTpi("toString")).toBe("toString");
  });
});
