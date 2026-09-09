import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import {
  EditorInforme,
  borradorInicial,
  camposModificados,
  cuerpoDeCorreccion,
  exigeMotivo,
  type Borrador,
  type CampoFormulario,
  type FormularioInforme,
} from "./EditorInforme";

/**
 * EL EDITOR DEL INFORME.
 *
 * Lo que se fija aquí no es la maquetación: es que corregir un dato deje ver de
 * qué se está discrepando, que sólo viaje lo que cambió, y que la
 * identificación no se pueda cambiar en silencio.
 *
 * Sin PII: el formulario es sintético.
 */
const campo = (
  key: string,
  label: string,
  kind: CampoFormulario["kind"],
  systemValue: string,
  extra: Partial<CampoFormulario> = {},
): CampoFormulario => ({
  key,
  label,
  kind,
  value: systemValue,
  systemValue,
  doctorValue: null,
  effectiveValue: systemValue,
  editable: true,
  required: false,
  systemDetermined: systemValue !== "",
  sourceType: "ENGINE_COMPUTED",
  correctionReasonRequired: false,
  ...extra,
});

const FORM: FormularioInforme = {
  reportSnapshotId: "00000000-0000-4000-8000-000000000001",
  version: 2,
  sections: [
    {
      id: "I",
      title: "I. IDENTIFICACIÓN DEL USUARIO",
      fields: [
        campo("fullName", "Nombre", "TEXT", "PERSONA SINTÉTICA", {
          sourceType: "SOURCE_EXTRACTION",
          correctionReasonRequired: true,
        }),
      ],
    },
    {
      id: "II",
      title: "II. ANTECEDENTES",
      fields: [
        campo("authorizedDaysKnown", "Total días autorizados", "INTEGER", "300"),
        campo("tpiStage", "Etapa TPI", "TEXT", "Sin trámite", { sourceType: "SOURCE_EXTRACTION" }),
      ],
    },
    {
      id: "III",
      title: "III. ANÁLISIS",
      fields: [campo("clinicalAnalysis", "Análisis clínico", "LONG_TEXT", "Texto del sistema.")],
    },
    {
      id: "IV",
      title: "IV. CONCLUSIÓN",
      fields: [
        campo("conclusion", "Conclusión general", "LONG_TEXT", "Conclusión del sistema.", {
          required: true,
        }),
      ],
    },
    {
      id: "V",
      title: "V. EVALUACIÓN",
      fields: [
        campo("assessment", "Evaluación", "CHOICE", "", {
          required: true,
          options: [
            { value: "RECOVERABLE", label: "SALUD RECUPERABLE" },
            { value: "IRRECOVERABLE", label: "SALUD IRRECUPERABLE" },
          ],
        }),
      ],
    },
  ],
};

/** Envoltorio con estado, para poder escribir en él como lo haría la pantalla. */
function Banco({ inicial }: { inicial?: Borrador }) {
  const [b, setB] = useState<Borrador>(inicial ?? borradorInicial(FORM));
  return <EditorInforme form={FORM} borrador={b} onChange={setB} />;
}

