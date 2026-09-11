import { cache } from "react";
import { cookies } from "next/headers";
import { rolPrincipal, type Rol } from "./roles";

// La sesión la maneja el backend real: cookie opaca `sir_session` (HttpOnly) +
// `sir_csrf`. El front NO verifica ningún token: pregunta a `/api/v1/auth/me`
// con la cookie y, si responde 200, hay sesión.
//
// UNA SOLA VERIFICACIÓN POR PETICIÓN.
//
// Antes cada render preguntaba tres veces: el middleware, el layout protegido y
// la página. Medido: 11 llamadas por login de médico, 28 por el de admin, 23 por
// recarga de una pantalla administrativa —cada una un viaje de ~197 ms a Render—
// porque además el prefetch de `<Link>` repite el render entero por cada enlace.
//
// `cache()` de React memoiza POR PETICIÓN. No es una caché compartida: React crea
// un ámbito nuevo para cada request y lo descarta al terminarla, así que dos
// usuarios simultáneos nunca ven el mismo valor y una sesión revocada no
// sobrevive a la petición en curso. Es exactamente lo que hacía falta: el layout
// y la página comparten la respuesta, sin relajar nada.

export const COOKIE_SESION = "sir_session";
export const COOKIE_CSRF = "sir_csrf";

const BACKEND = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");

/**
 * UN ÁMBITO EN EL QUE LA PERSONA PUEDE TRABAJAR.
 *
 * Viene del backend y sirve SÓLO para decidir qué enseñar: elegir uno aquí no
 * concede nada. El backend vuelve a comprobar membresía y alcance en cada
 * petición, así que un ámbito manipulado en el cliente no abre ninguna puerta.
 */
export interface Ambito {
  contractId: string;
  contractCode: string;
  contractName: string;
  regionId: string | null;
  regionCode: string | null;
  regionName: string | null;
  roles: string[];
}

export interface Sesion {
  uid: string;
  rol: Rol; // rol principal (el primero que trae el backend)
  roles: Rol[];
  nombre: string;
  correo: string;
  contratoId: string;
  contrato: string;
  doctorProfileId: string | null;
  /** Dónde puede trabajar. Vacío = no puede operar en ningún sitio. */
  ambitos: Ambito[];
}

interface MeResponse {
  userId: string;
  email: string;
  displayName: string;
  roles: string[];
  tenant?: { contractId?: string; contractName?: string };
  scopes?: Ambito[];
  doctorProfile?: { id?: string } | null;
}

/** Verifica la sesión contra el backend a partir del valor de la cookie. */
export async function verificarSesion(sirSession: string | undefined): Promise<Sesion | null> {
  if (!sirSession || !BACKEND) return null;
  try {
    const r = await fetch(`${BACKEND}/api/v1/auth/me`, {
      headers: { cookie: `${COOKIE_SESION}=${sirSession}` },
      cache: "no-store",
    });
    if (!r.ok) return null;
    const u = (await r.json()) as MeResponse;
    const roles = (u.roles ?? []).map((x) => rolPrincipal([x])).filter((x): x is Rol => x !== null);
    if (roles.length === 0) return null;
    return {
      uid: u.userId,
      rol: roles[0],
      roles,
      nombre: u.displayName || u.email,
      correo: u.email,
      contratoId: u.tenant?.contractId ?? "",
      contrato: u.tenant?.contractName ?? "",
      doctorProfileId: u.doctorProfile?.id ?? null,
      ambitos: u.scopes ?? [],
    };
  } catch {
    return null;
  }
}

/**
 * Lee y verifica la sesión desde la cookie (Server Components / route handlers).
 *
 * Memoizada por petición: llamarla N veces durante un mismo render hace UNA
 * llamada al backend. Ver la nota de arriba.
 */
export const obtenerSesion = cache(async function obtenerSesion(): Promise<Sesion | null> {
  const valor = (await cookies()).get(COOKIE_SESION)?.value;
  return verificarSesion(valor);
});
