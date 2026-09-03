import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/session";
import { HOME_POR_ROL } from "@/lib/roles";

export default async function Home() {
  const sesion = await obtenerSesion();
  redirect(sesion ? HOME_POR_ROL[sesion.rol] : "/login");
}
