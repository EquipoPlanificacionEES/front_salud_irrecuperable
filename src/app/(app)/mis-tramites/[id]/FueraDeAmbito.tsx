"use client";

import { useState } from "react";
import { useDevolverFueraDeAmbito } from "@/lib/queries";

/**
 * DEVOLVER UN EXPEDIENTE QUE NO ES MATERIA DE SALUD MENTAL.
 *
 * Saca el expediente del circuito, así que no puede estar a un clic. Se pide
 * motivo escrito y una confirmación explícita, y se dice ANTES lo que va a
 * pasar: quien pulsa tiene que saber que el caso deja de ser suyo y queda
 * esperando a Coordinación.
 *
 * NO se ofrece elegir la especialidad que corresponde. Eso lo decide quien
 * reasigna, con el expediente delante; un desplegable aquí invitaría a decidirlo
 * de memoria.
 */

const MINIMO = 10;

export function FueraDeAmbito({ caseId }: { caseId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const devolver = useDevolverFueraDeAmbito(caseId);

  const corto = motivo.trim().length < MINIMO;

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-lg border border-[var(--atm-obs)] px-4 py-2 text-sm font-medium text-[var(--atm-obs)] hover:bg-amber-50"
      >
        No corresponde a salud mental
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Devolver el expediente por no corresponder a salud mental"
      className="rounded-xl border border-[var(--atm-obs)] bg-amber-50/60 px-5 py-4"
    >
      <p className="text-sm font-medium text-zinc-800">
        Este caso dejará el flujo psiquiátrico y quedará pendiente de reasignación
        por Coordinación/COMPIN.
      </p>
      <p className="mt-1 text-sm text-zinc-600">
        No se emitirá informe ni se firmará nada. La decisión queda registrada con
        tu nombre.
      </p>

      <label className="mt-3 block text-sm">
        <span className="font-medium text-zinc-800">Motivo</span>
        <textarea
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--atm-linea)] px-3 py-2 text-sm"
          placeholder="Por qué el cuadro no corresponde a materia de salud mental."
        />
      </label>
      {corto && motivo.length > 0 && (
        <p className="mt-1 text-xs text-zinc-600">
          El motivo tiene que explicar la decisión: al menos {MINIMO} caracteres.
        </p>
      )}

      {devolver.isError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          No se pudo devolver el expediente.
        </p>
      )}

      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={() => { setAbierto(false); setMotivo(""); }}
          disabled={devolver.isPending}
          className="rounded-lg border border-[var(--atm-linea)] px-4 py-2 text-sm text-zinc-800 hover:bg-white"
        >
          Cancelar
        </button>
        {/*
          La confirmación es un botón APARTE del que abre, y sólo se habilita
          con motivo suficiente: sacar un expediente del circuito no puede
          ocurrir por un clic de más sobre el mismo sitio.
        */}
        <button
          type="button"
          onClick={() => devolver.mutate({ reason: motivo.trim() })}
          disabled={corto || devolver.isPending}
          className="rounded-lg bg-[var(--atm-obs)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {devolver.isPending ? "Devolviendo…" : "Confirmar devolución"}
        </button>
      </div>
    </div>
  );
}
