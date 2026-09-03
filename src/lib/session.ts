import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Rol } from "./roles";
import { esRol } from "./roles";

// El backend emite el JWT de sesión (HS256) en una cookie httpOnly.
// El front SOLO lo verifica para proteger rutas y mostrar el usuario. No lo firma.
// `jose` es WebCrypto puro → sirve en Edge (middleware) y en Node.

const COOKIE = process.env.SESSION_COOKIE || "sesion";

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET no configurado (mínimo 16 caracteres).");
  return new TextEncoder().encode(s);
}

export interface Sesion {
  uid: string;
  rol: Rol;
  nombre: string;
  region: string | null;
}

export async function verificarToken(token: string | undefined): Promise<Sesion | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    const rol = payload.rol;
    const nombre = payload.nombre ?? payload.name;
    const region = payload.region;
    if (!esRol(rol) || typeof nombre !== "string") return null;
    return {
      uid: payload.sub ?? "",
      rol,
      nombre,
      region: typeof region === "string" ? region : null,
    };
  } catch {
    return null;
  }
}

/** Lee la sesión desde la cookie (Server Components / route handlers). */
export async function obtenerSesion(): Promise<Sesion | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  return verificarToken(token);
}

export const COOKIE_SESION = COOKIE;
