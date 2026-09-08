import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { Envoltura, crearQueryClient, pintarConQuery } from "@/test/utils";
import { queryKeys, STALE } from "@/lib/query-keys";
import { invalidacionesDe } from "@/lib/queries";
import { KpiPanel } from "@/app/(app)/kpi/KpiPanel";
import { Bandeja } from "@/app/(app)/mis-tramites/Bandeja";
import { Casos } from "@/app/(app)/admin/casos/Casos";
import type { CaseClassification, OperationalCase } from "@/lib/backend";

/**
 * LO QUE ESTA CAPA TIENE QUE SEGUIR CUMPLIENDO.
 *
 * No son pruebas de que TanStack Query funcione —eso es asunto suyo—, sino de
 * las cuatro promesas concretas por las que se metió: que `/inbox` se pida UNA
 * vez aunque lo miren tres pantallas, que volver a una vista no vuelva a
 * pedirlo, que un refresco de fondo no borre lo que hay en pantalla, y que al
 * cerrar sesión no quede nada del expediente de nadie.
 *
 * Sin PII: los expedientes son sintéticos.
 */

function caso(ref: string, classification: CaseClassification = "SIGNED"): OperationalCase {
  return {
    caseId: `00000000-0000-4000-8000-${ref.padStart(12, "0")}`,
    externalCaseId: ref,
    classification,
    hold: null,
    sourceDocument: null,
    status: "ANALYZED",
    statusChangedAt: "2026-09-01T10:00:00.000Z",
    discoveredAt: "2026-09-01T09:00:00.000Z",
    failureClass: null,
    analysisAttempts: 1,
    batch: null,
    assignment: {
      doctorProfileId: "d1",
      fullName: "Profesional",
      professionalCode: "SIS-1",
      assignedAt: "2026-09-01T10:00:00.000Z",
      assignmentRunId: null,
    },
    report: {
      reportId: `r-${ref}`,
      version: 1,
      workflowStatus: "SIGNED",
      readinessStatus: "READY",
      orientationAssessment: null,
      signedAt: null,
    },
  };
}

// «111» tiene que estar PENDIENTE: es la pestaña que la bandeja abre por
// defecto, y lo que se comprueba es lo que se VE, no lo que hay en memoria.
const CASOS_A = [caso("111", "PENDING_REVIEW"), caso("222")];
const CASOS_B = [caso("999", "PENDING_REVIEW")];

