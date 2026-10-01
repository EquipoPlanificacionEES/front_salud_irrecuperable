"use client";

import { useEffect, useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import { useInvalidar } from "@/lib/queries";
import { Btn } from "../ui";
import { seArreglaReleyendo, type Hallazgo } from "../control-previo/ControlPrevio";

/**
 * RELEER UN EXPEDIENTE QUE SE LEYÓ MAL — desde donde se trabaja.
 *
 * POR QUÉ ESTÁ AQUÍ Y NO EN CONTROL PREVIO. La acción existía sólo en esa
 * pantalla, y Control previo salió del menú cuando dejó de ser un paso del
 * flujo: validar advertencias ya no retiene ningún documento. Pero reprocesar
 * NUNCA fue eso — es soporte técnico, y sigue haciendo falta. Al quitar la
 * pantalla se quedó sin ruta alcanzable justo el único expediente que la
 * necesitaba. Ahora vive en Casos, donde coordinación ya entra.
 *
 * NO DUPLICA NADA. Llama al endpoint ya desplegado y usa el MISMO clasificador
 * que decide qué se arregla releyendo (`seArreglaReleyendo`), así que la interfaz
 * no puede ofrecer un botón que el servidor rechazaría.
 *
 * SE PIDEN LOS HALLAZGOS AL ABRIR, no en el listado: son una consulta por
 * expediente, y pedirlas para pintar la tabla serían tantas consultas como filas.
 */
export function ReleerExpediente({
  caseId,
  externalCaseId,
  onCerrar,
  onHecho,
}: {
  caseId: string;
  externalCaseId: string;
  onCerrar: () => void;
  onHecho: (texto: string) => void;
}) {
  const [hallazgos, setHallazgos] = useState<Hallazgo[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const invalidar = useInvalidar();

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await api<{ findings: Hallazgo[] }>(`/admin/cases/${caseId}/qa`);
        if (vivo) setHallazgos(r.findings ?? []);
      } catch (e) {
        if (vivo) setError(e instanceof ApiFallo ? e.message : "No se pudo cargar el control previo.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [caseId]);

  async function reprocesar(f: Hallazgo) {
    setBusy(f.findingKey);
    setError(null);
    try {
      await api(`/admin/cases/${caseId}/qa/${f.findingKey}/reprocess`, { json: {} });
      onHecho(
        `Expediente ${externalCaseId} en cola para releerse. Cuando termine, el control previo se ` +
          `recalcula solo; si la lectura sale bien, vuelve a la bandeja del médico.`,
      );
      await invalidar.expedienteReprocesado(caseId);
      onCerrar();
    } catch (e) {
      setError(e instanceof ApiFallo ? e.message : "No se pudo reprocesar.");
    } finally {
      setBusy(null);
    }
  }

  const releibles = (hallazgos ?? []).filter((f) => seArreglaReleyendo(f.code));
  const otros = (hallazgos ?? []).filter((f) => !seArreglaReleyendo(f.code));

  return (
    <div data-testid="releer-expediente" className="max-w-3xl space-y-3 py-2">
      <p className="text-sm font-medium text-zinc-800">Lectura del expediente {externalCaseId}</p>
      {cargando && <p className="text-xs text-zinc-500">Cargando el control previo…</p>}
      {error && <p className="text-xs text-[var(--atm-mal)]">{error}</p>}

      {!cargando && releibles.length === 0 && (
        <p className="text-xs text-zinc-600">
          No hay ninguna advertencia que se arregle releyendo este expediente.
        </p>
      )}

      {releibles.map((f) => (
        <div key={f.findingKey} className="rounded-lg border border-[var(--atm-linea)] p-3">
          <p className="text-sm text-zinc-800">{f.statement}</p>
          <p className="mt-1 text-xs text-zinc-600">{f.evidence}</p>
          <p className="mt-2 text-xs text-zinc-600">
            Hay prueba de que los antecedentes se leyeron mal. No se valida con una nota: hay que
            volver a leerlos. Se preservará el trabajo del profesional —si lo hubiera, el reproceso se
            rechaza.
          </p>
          <div className="mt-2">
            <Btn
              variante="primary"
              className="px-3 py-1 text-xs"
              disabled={busy !== null}
              onClick={() => void reprocesar(f)}
            >
              {busy === f.findingKey ? "Encolando…" : "Reprocesar"}
            </Btn>
          </div>
        </div>
      ))}

      {otros.length > 0 && (
        <div className="rounded-lg border border-[var(--atm-linea)] bg-[var(--atm-fondo)] p-3">
          <p className="text-xs font-medium text-zinc-700">
            Otras observaciones, que NO se arreglan releyendo
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-zinc-600">
            {otros.map((f) => (
              <li key={f.findingKey}>
                {f.statement} <span className="text-zinc-500">({f.evidence})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button onClick={onCerrar} className="text-xs text-zinc-500 underline">
        Cerrar
      </button>
    </div>
  );
}
