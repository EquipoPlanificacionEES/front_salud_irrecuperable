import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/session";
import { HOME_POR_ROL } from "@/lib/roles";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Quien ya tiene sesión no ve el formulario. Lo hacía el middleware, que para
  // saber el rol tenía que preguntarle al backend en CADA navegación de la app;
  // aquí cuesta una sola llamada y sólo en esta ruta.
  const sesion = await obtenerSesion();
  if (sesion) redirect(HOME_POR_ROL[sesion.rol]);

  const { next } = await searchParams;
  const destino = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;

  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--atm-fondo)] px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-zinc-900">Evaluación de Salud Irrecuperable</h1>
          <p className="mt-1 text-sm text-zinc-500">Ingresa con tu correo y contraseña</p>
        </div>
        <LoginForm next={destino} />
      </div>
    </div>
  );
}