/** Un backend de mentira que cuenta cuántas veces se le pide cada ruta. */
function backend(inbox: OperationalCase[] = CASOS_A) {
  const veces: Record<string, number> = {};
  const fn = vi.fn(async (url: string) => {
    const ruta = new URL(String(url), "http://x").pathname.replace("/api/v1", "");
    veces[ruta] = (veces[ruta] ?? 0) + 1;
    const cuerpo =
      ruta === "/inbox"
        ? { cases: inbox, total: inbox.length }
        : ruta === "/admin/cases"
          ? { cases: inbox, total: inbox.length }
          : ruta === "/admin/batches"
            ? { batches: [] }
            : ruta === "/admin/doctor-workload"
              ? { doctors: [] }
              : {};
    return new Response(JSON.stringify(cuerpo), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return { fn, veces };
}

const MEDICO = { rol: "medico" as const, nombre: "Profesional", contrato: "INT" };

beforeEach(() => vi.useRealTimers());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("claves de consulta", () => {
  it("son estables: la misma entrada da la misma clave", () => {
    expect(queryKeys.doctor.inbox()).toEqual(queryKeys.doctor.inbox());
    expect(queryKeys.cases.report("abc")).toEqual(queryKeys.cases.report("abc"));
    expect(queryKeys.admin.cases({ batchId: "b1", limit: 100 })).toEqual(
      queryKeys.admin.cases({ batchId: "b1", limit: 100 }),
    );
  });

  it("distinguen recursos distintos, y filtros distintos entre sí", () => {
    expect(queryKeys.cases.report("a")).not.toEqual(queryKeys.cases.report("b"));
    expect(queryKeys.admin.cases({ batchId: "b1" })).not.toEqual(
      queryKeys.admin.cases({ batchId: "b2" }),
    );
  });

  it("son jerárquicas: el prefijo alcanza a todas las combinaciones de filtros", () => {
    // De esto depende que invalidar `["admin","cases"]` caduque los filtros sin
    // tener que enumerarlos.
    const conFiltros = queryKeys.admin.cases({ batchId: "b1", limit: 100 });
    expect(conFiltros.slice(0, 2)).toEqual(["admin", "cases"]);
    expect(queryKeys.cases.report("x").slice(0, 1)).toEqual(["cases"]);
  });
});

describe("una sola bandeja para todas las pantallas", () => {
  it("dos pantallas que la miran a la vez producen UNA petición", async () => {
    const { fn, veces } = backend();
    vi.stubGlobal("fetch", fn);
    const client = crearQueryClient();

    pintarConQuery(
      <>
        <KpiPanel {...MEDICO} />
        <Bandeja />
      </>,
      client,
    );

    await waitFor(() => expect(screen.getByText("Asignados a ti")).toBeDefined());
    await waitFor(() => expect(screen.getByText("111")).toBeDefined());
    expect(veces["/inbox"]).toBe(1);
  });

  it("volver a una vista dentro de la ventana de frescura no pide nada", async () => {
    const { fn, veces } = backend();
    vi.stubGlobal("fetch", fn);
    const client = crearQueryClient();

    const r = pintarConQuery(<Bandeja />, client);
    await waitFor(() => expect(screen.getByText("111")).toBeDefined());
    expect(veces["/inbox"]).toBe(1);

    // Salir de la vista y volver: es lo que hace `Mis casos → caso → volver`.
    r.unmount();
    pintarConQuery(<Bandeja />, client);
    await waitFor(() => expect(screen.getByText("111")).toBeDefined());

    expect(veces["/inbox"]).toBe(1);
    expect(STALE.inbox).toBeGreaterThan(0);
  });

  it("las tres pestañas salen de la misma lista, sin pedir una por pestaña", async () => {
    const { fn, veces } = backend([caso("111", "PENDING_REVIEW"), caso("222"), caso("333", "HOLD")]);
    vi.stubGlobal("fetch", fn);
    pintarConQuery(<Bandeja />);
    await waitFor(() => expect(screen.getByText("111")).toBeDefined());

    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(screen.getByRole("button", { name: /Histórico/ }));
    await waitFor(() => expect(screen.getByText("222")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /Retenidos/ }));
    await waitFor(() => expect(screen.getByText("333")).toBeDefined());

    expect(veces["/inbox"]).toBe(1);
  });
});

describe("refresco de fondo", () => {
  it("con datos caducados se mantiene lo que hay EN PANTALLA mientras llega lo nuevo", async () => {
    const { fn } = backend();
    vi.stubGlobal("fetch", fn);
    // `staleTime: 0` fuerza que al remontar se considere caducado.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: Infinity } },
    });

    const r = pintarConQuery(<Bandeja />, client);
    await waitFor(() => expect(screen.getByText("111")).toBeDefined());
    r.unmount();

    // Al volver: la tabla aparece YA, con lo cacheado, y no un esqueleto.
    pintarConQuery(<Bandeja />, client);
    expect(screen.getByText("111")).toBeDefined();
    expect(screen.queryByText(/Cargando/i)).toBeNull();
  });

  it("la primera carga sí enseña esqueleto, porque no hay nada que mantener", () => {
    const { fn } = backend();
    vi.stubGlobal("fetch", fn);
    pintarConQuery(<Bandeja />, crearQueryClient());
    // Sin datos todavía: no hay ninguna fila del expediente en pantalla.
    expect(screen.queryByText("111")).toBeNull();
  });
});

describe("el informe se cachea por expediente", () => {
  it("cada caso tiene su propia entrada, y no se pisan", () => {
    const client = crearQueryClient();
    client.setQueryData(queryKeys.cases.report("caso-a"), { id: "a" });
    client.setQueryData(queryKeys.cases.report("caso-b"), { id: "b" });

    expect(client.getQueryData(queryKeys.cases.report("caso-a"))).toEqual({ id: "a" });
    expect(client.getQueryData(queryKeys.cases.report("caso-b"))).toEqual({ id: "b" });
  });
});

describe("datos compartidos de administración", () => {
  it("dos pantallas de admin no piden dos veces las semanas ni la carga de médicos", async () => {
    const { fn, veces } = backend();
    vi.stubGlobal("fetch", fn);
    const client = crearQueryClient();

    pintarConQuery(
      <>
        <Casos />
        <Casos />
      </>,
      client,
    );

    await waitFor(() => expect(veces["/admin/cases"]).toBe(1));
    expect(veces["/admin/batches"]).toBe(1);
    expect(veces["/admin/doctor-workload"]).toBe(1);
  });
});

