import { requerirSesion } from "@/lib/guard";
import { AdminTabs } from "../AdminTabs";
import { Usuarios } from "./Usuarios";

export default async function UsuariosPage() {
  await requerirSesion("/admin/usuarios");
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold text-zinc-900">Usuarios</h2>
      <AdminTabs />
      <p className="mb-4 text-sm text-zinc-500">
        Crear médicos y administradores. Editar nombre, correo, RUT, SIS y estado en la tabla.
      </p>
      <Usuarios />
    </section>
  );
}
