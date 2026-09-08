import { TablaSkeleton } from "@/components/Skeleton";

/**
 * LO QUE SE VE MIENTRAS EL SERVIDOR PREPARA UNA RUTA.
 *
 * Ésta es la mitad que faltaba. Antes, entre el clic y cualquier señal visual
 * pasaban ~440 ms medidos: la página anterior se quedaba entera en pantalla, sin
 * spinner, sin barra, sin nada, y sólo entonces cambiaba de golpe. La persona no
 * tenía forma de saber si su clic había servido, así que volvía a pulsar.
 *
 * Con `loading.tsx` presente, Next pinta esto EN CUANTO empieza la navegación.
 * Es la solución nativa del framework: no hace falta ninguna librería de barra
 * de progreso.
 *
 * Éste es el respaldo genérico. Las rutas cuya forma real se parece poco a una
 * tabla tienen el suyo.
 */
export default function Cargando() {
  return (
    <section>
      <div className="mb-5 h-6 w-48 animate-pulse rounded bg-zinc-200/70" />
      <TablaSkeleton filas={8} columnas={5} />
    </section>
  );
}
