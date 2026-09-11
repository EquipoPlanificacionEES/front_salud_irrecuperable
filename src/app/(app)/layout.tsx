import { requerirSesion } from "@/lib/guard";
import { SesionProvider } from "@/components/SesionProvider";
import { QueryProvider } from "@/components/QueryProvider";
import { AppShell } from "@/components/AppShell";

/**
 * Layout de todas las secciones protegidas.
 *
 * Valida la sesión en el servidor —una vez por petición, ver `lib/session.ts`—
 * e inyecta al cliente la identidad ya verificada. El cliente NO vuelve a
 * preguntar quién es: no hay ningún `useQuery(["me"])` en la aplicación, porque
 * la respuesta autoritativa ya viajó con este render.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sesion = await requerirSesion();
  return (
    <QueryProvider>
      <SesionProvider
        sesion={{
          uid: sesion.uid,
          rol: sesion.rol,
          roles: sesion.roles,
          nombre: sesion.nombre,
          correo: sesion.correo,
          contrato: sesion.contrato,
          contratoId: sesion.contratoId,
          ambitos: sesion.ambitos,
          doctorProfileId: sesion.doctorProfileId,
        }}
      >
        <AppShell>{children}</AppShell>
      </SesionProvider>
    </QueryProvider>
  );
}
