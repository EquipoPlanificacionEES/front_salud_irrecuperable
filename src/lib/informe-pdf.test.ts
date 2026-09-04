import { describe, expect, it, vi } from "vitest";

/**
 * EL PDF SE COMPONE DESDE `document` Y DE NINGÚN OTRO SITIO.
 *
 * Se interceptan las llamadas a jsPDF y se recoge TODO el texto que se dibuja.
 * Es la única forma de comprobar lo que importa: no qué campos lee el código,
 * sino qué acaba impreso en la página.
 *
 * El material prohibido de esta prueba no es hipotético: es lo que salió en el
 * PDF titulado "Informe TSI" del primer caso real, cuando este módulo componía
 * el documento a partir del volcado interno del snapshot.
 */

const textos: string[] = [];

vi.mock("jspdf", () => {
  class FakeDoc {
    text(t: string | string[]) {
      textos.push(...(Array.isArray(t) ? t : [t]));
      return this;
    }
    splitTextToSize(t: string) {
      return [t];
    }
    getTextWidth() {
      return 10;
    }
    setFont() { return this; }
    setFontSize() { return this; }
    setTextColor() { return this; }
    setDrawColor() { return this; }
    setLineWidth() { return this; }
    line() { return this; }
    addImage() { return this; }
    addPage() { return this; }
    setPage() { return this; }
    getNumberOfPages() { return 1; }
    save() {}
  }
  return { jsPDF: FakeDoc };
});

const { descargarInformePdf } = await import("./informe-pdf");

const documento = {
  documentKind: "PRE_REPORT" as const,
  branding: {
    documentTitle: "PROPUESTA DE EVALUACIÓN TSI",
    institutionalHeading: "Evaluación de Salud Irrecuperable",
    institutionalSubheading: "del funcionario público · Comisión de prueba",
    footerText: "Pie de prueba",
  },
  caseReference: "40252330",
  sections: [
    {
      id: "I",
      title: "I. IDENTIFICACIÓN DEL USUARIO",
      fields: [
        { label: "Nombre", value: "PERSONA DE PRUEBA" },
        { label: "Edad", value: "44 años" },
        { label: "Institución", value: "Corporación de prueba" },
      ],
      paragraphs: [],
    },
    {
      id: "IV",
      title: "IV. CONCLUSIÓN GENERAL",
      fields: [],
      paragraphs: ["Conclusión de prueba, ya validada."],
    },
    { id: "V", title: "V. PROPUESTA DE EVALUACIÓN DE SALUD", fields: [], paragraphs: [] },
  ],
  proposal: {
    options: [
      { label: "SALUD RECUPERABLE", checked: true },
      { label: "SALUD IRRECUPERABLE", checked: false },
    ],
    note: null,
  },
  draftNotice: "Documento preliminar para revisión médica.",
};

async function imprimir(): Promise<string> {
  textos.length = 0;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
  await descargarInformePdf({
    caseReference: "40252330",
    version: 1,
    createdAt: "2026-09-04T19:38:12.155Z",
    document: documento,
  });
  vi.unstubAllGlobals();
  return textos.join("\n");
}

describe("descargarInformePdf", () => {
  it("imprime lo que trae el documento", async () => {
    const pagina = await imprimir();
    expect(pagina).toContain("PERSONA DE PRUEBA");
    expect(pagina).toContain("Edad: ");
    expect(pagina).toContain("44 años");
    expect(pagina).toContain("Corporación de prueba");
    expect(pagina).toContain("Conclusión de prueba, ya validada.");
  });

  it("marca la casilla de la propuesta y no inventa la otra", async () => {
    const pagina = await imprimir();
    expect(pagina).toContain("[X]  SALUD RECUPERABLE");
    expect(pagina).toContain("[  ]  SALUD IRRECUPERABLE");
  });

  it("toma la identidad institucional del backend, sin cablear ninguna comisión", async () => {
    const pagina = await imprimir();
    expect(pagina).toContain("del funcionario público · Comisión de prueba");
    expect(pagina).not.toContain("COMPIN Valparaíso");
  });

  const PROHIBIDO = [
    "Criterio de período",
    "Confirmado por el cliente",
    "CLIENT_CONFIRMED",
    "AI_INFERRED",
    "Inferido por IA",
    "Ninguna cantidad de indicadores reemplaza el juicio profesional",
    "Verificar que la falta de evidencia",
    "No especificado en el expediente",
  ];

  for (const token of PROHIBIDO) {
    it(`nunca imprime '${token}'`, async () => {
      expect(await imprimir()).not.toContain(token);
    });
  }

  it("nunca imprime un código de motor", async () => {
    expect(await imprimir()).not.toMatch(/\[?(?:REC|COH|CTRL|NOR|QA)-\d+\]?/);
  });
});
