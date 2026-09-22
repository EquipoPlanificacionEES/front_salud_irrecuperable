import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DocumentosExpediente, ListaDocumentos } from "./DocumentosExpediente";
import type { CaseDocumentItem, CaseDocuments } from "@/lib/backend";

/**
 * DOCUMENTOS DEL EXPEDIENTE · uno o varios.
 *
 * Lo que congelan estas pruebas es la compatibilidad: con UN archivo la
 * pantalla no cambia —no aparece ninguna lista— y con una carpeta el
 * profesional puede abrir cualquiera de los documentos, no el primero.
 *
 * Todo sintético: nombres de archivo inventados, sin datos de persona.
 */

const doc = (over: Partial<CaseDocumentItem> = {}): CaseDocumentItem => {
  const documentId = over.documentId ?? "00000000-0000-4000-8000-000000000001";
  return {
    documentId,
    fileName: "ANTEC. MEDICOS.pdf",
    documentType: "DOC-03",
    documentClass: "CLINICAL",
    status: "PROCESSED",
    byteSize: 1_500_000,
    receivedAt: "2026-09-20T12:00:00.000Z",
    // La compone el servidor; aquí se reproduce igual para poder comprobar que
    // cada elemento enlaza a SU documento y no al primero.
    downloadUrl: `/api/v1/cases/c1/documents/${documentId}`,
    warnings: [],
    ...over,
  };
};

const CARPETA: CaseDocumentItem[] = [
  doc(),
  doc({
    documentId: "00000000-0000-4000-8000-000000000002",
    fileName: "MAESTROS.pdf",
    documentType: "DOC-01",
    documentClass: "ADMINISTRATIVE",
  }),
  doc({
    documentId: "00000000-0000-4000-8000-000000000003",
    fileName: "NOTIF. CORREO.pdf",
    documentType: "DOC-07",
    documentClass: "NOTIFICATION",
  }),
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ListaDocumentos", () => {
  it("UN SOLO ARCHIVO: no se enseña ninguna lista, la pantalla queda como estaba", () => {
    const { container } = render(<ListaDocumentos documentos={[doc()]} />);
    expect(container.textContent).toBe("");
  });

  it("una carpeta: los N documentos, cada uno con su enlace y su clase", () => {
    render(<ListaDocumentos documentos={CARPETA} titulo="Antecedentes del caso" />);
    expect(screen.getByText("Antecedentes del caso · 3")).toBeDefined();

    const enlace = screen.getByText("MAESTROS.pdf");
    expect(enlace.getAttribute("href")).toContain("/documents/00000000-0000-4000-8000-000000000002");
    expect(enlace.getAttribute("target")).toBe("_blank");
    expect(screen.getByText(/Antecedente clínico/)).toBeDefined();
    expect(screen.getByText(/Notificación/)).toBeDefined();
  });

  it("un documento que no se pudo leer se ve, y se dice que el expediente puede estar incompleto", () => {
    render(
      <ListaDocumentos
        documentos={[
          CARPETA[0] as CaseDocumentItem,
          doc({
            documentId: "00000000-0000-4000-8000-000000000004",
            fileName: "INFORME.pdf",
            status: "FAILED",
            warnings: ["No se pudo leer este documento."],
          }),
        ]}
      />,
    );
    expect(screen.getByText("No se pudo leer")).toBeDefined();
    expect(screen.getByText(/el expediente puede estar incompleto/)).toBeDefined();
  });
});

function conConsulta(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function responder(payload: CaseDocuments) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } })),
  );
}

describe("DocumentosExpediente (administración)", () => {
  it("enseña la cobertura: cuántos llegaron y cuántos se leyeron", async () => {
    responder({
      caseId: "c1",
      ingestionMode: "MULTI_DOCUMENT_CASE",
      documents: CARPETA,
      superseded: [],
      coverage: { received: 3, processed: 3, failed: 0, ready: true, blocking: [] },
    });
    conConsulta(<DocumentosExpediente caseId="c1" />);

    await waitFor(() => expect(screen.getByText("Documentos del expediente · 3")).toBeDefined());
    expect(screen.getByText(/3 recibidos · 3 procesados/)).toBeDefined();
  });

  it("con un clínico sin leer dice CLARAMENTE que el expediente no está listo", async () => {
    responder({
      caseId: "c1",
      ingestionMode: "MULTI_DOCUMENT_CASE",
      documents: [
        CARPETA[1] as CaseDocumentItem,
        doc({ fileName: "ANTEC. MEDICOS.pdf", status: "FAILED", warnings: ["No se pudo leer este documento."] }),
      ],
      superseded: [],
      coverage: { received: 2, processed: 1, failed: 1, ready: false, blocking: ["ANTEC. MEDICOS.pdf"] },
    });
    conConsulta(<DocumentosExpediente caseId="c1" />);

    await waitFor(() => expect(screen.getByText(/NO está listo para analizarse/)).toBeDefined());
    // Aparece dos veces a propósito: en el aviso y en la propia lista.
    expect(screen.getAllByText(/ANTEC\. MEDICOS\.pdf/).length).toBeGreaterThanOrEqual(2);
  });

  it("un documento sustituido NO figura como vigente: va al historial", async () => {
    responder({
      caseId: "c1",
      ingestionMode: "MULTI_DOCUMENT_CASE",
      documents: [CARPETA[0] as CaseDocumentItem],
      superseded: [doc({ documentId: "00000000-0000-4000-8000-000000000005", fileName: "INFORME v1.pdf", status: "SUPERSEDED" })],
      coverage: { received: 1, processed: 1, failed: 0, ready: true, blocking: [] },
    });
    conConsulta(<DocumentosExpediente caseId="c1" />);

    await waitFor(() => expect(screen.getByText("Sustituidos · 1")).toBeDefined());
    expect(screen.getByText("INFORME v1.pdf")).toBeDefined();
    expect(screen.getByText("Sustituido")).toBeDefined();
  });
});
