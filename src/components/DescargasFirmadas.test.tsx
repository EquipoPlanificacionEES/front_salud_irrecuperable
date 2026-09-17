import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { DocumentosFirmados, EstadoDocumentoFirmado } from "@/lib/backend";
import { DescargasFirmadas } from "./DescargasFirmadas";

/**
 * EL WORD Y EL PDF DE UNA VERSIÓN FIRMADA. Lo que se congela: que cada botón
 * lleve a SU versión, y que el PDF se muestre en su estado real — sin ofrecer
 * nunca una descarga que va a fallar.
 */

const ID = "00000000-0000-4000-8000-0000000000d4";

function documentos(pdf: EstadoDocumentoFirmado, reportSnapshotId = ID, version = 1): DocumentosFirmados {
  const base = `/api/v1/reports/${reportSnapshotId}/signed-document`;
  return {
    reportSnapshotId,
    version,
    docx: { status: "READY", downloadUrl: `${base}?format=docx` },
    pdf: { status: pdf, downloadUrl: pdf === "READY" ? `${base}?format=pdf` : null },
  };
}

afterEach(cleanup);

describe("DescargasFirmadas", () => {
  it("A · Word y PDF listos: dos botones, cada uno a su formato de la misma versión", () => {
    render(<DescargasFirmadas documentos={documentos("READY")} />);
    const word = screen.getByRole("link", { name: "Descargar Word" }) as HTMLAnchorElement;
    const pdf = screen.getByRole("link", { name: "Descargar PDF" }) as HTMLAnchorElement;
    expect(word.getAttribute("href")).toBe(`/api/v1/reports/${ID}/signed-document?format=docx`);
    expect(pdf.getAttribute("href")).toBe(`/api/v1/reports/${ID}/signed-document?format=pdf`);
  });

  it("B · PDF fallido: el Word sigue, y el PDF se declara no disponible sin enlace", () => {
    render(<DescargasFirmadas documentos={documentos("FAILED")} />);
    expect(screen.getByRole("link", { name: "Descargar Word" })).toBeDefined();
    expect(screen.queryByRole("link", { name: /PDF/ })).toBeNull();
    expect(screen.getByText("PDF no disponible")).toBeDefined();
  });

  it("C · PDF en proceso: se dice, deshabilitado, sin enlace", () => {
    render(<DescargasFirmadas documentos={documentos("PROCESSING")} />);
    expect(screen.getByRole("link", { name: "Descargar Word" })).toBeDefined();
    expect(screen.queryByRole("link", { name: /PDF/ })).toBeNull();
    const estado = screen.getByText("PDF en proceso");
    expect(estado.closest("[aria-disabled='true']")).not.toBeNull();
  });

  it("un PDF que no existe ni está en camino tampoco ofrece enlace", () => {
    render(<DescargasFirmadas documentos={documentos("NOT_AVAILABLE")} />);
    expect(screen.queryByRole("link", { name: /PDF/ })).toBeNull();
    expect(screen.getByText("PDF no disponible")).toBeDefined();
  });

  it("D · en el historial, el nombre dice de qué versión es cada botón", () => {
    const otra = "00000000-0000-4000-8000-0000000000d5";
    render(
      <>
        <DescargasFirmadas documentos={documentos("READY", ID, 1)} compacto conVersion />
        <DescargasFirmadas documentos={documentos("READY", otra, 2)} compacto conVersion />
      </>,
    );
    expect(
      screen.getByRole("link", { name: "Descargar PDF de la versión 1" }).getAttribute("href"),
    ).toContain(ID);
    expect(
      screen.getByRole("link", { name: "Descargar Word de la versión 2" }).getAttribute("href"),
    ).toContain(otra);
  });
});
