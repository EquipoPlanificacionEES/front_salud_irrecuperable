import { cookies } from "next/headers";
import type { Rol } from "./roles";

// La sesión la maneja el backend real: cookie opaca `sir_session` (HttpOnly) +
// `sir_csrf`. El front NO verifica ningún token: pregunta a `/api/v1/auth/me`
// con la cookie y, si responde 200, hay sesión. Sirve en Edge (middleware) y en
// Node (server components) porque solo usa `fetch`.

export const COOKIE_SESION = "sir_session";
export const COOKIE_CSRF = "sir_csrf";

const BACKEND = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");

// El backend habla ADMIN/DOCTOR/QUALITY; el resto del front habla medico/calidad/admin.
const MAPA_ROL: Record<string, Rol> = {
  ADMIN: "admin",
  DOCTOR: "medico",
  QUALITY: "calidad",
};

export interface Sesion {
  uid: string;
  rol: Rol; // rol principal (el primero que trae el backend)
  roles: Rol[];
  nombre: string;
  correo: string;
  contratoId: string;
  contrato: string;
  doctorProfileId: string | null;
}

interface MeResponse {
  userId: string;
  email: string;
  displayName: string;
  roles: string[];
  tenant?: { contractId?: string; contractName?: string };
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
    const roles = (u.roles ?? []).map((x) => MAPA_ROL[x]).filter(Boolean) as Rol[];
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
    };
  } catch {
    return null;
  }
}

/** Lee y verifica la sesión desde la cookie (Server Components / route handlers). */
export async function obtenerSesion(): Promise<Sesion | null> {
  const valor = (await cookies()).get(COOKIE_SESION)?.value;
  return verificarSesion(valor);
}
