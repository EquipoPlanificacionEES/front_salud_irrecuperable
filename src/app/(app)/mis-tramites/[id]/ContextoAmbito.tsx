"use client";

import type { OperationalCase } from "@/lib/backend";

/**
 * DE DÓNDE ES ESTE EXPEDIENTE, dentro de la ficha.
 *
 * Un profesional que lleva dos contratos entra desde una bandeja donde los ve
 * mezclados; sin esto, al abrir uno pierde el contexto y sólo le queda el
 * número de trámite, que no dice de qué región es.
 *
 * No hace ninguna petición: el ámbito viaja con la fila de la bandeja, que es
 * la consulta de la que ya viene. Y si no se sabe, no se pinta nada — un
 * encabezado que dijera la región equivocada es peor que no decir ninguna.
 */
export function ContextoAmbito({ caso }: { caso: OperationalCase | null }) {
  const region = caso?.scope?.regionName ?? null;
  const contrato = caso?.scope?.contractName ?? null;
  if (!region && !contrato) return null;

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {region && (
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--atm-azul)]">{region}</span>
      )}
      {contrato && <span className="text-xs text-zinc-500">{contrato}</span>}
    </div>
  );
}
