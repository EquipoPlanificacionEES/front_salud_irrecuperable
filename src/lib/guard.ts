import { redirect } from "next/navigation";
import { obtenerSesion, type Sesion } from "./session";
import { HOME_POR_ROL, puedeAcceder } from "./roles";

// Defensa en profundidad: además del middleware, el layout protegido revalida en el servidor.

export async function requerirSesion(pathname?: string): Promise<Sesion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (pathname && !puedeAcceder(sesion.rol, pathname)) redirect(HOME_POR_ROL[sesion.rol]);
  return sesion;
}
