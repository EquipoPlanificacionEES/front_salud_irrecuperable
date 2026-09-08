"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

/**
 * UN ENLACE QUE DICE QUE LO PULSASTE.
 *
 * `useLinkStatus` es la respuesta nativa de Next 16 al hueco que medimos: entre
 * el clic y el primer cambio visual pasaban ~440 ms en los que la pantalla no
 * reaccionaba. `loading.tsx` cubre el destino; esto cubre el ORIGEN, para que la
 * pestaña que acabas de pulsar se marque de inmediato.
 *
 * Se descartó `nextjs-toploader`: haría lo mismo con una dependencia más y una
 * barra global que no distingue qué se pulsó. Lo nativo señala el enlace
 * concreto, que es más información y menos código.
 *
 * El punto tarda 150 ms en aparecer a propósito: una navegación ya prefetchada
 * se resuelve antes, y un parpadeo en cada clic instantáneo es ruido.
 */
function Pendiente() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span aria-hidden className="indicador-enlace" />;
}

export function EnlaceNav({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={className}>
      {children}
      <Pendiente />
    </Link>
  );
}
