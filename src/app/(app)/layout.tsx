import { requerirSesion } from "@/lib/guard";
import { SesionProvider } from "@/components/SesionProvider";
import { AppShell } from "@/components/AppShell";

// Layout de todas las secciones protegidas. Valida sesión en el servidor
// e inyecta el contexto de sesión al cliente.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sesion = await requerirSesion();
  return (
    <SesionProvider
      sesion={{
        uid: sesion.uid,
        rol: sesion.rol,
        roles: sesion.roles,
        nombre: sesion.nombre,
        correo: sesion.correo,
        contrato: sesion.contrato,
        contratoId: sesion.contratoId,
        doctorProfileId: sesion.doctorProfileId,
      }}
    >
      <AppShell>{children}</AppShell>
    </SesionProvider>
  );
}
