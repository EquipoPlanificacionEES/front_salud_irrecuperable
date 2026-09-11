"use client";

import type { Cita } from "@/lib/backend";

/**
 * LA CITA DEL PERITAJE, tal como la necesita el médico antes de entrar.
 *
 * Se pinta SÓLO cuando el backend devuelve una: no hay ninguna condición por
 * región en esta pantalla. Un expediente de Valparaíso no tiene cita, la
 * consulta devuelve `null` y este bloque no existe — que es exactamente lo
 * pedido, sin un `if (region)` a la vista.
 */

const ETIQUETA_ESTADO: Record<Cita["status"], string> = {
  PENDING_CONTACT: "Pendiente de contacto",
  CONTACTED: "Contactado",
  SCHEDULED: "Agendada",
  CONFIRMED: "Confirmada",
  COMPLETED: "Realizada",
  NO_SHOW: "No se presentó",
  CANCELLED: "Cancelada",
  RESCHEDULED: "Reagendada",
};

function fechaHora(iso: string | null, zona: string): { fecha: string; hora: string } {
  if (!iso) return { fecha: "Por definir", hora: "Por definir" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { fecha: "Por definir", hora: "Por definir" };
  // La hora se muestra en la zona en que se ACORDÓ, no en la del navegador: el
  // médico y el paciente quedaron a una hora concreta, y convertirla a la zona
  // de quien mira produciría dos horas distintas para la misma cita.
  return {
    fecha: d.toLocaleDateString("es-CL", { timeZone: zona, day: "2-digit", month: "2-digit", year: "numeric" }),
    // 24 HORAS, no "02:00 p. m.". Una cita clínica se lee de un vistazo entre
    // otras tareas, y el sufijo de meridiano es justo lo que se pasa por alto.
    hora: d.toLocaleTimeString("es-CL", {
      timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false,
    }),
  };
}

export function PanelCita({ cita }: { cita: Cita }) {
  const { fecha, hora } = fechaHora(cita.scheduledAt, cita.timezone);

  return (
    <section className="rounded-xl border border-[var(--atm-linea)] bg-white px-5 py-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-800">Peritaje telemático</h3>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-zinc-500">Fecha:</dt>
              <dd className="font-medium text-zinc-800">{fecha}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-zinc-500">Hora:</dt>
              <dd className="font-medium text-zinc-800">{hora}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-zinc-500">Estado:</dt>
              <dd className="font-medium text-zinc-800">{ETIQUETA_ESTADO[cita.status]}</dd>
            </div>
          </dl>
        </div>

        {/*
          EL ENLACE SÓLO EXISTE SI HAY SALA. Un botón que no lleva a ninguna
          parte enseña a pulsarlo dos veces y a desconfiar del siguiente.

          `rel="noopener noreferrer"` no es adorno: sin `noopener`, la pestaña
          que se abre puede reescribir la de origen con `window.opener`, y la de
          origen es una sesión clínica abierta.
        */}
        {cita.meetingUrl && (
          <a
            href={cita.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-[var(--atm-acento)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Unirse a la reunión
          </a>
        )}
      </div>

      {!cita.meetingUrl && (
        <p className="mt-3 text-sm text-zinc-500">
          Todavía no hay enlace de sala. Lo carga coordinación.
        </p>
      )}
    </section>
  );
}
