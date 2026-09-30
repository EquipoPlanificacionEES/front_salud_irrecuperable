"use client";

import { useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import { useBatches } from "@/lib/queries";
import { Aviso, Btn, Campo, Chip, FilaVacia, Select, Tabla, Textarea } from "../ui";

// GET  /api/v1/admin/batches/:id/qa
// GET  /api/v1/admin/cases/:caseId/qa
// POST /api/v1/admin/cases/:caseId/qa/:findingKey/resolve   {note}
// POST /api/v1/admin/batches/:id/final-documents/reconcile

/**
 * CONTROL PREVIO — LA PANTALLA DE COORDINACIÓN.
 *
 * QUÉ SE DECIDE AQUÍ, y qué no. Aquí se revisa si una advertencia sobre los
 * ANTECEDENTES permite emitir el documento. NO se toca el pronunciamiento del
 * médico, que ya está firmado y congelado: resolver una advertencia no cambia
 * una coma de lo que él escribió.
 *
 * Y NO SE «IGNORA» NADA. El hallazgo sigue en el expediente y el informe lo
 * sigue diciendo. Lo que se registra es que una persona con nombre lo miró y
 * escribió por qué se puede emitir igual.
 */

interface Hallazgo {
  code: string;
  statement: string;
  evidence: string;
  severity: string;
  blocksMedicalWork: boolean;
  blocksFinalization: boolean;
  findingKey: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

interface FilaQa {
  caseId: string;
  externalCaseId: string;
  blocksMedicalWork: boolean;
  blocksFinalization: boolean;
  findings: Hallazgo[];
}

/**
 * QUÉ HACE FALTA PARA DESTRABAR UN HALLAZGO, dicho en la lengua de quien opera.
 *
 * El código interno no es una instrucción: `MASTER_COVERAGE_UNVERIFIED` no le
 * dice a nadie qué botón pulsar. La categoría sí, y sale del propio hallazgo —
 * nunca de la región ni del expediente.
 *
 *   · LIMITACION_FUENTE — el documento no declara algo y no hay nada que releer.
 *     Lo revisa coordinación y queda escrito.
 *   · APORTE_MEDICO — falta un dato que el expediente SÍ tiene y que sólo el
 *     profesional puede leer y consignar. Hay que devolvérselo.
 *   · TECNICO — prueba de que los antecedentes están mal. No se valida con una
 *     nota: se corrigen.
 */
type Categoria = "LIMITACION_FUENTE" | "APORTE_MEDICO" | "TECNICO";

const CATEGORIA: Record<string, Categoria> = {
  MASTER_COVERAGE_PARTIAL: "LIMITACION_FUENTE",
  MASTER_COVERAGE_UNVERIFIED: "LIMITACION_FUENTE",
  LICENSE_STATES_ALL_UNKNOWN: "APORTE_MEDICO",
  AUTHORIZED_DAYS_UNAVAILABLE: "APORTE_MEDICO",
  SOURCE_LICENSE_COUNT_MISMATCH: "TECNICO",
  MASTER_ROW_WITHOUT_EVIDENCE: "TECNICO",
  STALE_ANALYSIS: "TECNICO",
};

/** Un hallazgo que cierra el trabajo médico es técnico, lo diga o no el mapa. */
export function categoriaDe(f: Pick<Hallazgo, "code" | "blocksMedicalWork">): Categoria {
  if (f.blocksMedicalWork) return "TECNICO";
  return CATEGORIA[f.code] ?? "LIMITACION_FUENTE";
}

/** Qué falta, en una frase. */
const QUE_FALTA: Record<Categoria, string> = {
  LIMITACION_FUENTE:
    "El documento de origen no declara este dato. Releerlo no va a traerlo: hace falta que coordinación confirme que la limitación es de la fuente.",
  APORTE_MEDICO:
    "El dato está en el expediente pero el sistema no pudo leerlo. Sólo el profesional puede consignarlo, revisando los antecedentes.",
  TECNICO:
    "Hay prueba de que los antecedentes se leyeron mal. No se valida con una nota: hay que corregirlos.",
};

interface InformeLote {
  version: string;
  totalCases: number;
  cases: FilaQa[];
}

export function ControlPrevio() {
  const { data: semanas = [], isPending } = useBatches({ status: "OPEN" });
  const [elegida, setElegida] = useState<string | null>(null);
  const batchId = elegida ?? (semanas[0]?.batch.id ?? "");

  const [informe, setInforme] = useState<InformeLote | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  /** El caso cuya devolución se está confirmando, y su motivo. */
  const [devolviendo, setDevolviendo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function cargar(id = batchId) {
    if (!id) return;
    setInforme(await api<InformeLote>(`/admin/batches/${id}/qa`));
  }

  /**
   * CONCILIAR ANTES DE MOSTRAR. Un reproceso puede haber hecho desaparecer la
   * última advertencia de un expediente ya ratificado sin que nadie pulsara
   * nada; entonces su documento se puede emitir y nadie lo ha pedido. Es
   * idempotente: los que ya tienen documento no se tocan.
   */
  async function conciliarYCargar() {
    if (!batchId) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ emitted: string[] }>(
        `/admin/batches/${batchId}/final-documents/reconcile`,
        { json: {} },
      );
      if (r.emitted.length > 0) {
        setMsg({
          ok: true,
          texto: `Se emitieron ${r.emitted.length} documento(s) que ya no tenían nada pendiente: ${r.emitted.join(", ")}.`,
        });
      }
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo revisar el lote." });
    } finally {
      setBusy(false);
    }
  }

  async function resolver(caso: FilaQa, hallazgo: Hallazgo) {
    if (nota.trim().length < 10) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{
        remainingFinalizationBlockers: number;
        finalDocumentQueued: boolean;
      }>(`/admin/cases/${caso.caseId}/qa/${hallazgo.findingKey}/resolve`, {
        json: { note: nota.trim() },
      });
      setMsg({
        ok: true,
        texto: r.finalDocumentQueued
          ? `Revisada. Era la última: el documento final de ${caso.externalCaseId} se está emitiendo. El médico no tiene que hacer nada.`
          : `Revisada. A ${caso.externalCaseId} le quedan ${r.remainingFinalizationBlockers} advertencia(s) antes de poder emitir.`,
      });
      setNota("");
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo registrar la revisión." });
    } finally {
      setBusy(false);
    }
  }

  /**
   * DEVOLVER AL MÉDICO — la otra mitad del control previo.
   *
   * Una advertencia que sólo el profesional puede resolver no se valida desde
   * aquí: se le devuelve el informe para que complete lo que falta. El endpoint
   * es el de siempre y hace lo de siempre —supera la versión vigente y abre la
   * siguiente en revisión con el mismo contenido—, así que su pronunciamiento
   * anterior no se pierde y tendrá que volver a ratificar.
   *
   * EL `reportId` NO VIENE EN ESTA PANTALLA, que trabaja por expediente. Se
   * pide al mismo atajo que usa el resto del frontend cuando sólo tiene el
   * caso; así esta pantalla no necesita que el listado cambie de forma.
   */
  async function devolver(caso: FilaQa) {
    if (motivo.trim().length < 10) return;
    setBusy(true);
    setMsg(null);
    try {
      const informe = await api<{ id: string }>(`/cases/${caso.caseId}/report`);
      await api(`/reports/${informe.id}/return-to-doctor`, { json: { reason: motivo.trim() } });
      setMsg({
        ok: true,
        texto:
          `${caso.externalCaseId} volvió al médico. Cuando complete las cifras y ratifique de nuevo, ` +
          "el documento se emitirá si no queda ninguna otra advertencia.",
      });
      setMotivo("");
      setDevolviendo(null);
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo devolver el informe." });
    } finally {
      setBusy(false);
    }
  }

  const casos = informe?.cases ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Campo label="Semana">
          <Select
            value={batchId}
            disabled={isPending}
            onChange={(e) => {
              setElegida(e.target.value);
              setInforme(null);
            }}
          >
            {semanas.map((s) => (
              <option key={s.batch.id} value={s.batch.id}>
                {s.batch.name}
              </option>
            ))}
          </Select>
        </Campo>
        <Btn onClick={() => void conciliarYCargar()} disabled={busy}>
          Revisar la semana
        </Btn>
      </div>

      {msg && <Aviso ok={msg.ok}>{msg.texto}</Aviso>}

      {informe && (
        <p className="text-sm text-zinc-500">
          {casos.length === 0
            ? `Los ${informe.totalCases} expedientes de la semana están sin advertencias.`
            : `${casos.length} de ${informe.totalCases} expedientes tienen algo que mirar.`}
        </p>
      )}

      <Tabla columnas={["Trámite", "Estado", "Advertencias", ""]}>
        {casos.length === 0 && <FilaVacia cols={4}>Nada pendiente en esta semana.</FilaVacia>}
        {casos.map((c) => {
          const bloquean = c.findings.filter((f) => f.blocksFinalization);
          return (
            <>
              <tr key={c.caseId} className="border-t border-[var(--atm-linea)]">
                <td className="px-4 py-2.5 font-mono text-xs">{c.externalCaseId}</td>
                <td className="px-4 py-2.5">
                  {c.blocksMedicalWork ? (
                    <Chip tono="mal">No se puede trabajar</Chip>
                  ) : bloquean.length > 0 ? (
                    <Chip tono="obs">Emisión pendiente</Chip>
                  ) : (
                    <Chip tono="ok">Sin bloqueos</Chip>
                  )}
                </td>
                <td className="px-4 py-2.5 text-sm text-zinc-600">
                  {bloquean.length > 0
                    ? `${bloquean.length} retrasa(n) la emisión`
                    : `${c.findings.length} aviso(s)`}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Btn
                    variante="neutral"
                    onClick={() => {
                      setAbierto(abierto === c.caseId ? null : c.caseId);
                      setNota("");
                    }}
                  >
                    {abierto === c.caseId ? "Cerrar" : "Revisar"}
                  </Btn>
                </td>
              </tr>
              {abierto === c.caseId && (
                <tr key={`${c.caseId}-detalle`} className="border-t border-[var(--atm-linea)] bg-[var(--atm-fondo)]">
                  <td colSpan={4} className="px-4 py-4">
                    {/* QUE QUEDE CLARO QUÉ SE ESTÁ HACIENDO, y qué no. */}
                    <p className="mb-3 text-xs text-zinc-500">
                      Revisar una advertencia NO modifica el pronunciamiento del médico ni el contenido
                      del informe: queda escrito que la revisaste y por qué se puede emitir igual.
                    </p>
                    <ul className="space-y-3">
                      {c.findings.map((f) => (
                        <li
                          key={f.findingKey}
                          className="rounded-lg border border-[var(--atm-linea)] bg-white p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-zinc-800">{f.statement}</span>
                            {f.blocksMedicalWork ? (
                              <Chip tono="mal">Detiene el trabajo médico</Chip>
                            ) : f.blocksFinalization ? (
                              <Chip tono="obs">Retrasa la emisión</Chip>
                            ) : (
                              <Chip tono="neutral">Sólo aviso</Chip>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-zinc-600">{f.evidence}</p>

                          {f.resolvedAt !== null && (
                            <p className="mt-2 text-xs text-emerald-700">
                              Revisada el {new Date(f.resolvedAt).toLocaleDateString("es-CL")} ·{" "}
                              {f.resolutionNote}
                            </p>
                          )}

                          {/* QUÉ FALTA, antes de ofrecer ningún botón. */}
                          {f.blocksFinalization && f.resolvedAt === null && (
                            <p className="mt-2 text-xs text-zinc-600">
                              {QUE_FALTA[categoriaDe(f)]}
                            </p>
                          )}

                          {/*
                            UN BLOQUEO DEL TRABAJO MÉDICO NO SE LEVANTA ESCRIBIENDO.
                            Es una prueba de que los antecedentes están mal, y lo que
                            corresponde es corregirlos, no dar fe de ellos.
                          */}
                          {f.blocksMedicalWork && (
                            <p className="mt-2 text-xs text-zinc-500">
                              Esto no se resuelve desde aquí: hay que corregir los antecedentes.
                            </p>
                          )}

                          {/*
                            LIMITACIÓN DE LA FUENTE. La revisa coordinación y queda
                            escrita; si era la última, el documento sale solo.
                          */}
                          {f.blocksFinalization &&
                            f.resolvedAt === null &&
                            categoriaDe(f) === "LIMITACION_FUENTE" && (
                              <div className="mt-3 space-y-2" data-testid="accion-limitacion">
                                <Campo
                                  label="Qué revisaste"
                                  hint="Obligatorio. Quien lea esto dentro de un año necesita saber qué se miró."
                                >
                                  <Textarea
                                    rows={2}
                                    value={nota}
                                    onChange={(e) => setNota(e.target.value)}
                                    placeholder="Confirmado con el proveedor: el listado maestro no imprime el total de 2025."
                                  />
                                </Campo>
                                <Btn
                                  onClick={() => void resolver(c, f)}
                                  disabled={busy || nota.trim().length < 10}
                                >
                                  Validar limitación de fuente
                                </Btn>
                              </div>
                            )}

                          {/*
                            APORTE DEL PROFESIONAL. No se valida: se le devuelve.
                            Volverá a ratificar, porque su decisión puede cambiar
                            con las cifras que él mismo consigne.
                          */}
                          {f.blocksFinalization &&
                            f.resolvedAt === null &&
                            categoriaDe(f) === "APORTE_MEDICO" && (
                              <div className="mt-3 space-y-2" data-testid="accion-devolver">
                                {devolviendo === c.caseId ? (
                                  <>
                                    <Campo
                                      label="Motivo de devolución"
                                      hint="Lo va a leer el médico y queda en la auditoría. Obligatorio."
                                    >
                                      <Textarea
                                        rows={2}
                                        value={motivo}
                                        onChange={(e) => setMotivo(e.target.value)}
                                        placeholder="Completar manualmente las cifras de la Sección II que el sistema no pudo determinar a partir de los antecedentes disponibles."
                                      />
                                    </Campo>
                                    <div className="flex gap-2">
                                      <Btn
                                        onClick={() => void devolver(c)}
                                        disabled={busy || motivo.trim().length < 10}
                                      >
                                        Confirmar devolución
                                      </Btn>
                                      <Btn
                                        variante="ghost"
                                        onClick={() => {
                                          setDevolviendo(null);
                                          setMotivo("");
                                        }}
                                      >
                                        Cancelar
                                      </Btn>
                                    </div>
                                  </>
                                ) : (
                                  <Btn onClick={() => setDevolviendo(c.caseId)} disabled={busy}>
                                    Devolver al médico
                                  </Btn>
                                )}
                              </div>
                            )}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
            </>
          );
        })}
      </Tabla>
    </div>
  );
}
