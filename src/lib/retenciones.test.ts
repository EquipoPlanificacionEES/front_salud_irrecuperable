import { describe, expect, it } from "vitest";
import { MOTIVOS_RETENCION, presentarMotivoRetencion } from "./retenciones";

/**
 * MOTIVOS DE RETENCIÓN · cada código real del backend tiene su texto, y uno
 * desconocido no rompe la pantalla.
 */

describe("presentarMotivoRetencion", () => {
  it.each([
    ["DUPLICATE_SOURCE_DOCUMENT", "Documento fuente duplicado", "DOCUMENTAL"],
    ["SOURCE_IDENTITY_CONFLICT", "Conflicto de identidad en el expediente", "IDENTIDAD"],
    ["OUT_OF_MENTAL_HEALTH_SCOPE", "Fuera del alcance de salud mental", "OPERACIONAL"],
    ["EXPECTED_IDENTITY_MISMATCH", "Identidad no coincide con la planilla", "IDENTIDAD"],
    ["NOT_IN_BATCH_SOURCE", "Caso no encontrado en la planilla oficial", "OPERACIONAL"],
    ["PREASSIGNMENT_DATA_MISSING", "Falta identidad legible para validar", "DOCUMENTAL"],
  ])("%s → %s", (codigo, etiqueta, categoria) => {
    const m = presentarMotivoRetencion(codigo);
    expect(m.etiqueta).toBe(etiqueta);
    expect(m.categoria).toBe(categoria);
    expect(m.descripcion.length).toBeGreaterThan(10);
  });

  it("cubre exactamente los seis motivos de CaseHoldReason", () => {
    expect(Object.keys(MOTIVOS_RETENCION).sort()).toEqual(
      [
        "DUPLICATE_SOURCE_DOCUMENT",
        "EXPECTED_IDENTITY_MISMATCH",
        "NOT_IN_BATCH_SOURCE",
        "OUT_OF_MENTAL_HEALTH_SCOPE",
        "PREASSIGNMENT_DATA_MISSING",
        "SOURCE_IDENTITY_CONFLICT",
      ].sort(),
    );
  });

  it("un código desconocido o ausente cae en «Retenido» sin romper", () => {
    expect(presentarMotivoRetencion("CODIGO_NUEVO").etiqueta).toBe("Retenido");
    expect(presentarMotivoRetencion(null).etiqueta).toBe("Retenido");
    expect(presentarMotivoRetencion(undefined).etiqueta).toBe("Retenido");
    expect(presentarMotivoRetencion("toString").etiqueta).toBe("Retenido");
  });
});