const abrirIdentificacion = () =>
  fireEvent.click(screen.getByRole("button", { name: /IDENTIFICACIÓN/ }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("borrador", () => {
  it("arranca de lo que el informe dice HOY, no de lo que dijo el sistema", () => {
    const conCorreccion: FormularioInforme = {
      ...FORM,
      sections: FORM.sections.map((s) =>
        s.id === "II"
          ? {
              ...s,
              fields: [
                campo("authorizedDaysKnown", "Total días autorizados", "INTEGER", "300", {
                  doctorValue: "285",
                  effectiveValue: "285",
                  value: "285",
                }),
              ],
            }
          : s,
      ),
    };
    // Así «no tocar nada» y «reenviar lo mismo» son lo mismo, y no viaja ruido.
    expect(borradorInicial(conCorreccion).valores["authorizedDaysKnown"]).toBe("285");
  });

  it("un campo devuelto a su valor original deja de contar como modificado", () => {
    const b = borradorInicial(FORM);
    const cambiado: Borrador = { ...b, valores: { ...b.valores, authorizedDaysKnown: "285" } };
    expect(camposModificados(FORM, cambiado).map((f) => f.key)).toEqual(["authorizedDaysKnown"]);

    const restaurado: Borrador = { ...b, valores: { ...b.valores, authorizedDaysKnown: "300" } };
    expect(camposModificados(FORM, restaurado)).toEqual([]);
  });
});

describe("cuerpo que se envía", () => {
  const conDecision = (extra: Record<string, string> = {}): Borrador => {
    const b = borradorInicial(FORM);
    return { ...b, valores: { ...b.valores, assessment: "RECOVERABLE", ...extra } };
  };

  it("sin evaluación elegida no hay nada que enviar", () => {
    expect(cuerpoDeCorreccion(FORM, borradorInicial(FORM))).toBeNull();
  });

  it("reparte cada campo en su bloque: identidad, cifras y textos van separados", () => {
    const cuerpo = cuerpoDeCorreccion(
      FORM,
      {
        ...conDecision({
          fullName: "OTRO NOMBRE",
          authorizedDaysKnown: "285",
          tpiStage: "En tramitación",
        }),
        motivo: "El expediente traía el nombre mal transcrito.",
      },
    );

    expect(cuerpo).toMatchObject({
      schemaVersion: 2,
      assessment: "RECOVERABLE",
      identity: { fullName: "OTRO NOMBRE" },
      figures: { authorizedDaysKnown: 285 },
      figureTexts: { tpiStage: "En tramitación" },
      correctionReason: "El expediente traía el nombre mal transcrito.",
    });
  });

  it("un campo intacto NO viaja: confirmarlo no es lo mismo que escribirlo", () => {
    const cuerpo = cuerpoDeCorreccion(FORM, conDecision({ authorizedDaysKnown: "285" }));
    expect(cuerpo).not.toHaveProperty("identity");
    expect(cuerpo).not.toHaveProperty("figureTexts");
    expect(cuerpo).not.toHaveProperty("clinicalAnalysis");
    expect((cuerpo as { figures: Record<string, number> }).figures).toEqual({
      authorizedDaysKnown: 285,
    });
  });

  it("la conclusión y la evaluación viajan siempre: son lo que se firma", () => {
    const cuerpo = cuerpoDeCorreccion(FORM, conDecision());
    expect(cuerpo).toMatchObject({
      conclusion: "Conclusión del sistema.",
      assessment: "RECOVERABLE",
    });
  });
});

describe("motivo de corrección", () => {
  it("sólo lo exige lo que está marcado como sensible", () => {
    const b = borradorInicial(FORM);
    expect(exigeMotivo(FORM, { ...b, valores: { ...b.valores, authorizedDaysKnown: "285" } })).toBe(
      false,
    );
    expect(exigeMotivo(FORM, { ...b, valores: { ...b.valores, fullName: "OTRO" } })).toBe(true);
  });

  it("el campo de motivo aparece al tocar la identificación, y no antes", () => {
    render(<Banco />);
    expect(screen.queryByText(/Motivo de la corrección/)).toBeNull();

    abrirIdentificacion();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "OTRO NOMBRE" } });

    expect(screen.getByText(/Motivo de la corrección/)).toBeDefined();
  });
});

describe("lo que dijo el sistema", () => {
  it("sigue a la vista DESPUÉS de editar el campo", () => {
    render(<Banco />);
    fireEvent.change(screen.getByLabelText("Total días autorizados"), { target: { value: "285" } });

    // El control lleva lo del médico…
    expect((screen.getByLabelText("Total días autorizados") as HTMLInputElement).value).toBe("285");
    // …y debajo sigue lo del sistema, que es de lo que está discrepando.
    expect(screen.getByText("300")).toBeDefined();
    expect(screen.getAllByText(/Modificado por ti/).length).toBe(1);
  });

  it("«restaurar» devuelve el valor del sistema y quita la marca", () => {
    render(<Banco />);
    const input = () => screen.getByLabelText("Total días autorizados") as HTMLInputElement;
    fireEvent.change(input(), { target: { value: "285" } });
    expect(screen.getAllByText(/Modificado por ti/).length).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "restaurar" }));

    expect(input().value).toBe("300");
    expect(screen.queryByText(/Modificado por ti/)).toBeNull();
  });

  it("dice de dónde viene cada valor: no es lo mismo una lectura que un cálculo", () => {
    render(<Banco />);
    expect(screen.getAllByText(/Calculado por el sistema/).length).toBeGreaterThan(0);
    abrirIdentificacion();
    expect(screen.getAllByText(/Leído del expediente/).length).toBeGreaterThan(0);
  });
});

describe("la evaluación", () => {
  it("no viene marcada, aunque el sistema haya propuesto algo", () => {
    render(<Banco />);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.length).toBe(2);
    expect(radios.filter((r) => r.checked)).toHaveLength(0);
  });
});

describe("secciones", () => {
  it("la identificación viene plegada: no es lo que se corrige a diario", () => {
    render(<Banco />);
    expect(screen.queryByLabelText("Nombre")).toBeNull();
    abrirIdentificacion();
    expect(screen.getByLabelText("Nombre")).toBeDefined();
  });

  it("cada sección dice cuántos campos suyos llevan cambio", () => {
    render(<Banco />);
    fireEvent.change(screen.getByLabelText("Total días autorizados"), { target: { value: "285" } });
    expect(screen.getByText("1 modificado")).toBeDefined();

    fireEvent.change(screen.getByLabelText("Etapa TPI"), { target: { value: "En trámite" } });
    expect(screen.getByText("2 modificados")).toBeDefined();
  });
});
