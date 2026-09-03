import "server-only";
import bcrypt from "bcryptjs";
import { getDb } from "../../BD/db";
import type { Rol } from "./roles";

// MODELO: acceso a datos de usuarios + autenticación (mock — el backend lo hará en PostgreSQL).

export interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  rol: Rol;
  region: string | null; // código de región; null = nacional
  activo: number;
}

interface FilaUsuario extends Usuario {
  password_hash: string;
}

const MAX_INTENTOS = 5;
const VENTANA_MIN = 10;

const SELECT_USUARIO = `
  SELECT u.id, u.nombre, u.correo, u.password_hash, u.activo,
         r.codigo AS rol, g.codigo AS region
  FROM usuarios u
  JOIN roles r ON r.id = u.rol_id
  LEFT JOIN regiones g ON g.id = u.region_id
  WHERE u.correo = ?
`;

export function buscarPorCorreo(correo: string): FilaUsuario | undefined {
  return getDb().prepare(SELECT_USUARIO).get(correo.trim().toLowerCase()) as
    | FilaUsuario
    | undefined;
}

function intentosRecientes(correo: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM login_intentos
       WHERE correo = ? AND exito = 0 AND creado_en > datetime('now', ?)`,
    )
    .get(correo.trim().toLowerCase(), `-${VENTANA_MIN} minutes`) as { n: number };
  return row.n;
}

function registrarIntento(correo: string, exito: boolean, ip: string | null): void {
  getDb()
    .prepare("INSERT INTO login_intentos (correo, exito, ip) VALUES (?, ?, ?)")
    .run(correo.trim().toLowerCase(), exito ? 1 : 0, ip);
}

export type ResultadoLogin =
  | { ok: true; usuario: Usuario }
  | { ok: false; error: "credenciales" | "bloqueado" | "inactivo" };

/** Verifica credenciales con protección contra fuerza bruta y enumeración de usuarios. */
export async function autenticar(
  correo: string,
  password: string,
  ip: string | null,
): Promise<ResultadoLogin> {
  if (intentosRecientes(correo) >= MAX_INTENTOS) return { ok: false, error: "bloqueado" };

  const fila = buscarPorCorreo(correo);
  const hash = fila?.password_hash ?? "$2a$12$0000000000000000000000000000000000000000000000000000";
  const coincide = await bcrypt.compare(password, hash);

  if (!fila || !coincide) {
    registrarIntento(correo, false, ip);
    return { ok: false, error: "credenciales" };
  }
  if (!fila.activo) {
    registrarIntento(correo, false, ip);
    return { ok: false, error: "inactivo" };
  }

  registrarIntento(correo, true, ip);
  return {
    ok: true,
    usuario: {
      id: fila.id,
      nombre: fila.nombre,
      correo: fila.correo,
      rol: fila.rol,
      region: fila.region ?? null,
      activo: fila.activo,
    },
  };
}
