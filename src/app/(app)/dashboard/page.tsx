import { requerirSesion } from "@/lib/guard";
import { Placeholder } from "@/components/Placeholder";

export default async function DashboardPage() {
  const sesion = await requerirSesion("/dashboard");
  return (
    <Placeholder titulo="Dashboard" ticket="TSI-201">
      Bienvenido, {sesion.nombre}. Selecciona una sección en el menú.
    </Placeholder>
  );
}
