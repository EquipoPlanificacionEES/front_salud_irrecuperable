import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

/** El selector usa el cliente de consultas para vaciar la caché al cambiar. */
function pintar(ui: React.ReactElement, client = new QueryClient()) {
  return { ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>), client };
}

describe("selector de ámbito", () => {
  it("con UN ámbito no hay nada que elegir: sólo se dice dónde se está", () => {
    pintar(<SelectorAmbito ambitos={[ambito()]} activoContractId="c-valpo" activoRegionId="r-valpo" />);
    expect(screen.queryByTestId("selector-ambito")).toBeNull();
    // Pero SÍ queda evidente la región: que no lo esté es lo que hace que
    // alguien firme creyendo que el expediente es de otra.
    expect(screen.getByTestId("ambito-activo").textContent).toMatch(/Valparaíso/);
  });

  it("con DOS ámbitos aparece el selector, con los dos", () => {
    pintar(<SelectorAmbito ambitos={[ambito(), maule]} activoContractId="c-valpo" activoRegionId="r-valpo" />);
    const select = screen.getByTestId("selector-ambito") as HTMLSelectElement;
    expect(select.options.length).toBe(2);
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "Región de Valparaíso", "Región del Maule",
    ]);
  });

  it("cambiar de ámbito lo pide AL SERVIDOR y recarga", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, text: () => Promise.resolve("") } as Response);
    pintar(<SelectorAmbito ambitos={[ambito(), maule]} activoContractId="c-valpo" activoRegionId="r-valpo" />);

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
    pintar(<SelectorAmbito ambitos={[ambito(), maule]} activoContractId="c-valpo" activoRegionId="r-valpo" />);

    fireEvent.change(screen.getByTestId("selector-ambito"), {
      target: { value: "c-maule|r-maule" },
    });

    await waitFor(() => expect(screen.getByText(/No se pudo cambiar/)).toBeTruthy());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("al cambiar, la caché del ámbito anterior NO sobrevive", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, text: () => Promise.resolve("") } as Response);
    const client = new QueryClient();
    // Un dato del ámbito anterior, ya en caché.
    client.setQueryData(["cases", "c1", "report"], { caseId: "c1" });

    pintar(<SelectorAmbito ambitos={[ambito(), maule]} activoContractId="c-valpo" activoRegionId="r-valpo" />, client);
    fireEvent.change(screen.getByTestId("selector-ambito"), {
      target: { value: "c-maule|r-maule" },
    });

    // Invalidar no basta: seguiría sirviéndose mientras llega lo nuevo, y la
    // pantalla diría "Maule" con los expedientes de Valparaíso debajo.
    await waitFor(() =>
      expect(client.getQueryData(["cases", "c1", "report"])).toBeUndefined(),
    );
  });

  it("sin ámbitos no se pinta nada: no puede operar en ningún sitio", () => {
    const { container } = pintar(<SelectorAmbito ambitos={[]} activoContractId="" activoRegionId={null} />);
    expect(container.textContent).toBe("");
  });
  /**
   * EL DEFECTO QUE LLEGÓ A PRODUCCIÓN, FIJADO.
   *
   * El selector recibía el contrato de ORIGEN de la cuenta como si fuera «dónde
   * estoy». Tras cambiar a Maule seguía marcando Valparaíso —los datos ya eran
   * de Maule— y volver era imposible: para el navegador, Valparaíso ya estaba
   * elegido, así que elegirlo no disparaba ningún `change`.
   */
  it("C · marca el ámbito ACTIVO, no el de origen de la cuenta", () => {
    pintar(
      <SelectorAmbito
        ambitos={[ambito(), maule]}
        activoContractId="c-maule"
        activoRegionId="r-maule"
      />,
    );
    const select = screen.getByTestId("selector-ambito") as HTMLSelectElement;
    expect(select.value).toBe("c-maule|r-maule");
  });

  it("D · desde Maule se puede VOLVER a Valparaíso: el cambio se envía", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, text: () => Promise.resolve("") } as Response);
    pintar(
      <SelectorAmbito
        ambitos={[ambito(), maule]}
        activoContractId="c-maule"
        activoRegionId="r-maule"
      />,
    );

    fireEvent.change(screen.getByTestId("selector-ambito"), {
      target: { value: "c-valpo|r-valpo" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      contractId: "c-valpo", regionId: "r-valpo",
    });
  });

  it("E · si el cambio falla, el selector vuelve al ámbito anterior", async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 403,
      text: () => Promise.resolve(JSON.stringify({ error: { message: "sin acceso" } })),
    } as Response);
    pintar(
      <SelectorAmbito
        ambitos={[ambito(), maule]}
        activoContractId="c-valpo"
        activoRegionId="r-valpo"
      />,
    );
    const select = screen.getByTestId("selector-ambito") as HTMLSelectElement;

    fireEvent.change(select, { target: { value: "c-maule|r-maule" } });

    await waitFor(() => expect(screen.getByText(/No se pudo cambiar/)).toBeTruthy());
    // Ni se queda marcando el destino que nunca ocurrió.
    expect(select.value).toBe("c-valpo|r-valpo");
  });

  it("F · mientras el cambio viaja, el selector marca el DESTINO y no retrocede", async () => {
    // El servidor no responde todavía: es exactamente el hueco en el que las
    // props siguen diciendo el ámbito anterior.
    let resolver: (r: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((r) => { resolver = r; }));
    pintar(
      <SelectorAmbito
        ambitos={[ambito(), maule]}
        activoContractId="c-valpo"
        activoRegionId="r-valpo"
      />,
    );
    const select = screen.getByTestId("selector-ambito") as HTMLSelectElement;

    fireEvent.change(select, { target: { value: "c-maule|r-maule" } });

    // Aún con las props en Valparaíso, la pantalla ya dice Maule.
    await waitFor(() => expect(select.value).toBe("c-maule|r-maule"));
    resolver({ ok: true, status: 204, text: () => Promise.resolve("") });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(select.value).toBe("c-maule|r-maule");
  });

  it("G · dos cambios seguidos no producen dos peticiones: se bloquea mientras viaja", async () => {
    let resolver: (r: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((r) => { resolver = r; }));
    pintar(
      <SelectorAmbito
        ambitos={[ambito(), maule]}
        activoContractId="c-valpo"
        activoRegionId="r-valpo"
      />,
    );
    const select = screen.getByTestId("selector-ambito") as HTMLSelectElement;

    fireEvent.change(select, { target: { value: "c-maule|r-maule" } });
    await waitFor(() => expect(select.disabled).toBe(true));
    fireEvent.change(select, { target: { value: "c-valpo|r-valpo" } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolver({ ok: true, status: 204, text: () => Promise.resolve("") });
  });
});
