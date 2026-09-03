import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Rol } from "./roles";
import { esRol } from "./roles";

// Manejo de sesión: JWT firmado (HS256) guardado en cookie httpOnly.
// Compatible con Edge (middleware) y Node (route handlers): `jose` es WebCrypto puro.

const COOKIE = "sesion";
const DURACION_SEG = 60 * 60 * 8; // 8 horas

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET no configurado (mínimo 16 caracteres).");
  return new TextEncoder().encode(s);
}

export interface Sesion {
  uid: number;
  rol: Rol;
  nombre: string;
  region: string | null; // código de región (RM, OHIGGINS, …); null = nacional
}

export async function crearToken(s: Sesion): Promise<string> {
  return new SignJWT({ rol: s.rol, nombre: s.nombre, region: s.region })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(s.uid))
    .setIssuedAt()
    .setExpirationTime(`${DURACION_SEG}s`)
    .sign(secret());
}

export async function verificarToken(token: string | undefined): Promise<Sesion | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    const uid = Number(payload.sub);
    const rol = payload.rol;
    const nombre = payload.nombre;
    const region = payload.region;
    if (!Number.isInteger(uid) || !esRol(rol) || typeof nombre !== "string") return null;
    return { uid, rol, nombre, region: typeof region === "string" ? region : null };
  } catch {
    return null;
  }
}

/** Lee la sesión desde la cookie (uso en Server Components / route handlers). */
export async function obtenerSesion(): Promise<Sesion | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  return verificarToken(token);
}

export async function guardarSesion(s: Sesion): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, await crearToken(s), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: DURACION_SEG,
  });
}

export async function cerrarSesion(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export const COOKIE_SESION = COOKIE;
