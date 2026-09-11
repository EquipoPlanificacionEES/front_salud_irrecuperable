"use client";

import { useState } from "react";
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

export function SelectorAmbito({
  ambitos,
  activoContractId,
}: {
  ambitos: Ambito[];
  activoContractId: string;
}) {
  const router = useRouter();
  const [cambiando, setCambiando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (ambitos.length === 0) return null;

  const activo =
    ambitos.find((a) => a.contractId === activoContractId) ?? ambitos[0];

  // UN SOLO ÁMBITO: se entra directo y sólo se deja constancia de dónde.
  if (ambitos.length === 1) {
    return (
      <span className="text-xs text-zinc-500" data-testid="ambito-activo">
        {nombre(activo)}
      </span>
    );
  }

  async function cambiar(a: Ambito) {
    if (a.contractId === activo.contractId && a.regionId === activo.regionId) return;
    setCambiando(true);
    setError(null);
    try {
      await api("/auth/active-scope", {
        json: { contractId: a.contractId, regionId: a.regionId },
      });
      // Recarga de datos del servidor: todo lo que hay en pantalla pertenece al
      // ámbito anterior y no se puede reetiquetar en el cliente.
      router.refresh();
    } catch {
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
        value={`${activo.contractId}|${activo.regionId ?? ""}`}
        disabled={cambiando}
        onChange={(e) => {
          const [contractId, regionId] = e.target.value.split("|");
          const elegido = ambitos.find(
            (a) => a.contractId === contractId && (a.regionId ?? "") === regionId,
          );
          if (elegido) void cambiar(elegido);
        }}
      >
        {ambitos.map((a) => (
          <option key={`${a.contractId}|${a.regionId ?? ""}`} value={`${a.contractId}|${a.regionId ?? ""}`}>
            {nombre(a)}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
