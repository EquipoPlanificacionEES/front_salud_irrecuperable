"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import { CASE_STATUS_LABEL, type HeldCase } from "@/lib/backend";
import { Aviso, Btn, Campo, Chip, FilaVacia, Tabla, Textarea } from "../ui";

/**
 * GESTIÓN DE RETENCIONES.
 *
 * Una retención es una INCIDENCIA ADMINISTRATIVA: detiene la decisión médica
 * porque hay algo que resolver antes, y resolverlo no le corresponde a quien
 * firma. Esta pantalla existe para que quien la resuelve no tenga que abrir la
 * base de datos ni ejecutar un script.
 *
 * DOS DIAGNÓSTICOS QUE NO SE MEZCLAN, y por eso ocupan dos columnas:
 *
 *   · LA RETENCIÓN — por qué la administración paró el expediente;
 *   · EL PROCESAMIENTO — en qué quedó el pipeline técnico.
 *
 * Los dos expedientes retenidos por documento duplicado fallaron ADEMÁS el
 * análisis por un error del proveedor de IA. Son hechos independientes:
 * levantar la retención no arregla el análisis, y reintentar el análisis no
 * resuelve el duplicado. Quien decide necesita ver los dos.
 */

const MOTIVO_LEGIBLE: Record<string, string> = {
  DUPLICATE_SOURCE_DOCUMENT: "Documento fuente duplicado",
  SOURCE_IDENTITY_CONFLICT: "Conflicto de identidad en el expediente",
};

/** Qué pasará al levantarla. Se dice ANTES de pulsar, no después. */
function consecuencia(caso: HeldCase): string {
  if (caso.classificationIfResolved === "PENDING_REVIEW") {
    return "Al levantarla, el expediente vuelve automáticamente a la bandeja del médico.";
  }
  if (caso.classificationIfResolved === "SIGNED") {
    return "El expediente ya está firmado: levantar la retención no lo devuelve al circuito.";
  }
  return (
    "Este expediente no tiene informe. Levantar la retención NO lo envía al médico: " +
    "hace falta reprocesarlo para que el sistema produzca uno."
  );
}

