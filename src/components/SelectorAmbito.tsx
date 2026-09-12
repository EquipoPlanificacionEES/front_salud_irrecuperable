"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Ambito } from "@/lib/session";

/**
 * EN QUÉ ÁMBITO SE ESTÁ TRABAJANDO.
 *
 * Con UN solo ámbito no hay nada que elegir: se muestra, y ya. El selector
 * aparece únicamente cuando hay más de uno — obligar a elegir entre una opción
 * es una pregunta cuya respuesta ya se sabe.
 *
 * ELEGIR AQUÍ NO CONCEDE NADA. El cambio va a `POST /auth/active-scope`, que
 * comprueba el grant en el servidor y responde 403 si no lo hay; esto es una
 * comodidad sobre lo que el backend ya permite, no una autorización. Por eso
 * tampoco se guarda en el navegador: el ámbito activo vive en la sesión, y un
 * valor en localStorage sería una segunda verdad que se desincroniza.
 */

function nombre(a: Ambito): string {
  // La región manda cuando la hay: es lo que la persona reconoce. El contrato
  // es la letra pequeña.
  return a.regionName ?? a.contractName;
}

/** La identidad de un ámbito es la PAREJA contrato+región, no el contrato. */
function clave(contractId: string, regionId: string | null): string {
  return `${contractId}|${regionId ?? ""}`;
}

export function SelectorAmbito({
  ambitos,
  activoContractId,
  activoRegionId,
}: {
  ambitos: Ambito[];
  /** El ámbito EFECTIVO según el servidor. No el contrato de origen. */
  activoContractId: string;
  activoRegionId: string | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [cambiando, setCambiando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * EL DESTINO MIENTRAS EL CAMBIO ESTÁ EN VUELO.
   *
   * El servidor tarda en reflejar el cambio: entre el POST y el `refresh` que
   * lo trae de vuelta hay un hueco en el que las props siguen diciendo el
   * ámbito anterior. Sin esto, el `<select>` volvía visualmente atrás en ese
   * hueco. Se suelta cuando el servidor CONFIRMA el destino, no antes, para
   * que una respuesta tardía del ámbito viejo no pueda revertir la pantalla.
   */
  const [destino, setDestino] = useState<string | null>(null);

  const claveServidor = clave(activoContractId, activoRegionId);

  useEffect(() => {
    if (destino !== null && destino === claveServidor) setDestino(null);
  }, [destino, claveServidor]);

  if (ambitos.length === 0) return null;

  const activo =
    ambitos.find((a) => clave(a.contractId, a.regionId) === claveServidor) ??
    ambitos.find((a) => a.contractId === activoContractId) ??
    ambitos[0];

  // Lo que se PINTA: el destino en vuelo manda; si no hay, la verdad del
  // servidor. Nunca un estado local que nadie confirmó.
  const mostrado = destino ?? clave(activo.contractId, activo.regionId);

  // UN SOLO ÁMBITO: se entra directo y sólo se deja constancia de dónde.
  if (ambitos.length === 1) {
    return (
      <span className="text-xs text-zinc-500" data-testid="ambito-activo">
        {nombre(activo)}
      </span>
    );
  }

  async function cambiar(a: Ambito) {
    // UN CAMBIO A LA VEZ. `disabled` ya lo impide con un ratón, pero el
    // invariante no puede depender de que el DOM colabore: dos POST cruzados
    // dejarían la sesión en el ámbito que contestara último, que no tiene por
    // qué ser el último que la persona eligió.
    if (cambiando) return;
    const objetivo = clave(a.contractId, a.regionId);
    if (objetivo === mostrado) return;
    setCambiando(true);
    setError(null);
    // Se pinta el destino YA: durante el viaje la pantalla dice a dónde va, no
    // de dónde viene.
    setDestino(objetivo);
    try {
      await api("/auth/active-scope", {
        json: { contractId: a.contractId, regionId: a.regionId },
      });
      /**
       * LA CACHÉ ENTERA SE TIRA, no se invalida.
       *
       * Invalidar marca lo viejo como caducado pero lo SIGUE SIRVIENDO mientras
       * llega lo nuevo: durante ese instante la pantalla diría "Maule" con los
       * expedientes de Valparaíso debajo. En una aplicación clínica eso no es un
       * parpadeo, es un expediente atribuido a la región equivocada.
       *
       * `cancelQueries` primero, porque una petición en vuelo del ámbito
       * anterior llegaría DESPUÉS del vaciado y volvería a llenar la caché con
       * lo de antes.
       */
      await qc.cancelQueries();
      qc.clear();
      router.refresh();
    } catch {
      // FALLÓ: se devuelve la pantalla a la verdad del servidor. Una interfaz
      // que siguiera marcando el destino estaría mintiendo sobre dónde trabaja.
      setDestino(null);
      setError("No se pudo cambiar de ámbito.");
    } finally {
      setCambiando(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <label className="sr-only" htmlFor="selector-ambito">
        Ámbito de trabajo
      </label>
      <select
        id="selector-ambito"
        data-testid="selector-ambito"
        className="rounded-lg border border-[var(--atm-linea)] bg-white px-2 py-1 text-xs text-zinc-800"
        value={mostrado}
        disabled={cambiando}
        onChange={(e) => {
          const elegido = ambitos.find(
            (a) => clave(a.contractId, a.regionId) === e.target.value,
          );
          if (elegido) void cambiar(elegido);
        }}
      >
        {ambitos.map((a) => (
          <option key={clave(a.contractId, a.regionId)} value={clave(a.contractId, a.regionId)}>
            {nombre(a)}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