describe("invalidación selectiva", () => {
  it("ratificar caduca la bandeja y el informe, y NO los lotes ni los usuarios", async () => {
    const client = crearQueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    await invalidacionesDe(client).informeRatificado("caso-1");

    const claves = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(claves).toContain(JSON.stringify(queryKeys.cases.report("caso-1")));
    expect(claves).toContain(JSON.stringify(queryKeys.doctor.inbox()));
    expect(claves.join()).not.toContain("batches");
    expect(claves.join()).not.toContain("users");
  });

  it("levantar una retención caduca retenidos, casos, el informe y la bandeja", async () => {
    const client = crearQueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    await invalidacionesDe(client).retencionResuelta("caso-9");

    const claves = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(claves).toContain(JSON.stringify(queryKeys.admin.holds()));
    expect(claves).toContain(JSON.stringify(["admin", "cases"]));
    expect(claves).toContain(JSON.stringify(queryKeys.cases.report("caso-9")));
    expect(claves).toContain(JSON.stringify(queryKeys.doctor.inbox()));
  });

  it("ratificar NO vuelve a pedir el informe si acaba de sondearlo", async () => {
    const client = crearQueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    await invalidacionesDe(client).informeRatificado("caso-1", { informeYaRefrescado: true });

    const claves = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(claves).not.toContain(JSON.stringify(queryKeys.cases.report("caso-1")));
    expect(claves).toContain(JSON.stringify(queryKeys.doctor.inbox()));
  });

  it("repartir trabajo caduca la carga de los médicos, no los informes de nadie", async () => {
    const client = crearQueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    await invalidacionesDe(client).asignacionesCambiadas();

    const claves = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(claves).toContain(JSON.stringify(queryKeys.admin.doctorWorkload()));
    expect(claves.some((k) => k.includes("manual-form"))).toBe(false);
  });
});

describe("nada del expediente sobrevive al cierre de sesión", () => {
  it("vaciar la caché deja de devolver los datos clínicos que tenía", async () => {
    const client = crearQueryClient();
    client.setQueryData(queryKeys.doctor.inbox(), CASOS_A);
    client.setQueryData(queryKeys.cases.report("caso-1"), { id: "informe" });
    expect(client.getQueryData(queryKeys.doctor.inbox())).toBeDefined();

    await client.cancelQueries();
    client.clear();

    expect(client.getQueryData(queryKeys.doctor.inbox())).toBeUndefined();
    expect(client.getQueryData(queryKeys.cases.report("caso-1"))).toBeUndefined();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it("quien entra después NO ve ni un frame de la bandeja de quien salió", async () => {
    const { fn } = backend(CASOS_A);
    vi.stubGlobal("fetch", fn);
    const client = crearQueryClient();

    // Sesión de la primera persona.
    const r = pintarConQuery(<Bandeja />, client);
    await waitFor(() => expect(screen.getByText("111")).toBeDefined());
    r.unmount();

    // Cierre de sesión: es lo que hace `SesionProvider.cerrarSesion`.
    await client.cancelQueries();
    client.clear();

    // Sesión de la segunda, con OTROS expedientes.
    const { fn: fn2 } = backend(CASOS_B);
    vi.stubGlobal("fetch", fn2);
    pintarConQuery(<Bandeja />, client);

    // Ni siquiera en el primer render aparece nada de la anterior.
    expect(screen.queryByText("111")).toBeNull();
    await waitFor(() => expect(screen.getByText("999")).toBeDefined());
    expect(screen.queryByText("111")).toBeNull();
  });

  it("no se persiste nada: la caché vive sólo en memoria", async () => {
    const client = crearQueryClient();
    client.setQueryData(queryKeys.doctor.inbox(), CASOS_A);

    // Ni localStorage ni sessionStorage saben nada de expedientes.
    const guardado = JSON.stringify({ ...localStorage, ...sessionStorage });
    expect(guardado).not.toContain("111");
    expect(guardado).not.toContain("inbox");
  });
});

describe("el proveedor no rehace el cliente en cada render", () => {
  it("mantiene la caché entre renders del mismo árbol", async () => {
    const { fn, veces } = backend();
    vi.stubGlobal("fetch", fn);
    const client = crearQueryClient();
    const r = pintarConQuery(<Bandeja />, client);
    await waitFor(() => expect(screen.getByText("111")).toBeDefined());

    r.rerender(<Bandeja />);
    await waitFor(() => expect(screen.getByText("111")).toBeDefined());
    expect(veces["/inbox"]).toBe(1);
  });
});

describe("Envoltura", () => {
  it("expone el cliente que se le pasa", () => {
    const client = crearQueryClient();
    expect(Envoltura({ client, children: null })).toBeDefined();
  });
});
