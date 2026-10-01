import { describe, expect, it } from "vitest";
import { TABS } from "./AdminTabs";

/**
 * LA NAVEGACIÓN DE ADMINISTRACIÓN.
 *
 * Se comprueba sobre la lista y no renderizando: `usePathname` exige el router de
 * Next, y lo que importa aquí es QUÉ pestañas hay, que es un dato, no una
 * interacción.
 */
describe("AdminTabs", () => {
  it("Control previo YA NO es una parada del flujo habitual", () => {
    expect(TABS.map((t) => t.href)).not.toContain("/admin/control-previo");
    expect(TABS.map((t) => t.etiqueta)).not.toContain("Control previo");
  });

  it("las pestañas operacionales siguen todas", () => {
    const etiquetas = TABS.map((t) => t.etiqueta);
    for (const esperada of [
      "Dashboard", "Semanas", "Asignaciones", "Reasignar",
      "Casos", "Retenidos", "Informes", "Exportaciones", "Usuarios",
    ]) {
      expect(etiquetas).toContain(esperada);
    }
  });
});
