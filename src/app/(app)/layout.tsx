import { requerirSesion } from "@/lib/guard";
import { SesionProvider } from "@/components/SesionProvider";
import { AppShell } from "@/components/AppShell";

// Layout de todas las secciones protegidas. Valida sesión en el servidor
// e inyecta el contexto de sesión al cliente.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sesion = await requerirSesion();
  return (
    <SesionProvider
      sesion={{ uid: sesion.uid, rol: sesion.rol, nombre: sesion.nombre, region: sesion.region }}
    >
      <AppShell>{children}</AppShell>
    </SesionProvider>
  );
}
