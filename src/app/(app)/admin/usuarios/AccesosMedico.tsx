"use client";

import { useState } from "react";
import { ApiFallo } from "@/lib/api";
import type { AdminDoctor } from "@/lib/backend";
import { useDoctorAccess, useSetDoctorAccess } from "@/lib/queries";

/**
 * DÓNDE PUEDE TRABAJAR ESTE MÉDICO.
 *
 * Una casilla por ámbito —un contrato en una región—, que es la unidad que
 * opera la plataforma. Marcar NO reparte expedientes: sólo permite que
 * administración pueda elegir a este profesional cuando reparta.
 *
 * UN MÉDICO ES UNA SOLA IDENTIDAD. Habilitarlo en otra región no crea otro
 * usuario, otro perfil, otra firma ni otro RNPI: los mismos de siempre pasan a
 * poder trabajar un ámbito más.
 *
 * DESMARCAR PUEDE FALLAR, y es a propósito: mientras lleve expedientes de ese
 * ámbito el servidor lo rechaza y dice cuántos son. Nada se reasigna solo —
 * decidir a quién pasa el trabajo de una persona no es un efecto secundario.
 */
export function AccesosMedico({ doctor }: { doctor: AdminDoctor }) {
  const { data: scopes, isLoading, error } = useDoctorAccess(doctor.id);
  const cambiar = useSetDoctorAccess(doctor.id);
  const [fallo, setFallo] = useState<string | null>(null);
  const [tocando, setTocando] = useState<string | null>(null);

  function alternar(contractRegionId: string, granted: boolean) {
    setFallo(null);
    setTocando(contractRegionId);
    cambiar.mutate(
      { contractRegionId, granted },
      {
        // El motivo del rechazo ES la información: «tiene 12 casos activos»
        // es lo que le dice al administrador qué hacer antes de reintentar.
        onError: (e) => setFallo(e instanceof ApiFallo ? e.message : "No se pudo cambiar el acceso."),
        onSettled: () => setTocando(null),
      },
    );
  }

  return (
    <div className="rounded-lg border border-[var(--atm-linea)] bg-[var(--atm-fondo)] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Acceso a contratos y regiones</p>
      <p className="mt-0.5 text-xs text-zinc-500">
        Habilitar una región no asigna casos: sólo permite elegir a este médico al repartir.
      </p>

      {isLoading && <p className="mt-2 text-sm text-zinc-400">Cargando accesos…</p>}
      {error && <p className="mt-2 text-sm text-[var(--atm-mal)]">No se pudieron cargar los accesos.</p>}
      {fallo && (
        <p className="mt-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-[var(--atm-mal)]">{fallo}</p>
      )}

      {scopes && scopes.length === 0 && (
        <p className="mt-2 text-sm text-zinc-500">No hay contratos con región configurada todavía.</p>
      )}

      <ul className="mt-2 space-y-1">
        {(scopes ?? []).map((s) => (
          <li key={s.contractRegionId} className="flex items-center gap-3 text-sm">
            <input
              id={`acceso-${doctor.id}-${s.contractRegionId}`}
              type="checkbox"
              checked={s.granted}
              disabled={cambiar.isPending && tocando === s.contractRegionId}
              onChange={(e) => alternar(s.contractRegionId, e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300"
            />
            <label htmlFor={`acceso-${doctor.id}-${s.contractRegionId}`} className="flex-1 cursor-pointer">
              <span className="text-zinc-800">{s.regionName}</span>{" "}
              <span className="text-xs text-zinc-500">· {s.contractName}</span>
            </label>
            {/* La carga sólo se anuncia cuando la hay: un «0 casos» en cada
                línea es ruido en la única pantalla donde importa leer. */}
            {s.activeAssignments > 0 && (
              <span className="text-xs text-zinc-500">
                {s.activeAssignments} caso{s.activeAssignments === 1 ? "" : "s"} activo
                {s.activeAssignments === 1 ? "" : "s"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
