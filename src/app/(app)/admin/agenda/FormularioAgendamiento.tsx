"use client";

import { useState } from "react";
import type { Cita } from "@/lib/backend";
import { useActualizarCita, useCita, useCrearCita } from "@/lib/queries";

/**
 * AGENDAMIENTO DESDE COORDINACIÓN.
 *
 * Lo que hace falta para poder llamar a alguien y ponerle hora, y nada más.
 * Esta pantalla NO muestra contenido clínico: coordinación no lo necesita y no
 * debe tenerlo.
 *
 * La fecha y la hora se escriben en la zona del contrato, que es en la que se
 * acordó. Se envían al servidor en UTC porque es lo que el contrato de la API
 * pide, y se recuperan convirtiéndolas de vuelta: quien las escribió tiene que
 * volver a leer lo mismo que escribió.
 */

/** ISO en UTC -> valores de `<input type=date|time>` en la zona indicada. */
function partes(iso: string | null, zona: string): { fecha: string; hora: string } {
  if (!iso) return { fecha: "", hora: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { fecha: "", hora: "" };
  const f = new Intl.DateTimeFormat("sv-SE", {
    timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
  // `sv-SE` da "YYYY-MM-DD HH:MM", que es justo lo que los inputs esperan.
  const [fecha, hora] = f.split(" ");
  return { fecha: fecha ?? "", hora: hora ?? "" };
}

/**
 * Reconstruye el instante UTC a partir de lo escrito y de la zona del contrato.
 *
 * Se calcula el desfase REAL de esa zona en esa fecha en vez de restar una
 * constante: Chile cambia de horario, y una cita de marzo y otra de julio no
 * comparten desfase. Con una constante, media agenda se desplazaría una hora al
 * cambiar la estación.
 */
function aUtc(fecha: string, hora: string, zona: string): string | null {
  if (!fecha || !hora) return null;
  const tentativo = new Date(`${fecha}T${hora}:00Z`);
  if (Number.isNaN(tentativo.getTime())) return null;
  const enZona = new Intl.DateTimeFormat("sv-SE", {
    timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(tentativo);
  const desfase = tentativo.getTime() - new Date(enZona.replace(" ", "T") + "Z").getTime();
  return new Date(tentativo.getTime() + desfase).toISOString();
}

/**
 * Carga la cita y monta el formulario SÓLO cuando ya hay respuesta.
 *
 * El formulario inicializa su estado en el montaje, así que montarlo antes de
 * que llegue el dato lo dejaría con los campos vacíos para siempre: la cita
 * llegaría después y `useState` ya no la miraría. La `key` fuerza un montaje
 * nuevo cuando cambia la cita —al crearla, por ejemplo—, que es cuando el
 * estado inicial tiene que volver a calcularse.
 */
export function FormularioAgendamiento({
  caseId,
  zona = "America/Santiago",
}: {
  caseId: string;
  zona?: string;
}) {
  const citaQ = useCita(caseId, true);
  if (citaQ.isPending) {
    return (
      <section className="rounded-xl border border-[var(--atm-linea)] bg-white px-5 py-4 text-sm text-zinc-500">
        Cargando el agendamiento…
      </section>
    );
  }
  return (
    <Formulario
      key={citaQ.data?.id ?? "sin-cita"}
      caseId={caseId}
      zona={zona}
      cita={citaQ.data ?? null}
    />
  );
}

function Formulario({
  caseId,
  zona,
  cita,
}: {
  caseId: string;
  zona: string;
  cita: Cita | null;
}) {
  const inicial = partes(cita?.scheduledAt ?? null, cita?.timezone ?? zona);
  const [fecha, setFecha] = useState(inicial.fecha);
  const [hora, setHora] = useState(inicial.hora);
  const [meetingUrl, setMeetingUrl] = useState(cita?.meetingUrl ?? "");
  const [nota, setNota] = useState(cita?.coordinationNote ?? "");
  const [tocado, setTocado] = useState(false);

  const crear = useCrearCita(caseId);
  const actualizar = useActualizarCita(caseId, cita?.id ?? "");
  const guardando = crear.isPending || actualizar.isPending;

  // El enlace es opcional, pero si se escribe tiene que ser https: un `http://`
  // en una teleconsulta clínica es una sala sin cifrar.
  const enlaceInvalido = meetingUrl.trim() !== "" && !meetingUrl.trim().startsWith("https://");

  function guardar() {
    const cuerpo = {
      scheduledAt: aUtc(fecha, hora, cita?.timezone ?? zona),
      meetingUrl: meetingUrl.trim() === "" ? null : meetingUrl.trim(),
      coordinationNote: nota.trim() === "" ? null : nota.trim(),
    };
    setTocado(true);
    if (cita) actualizar.mutate(cuerpo);
    else crear.mutate(cuerpo);
  }

  return (
    <section className="rounded-xl border border-[var(--atm-linea)] bg-white px-5 py-4 shadow-sm">
      <h3 className="text-sm font-semibold text-zinc-800">Agendamiento del peritaje</h3>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-zinc-800">Fecha</span>
          <input
            type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--atm-linea)] px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-zinc-800">Hora</span>
          <input
            type="time" value={hora} onChange={(e) => setHora(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--atm-linea)] px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-zinc-800">Enlace de la sala</span>
          <input
            type="url" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full rounded-lg border border-[var(--atm-linea)] px-3 py-2 text-sm"
          />
          {enlaceInvalido && (
            <span className="mt-1 block text-xs text-red-700">
              El enlace tiene que empezar por https://
            </span>
          )}
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-zinc-800">Observación administrativa</span>
          <textarea
            rows={2} value={nota} onChange={(e) => setNota(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--atm-linea)] px-3 py-2 text-sm"
            placeholder="Cómo fue el contacto, si hubo que reagendar, etc. Nunca información clínica."
          />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="text-sm text-zinc-600">
          Estado:{" "}
          <strong className="font-medium text-zinc-800">
            {cita ? cita.status : "Sin agendar"}
          </strong>
        </span>
        <span className="ml-auto flex items-center gap-3">
          {guardando && <span className="text-sm text-zinc-500">Guardando…</span>}
          {!guardando && tocado && (crear.isSuccess || actualizar.isSuccess) && (
            <span className="text-sm text-emerald-700">Guardado</span>
          )}
          {(crear.isError || actualizar.isError) && (
            <span role="alert" className="text-sm text-red-700">No se pudo guardar.</span>
          )}
          <button
            type="button" onClick={guardar} disabled={guardando || enlaceInvalido}
            className="rounded-lg bg-[var(--atm-acento)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Guardar agendamiento
          </button>
        </span>
      </div>
    </section>
  );
}
