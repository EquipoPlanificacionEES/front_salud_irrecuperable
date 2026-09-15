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

describe("edición segura · formulario lleno, cambiar un campo", () => {
  /** Un formulario de una versión ya corregida: cifra del médico y nota impresa. */
  const CORREGIDO: FormularioInforme = {
    ...FORM,
    note: "Nota impresa.",
    sections: FORM.sections.map((s) =>
      s.id === "II"
        ? {
            ...s,
            fields: [
              campo("authorizedDaysKnown", "Total días autorizados", "INTEGER", "300", {
                doctorValue: "285", effectiveValue: "285", value: "285",
              }),
              campo("tpiStage", "Etapa TPI", "TEXT", "Sin trámite", { sourceType: "SOURCE_EXTRACTION" }),
            ],
          }
        : s,
    ),
  };
  const conDecision = (form: FormularioInforme, extra: Record<string, string> = {}): Borrador => {
    const b = borradorInicial(form);
    return { ...b, valores: { ...b.valores, assessment: "RECOVERABLE", ...extra } };
  };

  it("precarga TODO lo vigente, también la nota impresa", () => {
    const b = borradorInicial(CORREGIDO);
    expect(b.valores).toMatchObject({
      fullName: "PERSONA SINTÉTICA", authorizedDaysKnown: "285", tpiStage: "Sin trámite",
      clinicalAnalysis: "Texto del sistema.", conclusion: "Conclusión del sistema.",
    });
    expect(b.nota).toBe("Nota impresa.");
  });

  it("cambiar SÓLO la etapa TPI envía sólo ese campo, más conclusión y casilla; nada de nota", () => {
    const cuerpo = cuerpoDeCorreccion(CORREGIDO, conDecision(CORREGIDO, { tpiStage: "En tramitación" }));
    expect(cuerpo).toEqual({
      schemaVersion: 2,
      assessment: "RECOVERABLE",
      conclusion: "Conclusión del sistema.",
      figureTexts: { tpiStage: "En tramitación" },
    });
  });

  it("abrir y guardar sin tocar nada no envía ningún campo del informe", () => {
    expect(cuerpoDeCorreccion(CORREGIDO, conDecision(CORREGIDO))).toEqual({
      schemaVersion: 2, assessment: "RECOVERABLE", conclusion: "Conclusión del sistema.",
    });
  });

  it("vaciar la nota la envía vacía (retirarla); cambiarla la envía", () => {
    const vacia = { ...conDecision(CORREGIDO), nota: "  " };
    expect(cuerpoDeCorreccion(CORREGIDO, vacia)).toMatchObject({ note: "" });
    const otra = { ...conDecision(CORREGIDO), nota: "Otra nota." };
    expect(cuerpoDeCorreccion(CORREGIDO, otra)).toMatchObject({ note: "Otra nota." });
  });

  it("tras guardar, el formulario refrescado arranca de lo guardado y no hay cambios pendientes", () => {
    // Lo que devuelve el servidor después de aplicar la corrección de tpiStage.
    const refrescado: FormularioInforme = {
      ...CORREGIDO,
      version: 3,
      sections: CORREGIDO.sections.map((s) =>
        s.id === "II"
          ? {
              ...s,
              fields: s.fields.map((f) =>
                f.key === "tpiStage"
                  ? { ...f, doctorValue: "En tramitación", effectiveValue: "En tramitación", value: "En tramitación" }
                  : f,
              ),
            }
          : s,
      ),
    };
    const b = borradorInicial(refrescado);
    expect(b.valores["tpiStage"]).toBe("En tramitación");
    expect(b.valores["authorizedDaysKnown"]).toBe("285");
    expect(b.nota).toBe("Nota impresa.");
    expect(camposModificados(refrescado, b)).toEqual([]);
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

/**
 * DATA_UNAVAILABLE != 0.
 *
 * La forma del formulario de 32895245: cifras de licencias que el sistema NO
 * pudo establecer, guardadas en cero. Todo lo de aquí es representación: la
 * pantalla no escribe nada y no envía lo que el médico no tocó.
 */
describe("DATA_UNAVAILABLE != 0", () => {
  const SIN_DATOS: FormularioInforme = {
    reportSnapshotId: "00000000-0000-4000-8000-000000000002",
    version: 1,
    sections: [
      {
        id: "II",
        title: "II. ANTECEDENTES",
        fields: [
          // Backend nuevo: lo dice explícitamente y no manda el cero.
          campo("authorizedLicenseCount", "Total licencias autorizadas", "INTEGER", "", {
            systemDetermined: false,
            systemAvailability: "NOT_DETERMINED",
          }),
          // Backend anterior: mandaba "0" con `systemDetermined: false`.
          campo("authorizedDaysKnown", "Total días autorizados", "INTEGER", "0", {
            systemDetermined: false,
          }),
          // Un cero CONTADO.
          campo("rejectedLicenseCount", "Licencias rechazadas", "INTEGER", "0", {
            systemDetermined: true,
            systemAvailability: "DETERMINED",
          }),
          campo("evaluationPeriodStart", "Inicio del período evaluado", "TEXT", "", {
            sourceType: "SOURCE_EXTRACTION",
            systemDetermined: false,
          }),
          campo("fulmeCie10", "FULME · CIE-10", "TEXT", "", {
            sourceType: "SOURCE_EXTRACTION",
            systemAvailability: "NOT_APPLICABLE",
          }),
        ],
      },
      {
        id: "IV",
        title: "IV. CONCLUSIÓN",
        fields: [
          campo("conclusion", "Conclusión general", "LONG_TEXT", "", {
            required: true,
            sourceType: "ENGINE_NARRATIVE",
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

  function BancoSinDatos() {
    const [b, setB] = useState<Borrador>(borradorInicial(SIN_DATOS));
    return <EditorInforme form={SIN_DATOS} borrador={b} onChange={setB} />;
  }

  const valorDe = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;

  it("un valor no determinado se presenta como «No determinado por el sistema», nunca como 0", () => {
    render(<BancoSinDatos />);
    expect(valorDe("Total licencias autorizadas")).toBe("");
    // Aunque el backend anterior mande "0", no se precarga ni se enseña.
    expect(valorDe("Total días autorizados")).toBe("");
    // Las dos cifras, más la conclusión y la evaluación, que tampoco trae el sistema.
    expect(screen.getAllByText("No determinado por el sistema")).toHaveLength(4);
    // El único «0» a la vista es el cero contado.
    expect(screen.getAllByText("0")).toHaveLength(1);
  });

  it("un 0 real sigue mostrándose 0", () => {
    render(<BancoSinDatos />);
    expect(valorDe("Licencias rechazadas")).toBe("0");
    expect(screen.getByText("0")).toBeDefined();
  });

  it("un dato de lectura ausente es «No disponible», y uno que no corresponde es «No aplica»", () => {
    render(<BancoSinDatos />);
    expect(screen.getByText("No disponible")).toBeDefined();
    expect(screen.getByText("No aplica")).toBeDefined();
  });

  it("«por completar» sólo en lo obligatorio y vacío: las cifras opcionales no parecen bloquear", () => {
    render(<BancoSinDatos />);
    // La conclusión y la evaluación, y nada más.
    expect(screen.getAllByText(/por completar/)).toHaveLength(2);
    fireEvent.change(screen.getByLabelText(/Conclusión general/), { target: { value: "Conclusión del médico." } });
    expect(screen.getAllByText(/por completar/)).toHaveLength(1);
  });

  it("no envía un 0 que nadie escribió", () => {
    const b = borradorInicial(SIN_DATOS);
    const cuerpo = cuerpoDeCorreccion(SIN_DATOS, {
      ...b,
      valores: { ...b.valores, conclusion: "Conclusión del médico.", assessment: "IRRECOVERABLE" },
    });
    expect(cuerpo).not.toBeNull();
    expect(cuerpo).not.toHaveProperty("figures");
    expect(camposModificados(SIN_DATOS, b)).toEqual([]);
  });

  it("vaciar un cero contado no se envía como 0", () => {
    const b = borradorInicial(SIN_DATOS);
    const cuerpo = cuerpoDeCorreccion(SIN_DATOS, {
      ...b,
      valores: {
        ...b.valores,
        rejectedLicenseCount: "",
        conclusion: "Conclusión del médico.",
        assessment: "IRRECOVERABLE",
      },
    });
    expect(cuerpo).not.toHaveProperty("figures");
  });

  it("es sólo representación: el formulario recibido no cambia", () => {
    const antes = JSON.stringify(SIN_DATOS);
    render(<BancoSinDatos />);
    borradorInicial(SIN_DATOS);
    expect(JSON.stringify(SIN_DATOS)).toBe(antes);
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
