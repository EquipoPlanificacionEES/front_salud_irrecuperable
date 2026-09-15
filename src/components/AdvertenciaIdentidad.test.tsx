import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AdvertenciaIdentidad } from "./AdvertenciaIdentidad";
import type { IdentityWarning } from "@/lib/backend";

/**
 * ADVERTENCIA DE IDENTIDAD · visible antes de firmar, sin bloquear ni corregir.
 * Nombres con la forma de la Semana 9; sin RUT.
 */

const PRADA: IdentityWarning = {
  kind: "NAME_SPELLING_DIFFERS",
  severity: "REVIEW_WARNING",
  expectedName: "CONSTANZA BELEN PRADA VILLALOBOS",
  observedName: "PRIDA VILLALOBOS CONSTANZA BELÉN",
  rutMatch: true,
  source: "WEEK_SOURCE_WORKBOOK",
};

const MAS_COMPLETO: IdentityWarning = {
  ...PRADA,
  kind: "NAME_MORE_COMPLETE",
  severity: "INFORMATIONAL",
  expectedName: "FELIPE CARRASCO TORO",
  observedName: "CARRASCO TORO FELIPE EDUARDO",
};

afterEach(cleanup);

describe("AdvertenciaIdentidad", () => {
  it("diferencia de grafía con RUT coincidente: aviso visible con los dos nombres y la instrucción", () => {
    render(<AdvertenciaIdentidad warnings={[PRADA]} />);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText("Revisar nombre antes de firmar")).toBeDefined();
    expect(screen.getByText(/El RUT coincide con la fuente oficial/)).toBeDefined();
    expect(screen.getByText("CONSTANZA BELEN PRADA VILLALOBOS")).toBeDefined();
    expect(screen.getByText("PRIDA VILLALOBOS CONSTANZA BELÉN")).toBeDefined();
    expect(screen.getByText("Revise la grafía antes de firmar.")).toBeDefined();
  });

  it("un informe ya firmado lo muestra como constancia, sin pedir acción", () => {
    render(<AdvertenciaIdentidad warnings={[PRADA]} firmado />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Advertencia de identidad (informe ya firmado)")).toBeDefined();
    expect(screen.queryByText("Revise la grafía antes de firmar.")).toBeNull();
  });

  it("una diferencia sólo de formato es discreta: sin alerta", () => {
    render(<AdvertenciaIdentidad warnings={[MAS_COMPLETO]} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/difiere en formato/)).toBeDefined();
  });

  it("sin advertencias no pinta nada", () => {
    const { container } = render(<AdvertenciaIdentidad warnings={[]} />);
    expect(container.innerHTML).toBe("");
    const { container: sinCampo } = render(<AdvertenciaIdentidad warnings={undefined} />);
    expect(sinCampo.innerHTML).toBe("");
  });
});