export function Retenidos() {
  const [casos, setCasos] = useState<HeldCase[] | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [reprocesar, setReprocesar] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const d = await api<{ holds: HeldCase[] }>("/admin/holds");
      setCasos(d.holds);
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudieron cargar las retenciones." });
      setCasos([]);
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  function abrir(caso: HeldCase) {
    setAbierto(caso.holdId);
    setNota("");
    // El reproceso se ofrece marcado sólo cuando es lo que hace falta: sin
    // informe, levantar la retención por sí sola no desbloquea nada.
    setReprocesar(caso.classificationIfResolved === "NO_REPORT");
    setMsg(null);
  }

  async function resolver(caso: HeldCase) {
    if (nota.trim().length < 10) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ operationalStatus: string; processingJobId: string | null }>(
        `/admin/cases/${caso.caseId}/holds/${caso.holdId}/resolve`,
        { json: { resolutionNote: nota.trim(), ...(reprocesar ? { reprocess: true } : {}) } },
      );
      setAbierto(null);
      // Se recarga la lista: la retención resuelta desaparece de ella.
      await cargar();
      setMsg({
        ok: true,
        texto:
          r.operationalStatus === "PENDING_REVIEW"
            ? `Retención levantada. El trámite ${caso.externalCaseId} volvió a la bandeja del médico.`
            : r.processingJobId
              ? `Retención levantada y reproceso encolado para el trámite ${caso.externalCaseId}. ` +
                "Llegará al médico si el procesamiento produce un informe."
              : `Retención levantada. El trámite ${caso.externalCaseId} no tiene informe, así que todavía ` +
                "no llega al médico.",
      });
    } catch (e) {
      setMsg({
        ok: false,
        texto:
          e instanceof ApiFallo
            ? e.status === 409
              ? "Esta retención ya fue resuelta por otra persona. Recarga la lista."
              : e.message
            : "No se pudo levantar la retención.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {msg && <Aviso ok={msg.ok}>{msg.texto}</Aviso>}

      <Tabla columnas={["Trámite", "Retención", "Procesamiento", "Informe", "Médico", ""]}>
        {casos === null && <FilaVacia cols={6}>Cargando…</FilaVacia>}
        {casos?.length === 0 && <FilaVacia cols={6}>No hay expedientes retenidos.</FilaVacia>}
        {casos?.map((c) => (
          <>
            <tr key={c.holdId} className="border-t border-[var(--atm-linea)]">
              <td className="px-4 py-2.5 font-mono text-xs text-zinc-800">{c.externalCaseId}</td>
              <td className="px-4 py-2.5">
                <Chip tono="obs">{MOTIVO_LEGIBLE[c.hold.reason ?? ""] ?? "Retenido"}</Chip>
              </td>
              {/* EL PROCESAMIENTO, EN SU PROPIA COLUMNA. No es lo mismo que la
                  retención, y mezclarlos hace creer que levantarla arregla el
                  análisis. */}
              <td className="px-4 py-2.5 text-xs text-zinc-600">
                <div>{CASE_STATUS_LABEL[c.processing.caseStatus] ?? c.processing.caseStatus}</div>
                {c.processing.lastRun?.errorCode && (
                  <div className="mt-0.5 font-mono text-[11px] text-[var(--atm-mal)]">
                    {c.processing.lastRun.errorCode}
                    {c.processing.attempts > 0 && ` · ${c.processing.attempts} intento(s)`}
                  </div>
                )}
              </td>
              <td className="px-4 py-2.5 text-xs text-zinc-600">
                {c.report ? "Disponible" : "Sin informe"}
              </td>
              <td className="px-4 py-2.5 text-xs text-zinc-600">{c.doctor?.fullName ?? "—"}</td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                {c.sourceDocument && (
                  <a
                    href={`/api/v1${c.sourceDocument.downloadUrl.replace(/^\/api\/v1/, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mr-1 rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs font-medium text-[var(--atm-azul)] hover:bg-blue-50"
                  >
                    Ver antecedentes
                  </a>
                )}
                <Btn variante="ghost" onClick={() => (abierto === c.holdId ? setAbierto(null) : abrir(c))}>
                  {abierto === c.holdId ? "Mantener retenido" : "Revisar"}
                </Btn>
              </td>
            </tr>

            {abierto === c.holdId && (
              <tr key={`${c.holdId}-detalle`} className="border-t border-[var(--atm-linea)] bg-[var(--atm-fondo)]">
                <td colSpan={6} className="px-4 py-4">
                  <div className="space-y-3">
                    <dl className="grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
                      <Dato etiqueta="Retenido desde" valor={new Date(c.createdAt).toLocaleString("es-CL")} />
                      <Dato etiqueta="Detalle de la incidencia" valor={c.detail ?? "—"} />
                      <Dato
                        etiqueta="Último procesamiento"
                        valor={
                          c.processing.lastRun
                            ? `${c.processing.lastRun.trigger} · ${c.processing.lastRun.status} · ` +
                              new Date(c.processing.lastRun.createdAt).toLocaleString("es-CL")
                            : "Sin ejecuciones registradas"
                        }
                      />
                      <Dato etiqueta="Error" valor={c.processing.lastRun?.errorMessage ?? "—"} />
                      {c.duplicates.length > 0 && (
                        <Dato
                          etiqueta="Mismo contenido que"
                          valor={`${c.duplicates.map((d) => d.externalCaseId).join(", ")} — es una pista para investigar, no una conclusión`}
                        />
                      )}
                    </dl>

                    <p className="rounded-lg border border-[var(--atm-azul2)] bg-blue-50 px-3 py-2 text-sm text-[var(--atm-azul)]">
                      {consecuencia(c)}
                    </p>

                    <Campo
                      label="Motivo de la resolución"
                      hint="Queda registrado. Es lo que habrá que releer si la decisión se cuestiona."
                    >
                      <Textarea
                        rows={3}
                        className="w-full"
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        placeholder="Qué se revisó y por qué se levanta la retención"
                      />
                    </Campo>

                    {c.classificationIfResolved === "NO_REPORT" && (
                      <label className="flex items-center gap-2 text-sm text-zinc-700">
                        <input
                          type="checkbox"
                          checked={reprocesar}
                          onChange={(e) => setReprocesar(e.target.checked)}
                        />
                        Reprocesar el expediente al levantar la retención
                      </label>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <Btn variante="neutral" onClick={() => setAbierto(null)}>
                        Mantener retenido
                      </Btn>
                      <Btn
                        onClick={() => void resolver(c)}
                        disabled={busy || nota.trim().length < 10}
                      >
                        {busy
                          ? "Resolviendo…"
                          : reprocesar
                            ? "Resolver y reprocesar"
                            : "Resolver retención"}
                      </Btn>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </>
        ))}
      </Tabla>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-zinc-500">{etiqueta}:</dt>
      <dd className="text-zinc-800">{valor}</dd>
    </div>
  );
}
