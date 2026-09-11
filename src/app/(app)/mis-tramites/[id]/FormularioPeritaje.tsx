"use client";

import { useCallback, useMemo, useState } from "react";
import { ApiFallo } from "@/lib/api";
import type { Peritaje } from "@/lib/backend";
import { useCompletarPeritaje, useGuardarBorrador } from "@/lib/queries";

/**
 * EL FORMULARIO DEL PERITAJE TELEMÁTICO.
 *
 * GUARDAR Y COMPLETAR SON DOS BOTONES Y DOS PETICIONES, nunca uno con una
 * casilla. Guardar admite todo vacío y no valida nada; completar valida y cierra
 * el peritaje. Si fueran lo mismo, rellenar campos antes de la entrevista
 * equivaldría a haberse pronunciado — y lo que se firma es lo que quedó escrito.
 *
 * QUÉ CAMPOS HAY, CUÁL ES OPCIONAL Y QUÉ FALTA PARA CERRAR lo dice el servidor.
 * Esta pantalla no conoce un solo campo por nombre: los itera. Escribir aquí la
 * lista crearía una segunda definición, y la primera divergencia sería un campo
 * que la pantalla da por opcional y el servidor rechaza al completar. Es el
 * mismo trato que ya rige el editor del informe.
 */

type Valores = Record<string, string>;

function horaLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function FormularioPeritaje({ caseId, peritaje }: { caseId: string; peritaje: Peritaje }) {
  /**
   * EL BORRADOR EN CURSO. Arranca de lo guardado y se queda en memoria mientras
   * el médico escribe — no se persiste en el navegador: dentro va información
   * clínica de una persona identificada.
   */
  const [valores, setValores] = useState<Valores>(() => ({ ...peritaje.values }));
  const [tocados, setTocados] = useState<Set<string>>(() => new Set());
  const [conflicto, setConflicto] = useState<string | null>(null);
  const [errores, setErrores] = useState<Peritaje["missingForCompletion"]>([]);

  const guardar = useGuardarBorrador(caseId);
  const completar = useCompletarPeritaje(caseId);
  const cerrado = peritaje.status === "COMPLETED";

  const set = useCallback((key: string, valor: string) => {
    setValores((v) => ({ ...v, [key]: valor }));
    setTocados((t) => new Set(t).add(key));
  }, []);

  /** SÓLO lo que se tocó. Lo ausente el servidor lo conserva. */
  const parche = useMemo(() => {
    const out: Valores = {};
    for (const key of tocados) out[key] = valores[key] ?? "";
    return out;
  }, [tocados, valores]);

  const onGuardar = useCallback(() => {
    setConflicto(null);
    guardar.mutate(
      { expectedVersion: peritaje.version, values: parche },
      {
        onSuccess: () => setTocados(new Set()),
        onError: (e) => {
          // 409: otra sesión escribió mientras tanto. NO se pisa ni se descarta
          // lo escrito: se avisa y el texto sigue en pantalla.
          if (e instanceof ApiFallo && e.status === 409) {
            setConflicto(
              "El borrador cambió desde otra sesión. Tu texto sigue aquí; recarga para ver lo guardado antes de continuar.",
            );
          }
        },
      },
    );
  }, [guardar, parche, peritaje.version]);

  const onCompletar = useCallback(() => {
    setErrores([]);
    completar.mutate(undefined, {
      onError: (e) => {
        if (e instanceof ApiFallo && e.status === 422) {
          const detalles = (e.details as { field?: string; issue?: string }[] | undefined) ?? [];
          setErrores(
            detalles.map((d) => ({ key: d.field ?? "", label: "", issue: d.issue ?? "" })),
          );
        }
      },
    });
  }, [completar]);

  const pendientes = errores.length > 0 ? errores : peritaje.missingForCompletion;

  return (
    <div className="space-y-3">
      {peritaje.sections.map((seccion) => (
        <section
          key={seccion.id}
          className="overflow-hidden rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm"
        >
          <h4 className="px-5 py-3 text-sm font-semibold text-zinc-800">{seccion.title}</h4>
          <div className="grid gap-4 border-t border-[var(--atm-linea)] px-5 py-4 sm:grid-cols-2">
            {peritaje.fields.filter((c) => c.sectionId === seccion.id).map((campo) => (
              <label
                key={campo.key}
                className={campo.kind === "LONG_TEXT" ? "block sm:col-span-2" : "block"}
              >
                <span className="text-sm font-medium text-zinc-800">
                  {campo.label}
                  {campo.optional && (
                    <span className="ml-2 text-[11px] font-normal text-zinc-500">
                      opcional
                    </span>
                  )}
                </span>
                {campo.kind === "CHOICE" ? (
                  <select
                    className="mt-1 w-full rounded-lg border border-[var(--atm-linea)] px-3 py-2 text-sm"
                    value={valores[campo.key] ?? ""}
                    disabled={cerrado}
                    onChange={(e) => set(campo.key, e.target.value)}
                  >
                    <option value="">Sin seleccionar</option>
                    {campo.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : campo.kind === "LONG_TEXT" ? (
                  <textarea
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-[var(--atm-linea)] px-3 py-2 text-sm"
                    value={valores[campo.key] ?? ""}
                    disabled={cerrado}
                    onChange={(e) => set(campo.key, e.target.value)}
                  />
                ) : (
                  <input
                    type={campo.kind === "INTEGER" ? "number" : "text"}
                    className="mt-1 w-full rounded-lg border border-[var(--atm-linea)] px-3 py-2 text-sm"
                    value={valores[campo.key] ?? ""}
                    disabled={cerrado}
                    onChange={(e) => set(campo.key, e.target.value)}
                  />
                )}
              </label>
            ))}
          </div>
        </section>
      ))}

      {conflicto && (
        <p role="alert" className="rounded-xl border border-[var(--atm-obs)] bg-amber-50/60 px-5 py-3 text-sm text-zinc-800">
          {conflicto}
        </p>
      )}

      {pendientes.length > 0 && !cerrado && (
        <div className="rounded-xl border border-[var(--atm-linea)] bg-white px-5 py-4">
          <p className="text-sm font-medium text-zinc-800">
            Falta para poder completar el peritaje:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600">
            {pendientes.map((m, i) => (
              <li key={`${m.key}-${i}`}>{m.label ? `${m.label}: ${m.issue}` : m.issue}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--atm-linea)] bg-white px-5 py-4">
        <span className="text-sm text-zinc-600">
          Estado:{" "}
          <strong className="font-medium text-zinc-800">
            {cerrado ? "Completado" : "Borrador"}
          </strong>
          {" · "}
          Último guardado: {horaLocal(peritaje.lastSavedAt)}
        </span>

        <span className="ml-auto flex items-center gap-3">
          {guardar.isPending && <span className="text-sm text-zinc-500">Guardando…</span>}
          {!guardar.isPending && guardar.isSuccess && tocados.size === 0 && (
            <span className="text-sm text-emerald-700">Guardado</span>
          )}
          {guardar.isError && !conflicto && (
            <span className="text-sm text-red-700">Error al guardar</span>
          )}

          <button
            type="button"
            onClick={onGuardar}
            disabled={cerrado || guardar.isPending}
            className="rounded-lg border border-[var(--atm-linea)] px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-[var(--atm-fondo)] disabled:opacity-50"
          >
            Guardar borrador
          </button>

          {/*
            COMPLETAR ES OTRO BOTÓN, con otro peso visual. No se deshabilita
            cuando faltan campos: pulsarlo y que el servidor diga QUÉ falta es
            más útil que un botón apagado que no explica por qué.
          */}
          <button
            type="button"
            onClick={onCompletar}
            disabled={cerrado || completar.isPending}
            className="rounded-lg bg-[var(--atm-acento)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {completar.isPending ? "Completando…" : "Completar peritaje"}
          </button>
        </span>
      </div>
    </div>
  );
}
