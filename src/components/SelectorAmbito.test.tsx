import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SelectorAmbito } from "./SelectorAmbito";
import type { Ambito } from "@/lib/session";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function ambito(over: Partial<Ambito> = {}): Ambito {
  return {
    contractId: "c-valpo",
    contractCode: "INT_36",
    contractName: "Contrato de Valparaíso",
    regionId: "r-valpo",
    regionCode: "VALPARAISO",
    regionName: "Región de Valparaíso",
    roles: ["DOCTOR"],
    ...over,
  };
}

const maule = ambito({
  contractId: "c-maule",
  contractCode: "MAULE_X",
  contractName: "Contrato del Maule",
  regionId: "r-maule",
  regionCode: "MAULE",
  regionName: "Región del Maule",
});

const fetchMock = vi.fn();
afterEach(cleanup);
beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  document.cookie = "sir_csrf=token";
});

describe("selector de ámbito", () => {
  it("con UN ámbito no hay nada que elegir: sólo se dice dónde se está", () => {
    render(<SelectorAmbito ambitos={[ambito()]} activoContractId="c-valpo" />);
    expect(screen.queryByTestId("selector-ambito")).toBeNull();
    // Pero SÍ queda evidente la región: que no lo esté es lo que hace que
    // alguien firme creyendo que el expediente es de otra.
    expect(screen.getByTestId("ambito-activo").textContent).toMatch(/Valparaíso/);
  });

  it("con DOS ámbitos aparece el selector, con los dos", () => {
    render(<SelectorAmbito ambitos={[ambito(), maule]} activoContractId="c-valpo" />);
    const select = screen.getByTestId("selector-ambito") as HTMLSelectElement;
    expect(select.options.length).toBe(2);
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "Región de Valparaíso", "Región del Maule",
    ]);
  });

  it("cambiar de ámbito lo pide AL SERVIDOR y recarga", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, text: () => Promise.resolve("") } as Response);
    render(<SelectorAmbito ambitos={[ambito(), maule]} activoContractId="c-valpo" />);

    fireEvent.change(screen.getByTestId("selector-ambito"), {
      target: { value: "c-maule|r-maule" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/auth/active-scope");
    expect(JSON.parse(init.body)).toEqual({ contractId: "c-maule", regionId: "r-maule" });
    // Lo que hay en pantalla pertenece al ámbito anterior: no se reetiqueta en
    // el cliente, se vuelve a pedir.
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("si el servidor lo RECHAZA, se avisa y no se finge el cambio", async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 403,
      text: () => Promise.resolve(JSON.stringify({ error: { message: "sin acceso" } })),
    } as Response);
    render(<SelectorAmbito ambitos={[ambito(), maule]} activoContractId="c-valpo" />);

    fireEvent.change(screen.getByTestId("selector-ambito"), {
      target: { value: "c-maule|r-maule" },
    });

    await waitFor(() => expect(screen.getByText(/No se pudo cambiar/)).toBeTruthy());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("sin ámbitos no se pinta nada: no puede operar en ningún sitio", () => {
    const { container } = render(<SelectorAmbito ambitos={[]} activoContractId="" />);
    expect(container.textContent).toBe("");
  });
});
