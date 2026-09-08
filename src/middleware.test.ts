import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import { HOME_POR_ROL, puedeAcceder, type Rol } from "./lib/roles";

/**
 * QUE LA OPTIMIZACIÓN DE SESIÓN NO HAYA ABIERTO UN AGUJERO.
 *
 * El middleware pasó de verificar la sesión contra el backend en CADA
 * navegación y CADA prefetch —hasta 23 viajes de ~197 ms para cargar una
 * pantalla— a mirar si la cookie está. Estas pruebas fijan las dos mitades del
 * trato:
 *
 *   · que ya no haga ninguna llamada de red, que es de lo que iba el cambio;
 *   · que la autorización por rol siga siendo exactamente la misma, porque vive
 *     en `requerirSesion(ruta)`, en el servidor, y no aquí.
 */

function peticion(path: string, opciones?: { cookie?: string }) {
  const req = new NextRequest(new URL(`https://app.example${path}`));
  if (opciones?.cookie) req.cookies.set("sir_session", opciones.cookie);
  return req;
}

afterEach(() => vi.unstubAllGlobals());

describe("middleware · no llama al backend", () => {
  it("no hace ni una petición de red, ni con cookie ni sin ella", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await middleware(peticion("/kpi"));
    await middleware(peticion("/kpi", { cookie: "sesion-x" }));
    await middleware(peticion("/admin/retenidos", { cookie: "sesion-x" }));
    await middleware(peticion("/login"));

    // Ésta es la métrica del refactor: cero viajes a Render por navegación.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("middleware · a quién deja pasar", () => {
  it("sin cookie manda al login, y recuerda adónde iba", async () => {
    const r = await middleware(peticion("/admin/retenidos"));
    const destino = new URL(r.headers.get("location") ?? "");
    expect(destino.pathname).toBe("/login");
    expect(destino.searchParams.get("next")).toBe("/admin/retenidos");
  });

  it("sin cookie y en la raíz no arrastra un `next` inútil", async () => {
    const r = await middleware(peticion("/"));
    const destino = new URL(r.headers.get("location") ?? "");
    expect(destino.pathname).toBe("/login");
    expect(destino.searchParams.get("next")).toBeNull();
  });

  it("con cookie deja seguir, y la guardia del servidor decide de verdad", async () => {
    const r = await middleware(peticion("/admin/retenidos", { cookie: "sesion-x" }));
    expect(r.headers.get("location")).toBeNull();
  });

  it("una cookie inventada pasa este filtro — y por eso NO es el control de acceso", async () => {
    // Documenta el trato explícitamente: aquí no se valida nada. Quien traiga
    // una cookie falsa llega a `requerirSesion()`, que sí pregunta al backend, y
    // rebota. Si esta prueba pasara a esperar un rechazo, el middleware habría
    // vuelto a hacer una llamada de red por navegación.
    const r = await middleware(peticion("/admin/usuarios", { cookie: "esto-no-es-una-sesion" }));
    expect(r.headers.get("location")).toBeNull();
  });

  it("/api/* no lo toca: de eso se encargan el proxy y el backend", async () => {
    const r = await middleware(peticion("/api/v1/inbox"));
    expect(r.headers.get("location")).toBeNull();
  });

  it("/login sin cookie se muestra", async () => {
    const r = await middleware(peticion("/login"));
    expect(r.headers.get("location")).toBeNull();
  });
});

describe("permisos por rol · intactos", () => {
  const casos: [Rol, string, boolean][] = [
    ["medico", "/mis-tramites", true],
    ["medico", "/mis-tramites/abc", true],
    ["medico", "/mi-firma", true],
    ["medico", "/kpi", true],
    ["medico", "/admin", false],
    ["medico", "/admin/usuarios", false],
    ["medico", "/quality", false],
    ["calidad", "/quality", true],
    ["calidad", "/kpi", true],
    ["calidad", "/admin", false],
    ["calidad", "/mis-tramites", false],
    ["calidad", "/mi-firma", false],
    ["admin", "/admin", true],
    ["admin", "/admin/retenidos", true],
    ["admin", "/quality", true],
    ["admin", "/kpi", true],
    ["admin", "/mis-tramites", false],
    ["admin", "/mi-firma", false],
  ];

  it.each(casos)("%s en %s → %s", (rol, ruta, permitido) => {
    expect(puedeAcceder(rol, ruta)).toBe(permitido);
  });

  it("cada rol tiene su destino tras el login, y el del admin no da un rodeo", () => {
    expect(HOME_POR_ROL.medico).toBe("/kpi");
    expect(HOME_POR_ROL.calidad).toBe("/quality");
    // `/admin` sólo existe para redirigir a `/admin/semanas`: apuntar directo
    // ahí ahorra un render de servidor entero en cada login.
    expect(HOME_POR_ROL.admin).toBe("/admin/semanas");
    expect(puedeAcceder("admin", HOME_POR_ROL.admin)).toBe(true);
  });
});
