"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import { type ReportWorkflowStatus } from "@/lib/backend";
import { descargarInformePdf, type DocumentoInforme } from "@/lib/informe-pdf";
import {
  censarLicencias,
  diasLicencia,
  etiquetaEstadoSingular,
  periodoLicencia,
  type LicenciaBackend,
} from "@/lib/licencias";

// GET  /api/v1/cases/:caseId/report      → preinforme + capacidades.
// POST /api/v1/reports/:reportId/approve  {comments?}  → RATIFICAR (usa la firma cargada del médico)
// POST /api/v1/reports/:reportId/reviews  {comments}   → MODIFICAR: nueva redacción de IV y V
//
// El backend no permite reescribir el informe en sitio (ReportSnapshot es inmutable):
// "Modificar" manda la nueva conclusión (IV) y propuesta (V) como corrección.
//
// LO QUE VE EL MÉDICO SALE DE `report.document` Y DE NADA MÁS.
//
// La respuesta trae también `sections`: el VOLCADO INTERNO del snapshot, con
// los códigos de razón, los estados de política y los guardarraíles que existen
// para la administración, la auditoría y el QA. Esta pantalla lo renderizó
// durante un tiempo, y el médico llegó a leer, sobre expedientes reales:
//
//   · «Criterio de período: Confirmado por el cliente» (`CLIENT_CONFIRMED`);
//   · «[REC-2] …», «[NOR-3] …» — códigos de indicador;
//   · «Verificar que la falta de evidencia…», «La adherencia al tratamiento…»
//     — guía dirigida a quien revisa, no al expediente;
//   · «Ninguna cantidad de indicadores reemplaza el juicio profesional»
//     — un guardarraíl del motor.
//
// Nada de eso significa nada para quien firma, y su sitio no es la pantalla de
// quien firma. `document` es la proyección que el backend compone con
// `buildClientReport` — la MISMA que imprime el .docx y el PDF— y viene limpia
// de origen. Por eso `sections` NI SIQUIERA ESTÁ DECLARADO en `Report`: no se
// puede volver a pintar por descuido lo que el tipo no conoce.
//
// De la respuesta se siguen usando, aparte del documento, sólo los metadatos
// que la interfaz necesita para actuar: versión, workflow, readiness,
// capacidades, historial, descargas y el detalle de licencias.

interface Review {
  id: string;
  decision: "APPROVED" | "CHANGES_REQUESTED";
  comments: string | null;
  createdAt: string;
}
interface Report {
  id: string;
  caseReference: string;
  version: number;
  createdAt: string;
  workflowStatus: ReportWorkflowStatus;
  // El documento entregable, ya compuesto por el backend. Es lo ÚNICO que se
  // muestra, se imprime o se descarga. Ver src/lib/informe-pdf.ts.
  document: DocumentoInforme;
  proposal: { recoverableChecked: boolean; irrecoverableChecked: boolean; unresolvedNote: string | null };
  readiness: { status: "READY" | "NOT_READY"; blockers: { code: string; statement: string }[] };
  reviews: Review[];
  draftArtifact: { downloadUrl: string } | null;
  finalArtifact: { downloadUrl: string } | null;
  capabilities: { canRequestChanges: boolean; canApprove: boolean; hasActiveSignature: boolean };
  licenses: LicenciaBackend[];
}

type Evaluacion = "RECOVERABLE" | "IRRECOVERABLE";

const ESTADO: Record<ReportWorkflowStatus, { texto: string; chip: string; aviso?: { tono: "info" | "ok" | "obs" | "mal"; texto: string } }> = {
  READY_FOR_REVIEW: {
    texto: "Por revisar",
    chip: "bg-blue-50 text-[var(--atm-azul)]",
  },
  // Sin aviso: el chip ya lo dice, y el historial de abajo trae el motivo.
  CHANGES_REQUESTED: {
    texto: "Devuelto",
    chip: "bg-amber-50 text-[var(--atm-obs)]",
  },
  APPROVED: {
    texto: "Ratificado",
    chip: "bg-green-50 text-[var(--atm-ok)]",
    aviso: { tono: "ok", texto: "Ya ratificaste este informe." },
  },
  SIGNING: {
    texto: "Ratificado",
    chip: "bg-green-50 text-[var(--atm-ok)]",
    aviso: { tono: "info", texto: "El documento firmado se está generando. Vuelve a entrar en unos segundos." },
  },
  SIGNED: {
    texto: "Ratificado",
    chip: "bg-green-50 text-[var(--atm-ok)]",
    aviso: { tono: "ok", texto: "Informe firmado. El documento final está disponible para descargar." },
  },
  SIGNING_FAILED: {
    texto: "Devuelto",
    chip: "bg-red-50 text-[var(--atm-mal)]",
    aviso: { tono: "mal", texto: "No se pudo generar el documento firmado. Avisa al administrador para reintentarlo." },
  },
};

const TONO: Record<string, string> = {
  info: "border-[var(--atm-azul2)] bg-blue-50 text-[var(--atm-azul)]",
  ok: "border-green-300 bg-green-50 text-[var(--atm-ok)]",
  obs: "border-amber-300 bg-amber-50 text-[var(--atm-obs)]",
  mal: "border-red-300 bg-red-50 text-[var(--atm-mal)]",
};

const EDITABLES = new Set(["IV", "V"]);

const fecha = (s: string) => new Date(s).toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" });

export function PantallaResultado({ caseId }: { caseId: string }) {
  const [rep, setRep] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<"ver" | "modificar">("ver");
  const [conclusion, setConclusion] = useState("");
  const [evaluacion, setEvaluacion] = useState<Evaluacion>("IRRECOVERABLE");
  const [nota, setNota] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async (): Promise<Report | null> => {
    setError(null);
    try {
      // `/cases/:caseId/report` devuelve SIEMPRE el snapshot vigente del caso
      // (el más reciente sin `supersededAt`); la pantalla no elige versión ni
      // ordena artefactos por su cuenta.
      const r = await api<Report>(`/cases/${caseId}/report`);
      setRep(r);
      return r;
    } catch (e) {
      setError(
        e instanceof ApiFallo
          ? e.status === 404
            ? "Este caso todavía no tiene preinforme: aún no se ha procesado."
            : e.status === 403
              ? "Este caso no está asignado a ti."
              : e.message
          : "No se pudo cargar el caso.",
      );
      return null;
    }
  }, [caseId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  function abrirModificar() {
    if (!rep) return;
    // El punto de partida de la corrección es la conclusión TAL COMO SE
    // ENTREGA, no el volcado interno: el médico reescribe lo que va a firmar.
    setConclusion((rep.document.sections.find((s) => s.id === "IV")?.paragraphs ?? []).join("\n\n"));
    setEvaluacion(rep.proposal.recoverableChecked ? "RECOVERABLE" : "IRRECOVERABLE");
    setNota(rep.proposal.unresolvedNote ?? "");
    setMsg(null);
    setModo("modificar");
  }

  async function enviarModificacion() {
    if (!rep || conclusion.trim().length < 1) return;
    setBusy(true);
    setMsg(null);
    const comments = [
      "MODIFICACIÓN DEL MÉDICO",
      "",
      "IV. CONCLUSIÓN GENERAL:",
      conclusion.trim(),
      "",
      "V. PROPUESTA DE EVALUACIÓN:",
      evaluacion === "RECOVERABLE" ? "Salud recuperable" : "Salud irrecuperable",
      ...(nota.trim() ? ["", `Nota: ${nota.trim()}`] : []),
    ].join("\n");
    try {
      await api(`/reports/${rep.id}/reviews`, { json: { comments } });
      setMsg({ ok: true, texto: "Corrección guardada. Puedes ratificar el informe con este cambio." });
      setModo("ver");
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo guardar la corrección." });
    } finally {
      setBusy(false);
    }
  }

  async function ratificar() {
    if (!rep) return;
    setBusy(true);
    setMsg(null);
    try {
      await api(`/reports/${rep.id}/approve`, { json: {} });
      setMsg({ ok: true, texto: "Informe ratificado. Generando el documento firmado…" });
      // El documento firmado lo produce un worker; sondeamos hasta que exista.
      let r = await cargar();
      for (let i = 0; i < 15 && r && !r.finalArtifact && r.workflowStatus !== "SIGNING_FAILED"; i++) {
        await new Promise((res) => setTimeout(res, 1500));
        r = await cargar();
      }
      if (r?.finalArtifact) setMsg({ ok: true, texto: "Informe firmado. Ya puedes descargarlo." });
      else if (r?.workflowStatus === "SIGNING_FAILED") setMsg({ ok: false, texto: "No se pudo generar el documento firmado. Avisa al administrador." });
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo ratificar." });
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-zinc-600">{error}</p>
      </div>
    );
  }
  if (!rep) return <p className="text-sm text-zinc-400">Cargando…</p>;

  const cap = rep.capabilities;
  const editando = modo === "modificar";
  const estado = ESTADO[rep.workflowStatus];
  // Señal de conformidad con la IA: si hubo una corrección del médico antes de
  // ratificar (esta versión), la propuesta original no se sostuvo tal cual.
  // Con esto se puede medir, caso a caso, cuándo la IA acertó y cuándo no.
  const huboCorreccion = rep.reviews.some((r) => r.decision === "CHANGES_REQUESTED");
  const yaRatificado = rep.reviews.some((r) => r.decision === "APPROVED");
  const inputBase = "w-full rounded-lg border border-[var(--atm-linea)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--atm-azul2)]";
  /**
   * RECTIFICAR Y RATIFICAR SON INDEPENDIENTES.
   *
   * Cada botón se muestra por SU capacidad y por ninguna otra. En particular
   * `canRequestChanges` no mira `canApprove`, ni `readiness`, ni los
   * bloqueadores clínicos, ni la orientación: rectificar existe precisamente
   * para los informes que el médico no puede o no quiere aprobar tal como
   * están, y condicionarlo a que el informe esté conforme deja al profesional
   * mirando una propuesta que no puede corregir.
   *
   * La autoridad es la capacidad calculada por el backend. Aquí no se vuelve a
   * decidir nada.
   */
  const puedeActuar = cap.canApprove || cap.canRequestChanges;
  const censo = censarLicencias(rep.licenses);

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="rounded-xl border border-[var(--atm-linea)] bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">Trámite {rep.caseReference}</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Versión {rep.version} · preinforme del {fecha(rep.createdAt)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${estado.chip}`}>{estado.texto}</span>
            {yaRatificado && (
              <span className="text-[11px] text-zinc-400">
                {huboCorreccion ? "Con corrección del médico" : "Conforme con la propuesta de la IA"}
              </span>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--atm-linea)] pt-3">
          <button
            onClick={() => void descargarInformePdf(rep)}
            className="rounded-lg border border-[var(--atm-linea)] px-3 py-1.5 text-xs font-medium text-[var(--atm-azul)] hover:bg-blue-50"
          >
            Descargar PDF
          </button>
            {rep.draftArtifact && (
              <a href={`/api/v1${rep.draftArtifact.downloadUrl.replace(/^\/api\/v1/, "")}`} target="_blank" rel="noreferrer"
                 className="rounded-lg border border-[var(--atm-linea)] px-3 py-1.5 text-xs font-medium text-[var(--atm-azul)] hover:bg-blue-50">
                Descargar preinforme (.docx)
              </a>
            )}
            {rep.finalArtifact && (
              <a href={`/api/v1${rep.finalArtifact.downloadUrl.replace(/^\/api\/v1/, "")}`} target="_blank" rel="noreferrer"
                 className="rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-[var(--atm-ok)] hover:bg-green-100">
                Descargar informe firmado (.docx)
              </a>
            )}
        </div>
      </div>

      {/* Avisos de estado / bloqueos / advertencias */}
      {estado.aviso && !editando && (
        <p className={`rounded-lg border px-4 py-2.5 text-sm ${TONO[estado.aviso.tono]}`}>{estado.aviso.texto}</p>
      )}
      {rep.readiness.status === "NOT_READY" && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${TONO.mal}`}>
          <p className="font-medium">Este informe no está listo para finalizar:</p>
          <ul className="mt-1 list-disc pl-5">
            {rep.readiness.blockers.map((b) => <li key={b.code}>{b.statement}</li>)}
          </ul>
        </div>
      )}
      {editando && (
        <p className={`rounded-lg border px-4 py-2.5 text-sm ${TONO.info}`}>
          Estás modificando el informe. Solo puedes cambiar la <strong>Conclusión general (IV)</strong> y la{" "}
          <strong>Propuesta de evaluación (V)</strong>; el resto queda tal como está.
        </p>
      )}

      {/* Documento */}
      <div className="overflow-hidden rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
        {rep.document.draftNotice && (
          <p className="border-b border-[var(--atm-linea)] bg-[var(--atm-fondo)] px-5 py-2 text-xs text-zinc-500">
            {rep.document.draftNotice}
          </p>
        )}
        {rep.document.sections.map((s) => {
          const esEditable = editando && EDITABLES.has(s.id);
          const bloqueada = editando && !EDITABLES.has(s.id);
          return (
            <section
              key={s.id}
              className={`border-t border-[var(--atm-linea)] px-5 py-4 first:border-t-0 ${
                esEditable ? "bg-blue-50/50 ring-1 ring-inset ring-[var(--atm-azul2)]" : bloqueada ? "opacity-55" : ""
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-zinc-800">{s.title}</h4>
                {esEditable && (
                  <span className="shrink-0 rounded-full bg-[var(--atm-azul)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Editable
                  </span>
                )}
                {bloqueada && <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-400">Solo lectura</span>}
              </div>

              {editando && s.id === "IV" ? (
                <textarea
                  className={`${inputBase} min-h-[130px]`}
                  value={conclusion}
                  onChange={(e) => setConclusion(e.target.value)}
                  placeholder="Redacta la conclusión general"
                />
              ) : editando && s.id === "V" ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {(["IRRECOVERABLE", "RECOVERABLE"] as const).map((v) => (
                      <label
                        key={v}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                          evaluacion === v ? "border-[var(--atm-azul2)] bg-white font-medium text-[var(--atm-azul)]" : "border-[var(--atm-linea)] bg-white text-zinc-600"
                        }`}
                      >
                        <input type="radio" name="evaluacion" checked={evaluacion === v} onChange={() => setEvaluacion(v)} />
                        {v === "RECOVERABLE" ? "Salud recuperable" : "Salud irrecuperable"}
                      </label>
                    ))}
                  </div>
                  <textarea className={inputBase} rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" />
                </div>
              ) : (
                <>
                  {s.fields.length > 0 && (
                    <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
                      {s.fields.map((f, i) => (
                        <div key={i} className="flex gap-2 text-sm">
                          <dt className="shrink-0 text-zinc-500">{f.label}:</dt>
                          <dd className="text-zinc-800">{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {s.paragraphs.map((p, i) => (
                    <p key={i} className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                      {p}
                    </p>
                  ))}

                  {/* EL UNIVERSO DE LICENCIAS, al lado de los totales oficiales.
                      Los totales de arriba los computa el backend y son los que
                      se imprimen. Esto es el inventario de lo hallado, y está
                      aquí porque «Total licencias autorizadas: 0» se leyó como
                      «este expediente no tiene licencias» en un caso que traía
                      77, todas con el estado administrativo sin determinar. */}
                  {s.id === "II" && censo && (
                    <div className="mt-3 border-t border-[var(--atm-linea)] pt-3 text-sm">
                      <p className="text-zinc-700">
                        <span className="text-zinc-500">Licencias encontradas en el expediente: </span>
                        <span className="font-semibold text-zinc-900">{censo.encontradas}</span>
                      </p>
                      <ul className="mt-1.5 space-y-0.5">
                        {censo.porEstado.map((g) => (
                          <li key={g.estado}>
                            <span className="text-zinc-500">{g.etiqueta}: </span>
                            <span className="font-medium text-zinc-900">{g.cantidad}</span>
                          </li>
                        ))}
                        <li>
                          <span className="text-zinc-500">Computables para el umbral: </span>
                          <span className="font-medium text-zinc-900">{censo.computables}</span>
                        </li>
                      </ul>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-[var(--atm-azul)]">
                          Ver el detalle de las {censo.encontradas} licencias
                        </summary>
                        <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-[var(--atm-linea)]">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-[var(--atm-fondo)] text-left text-zinc-600">
                              <tr>
                                <th className="px-2 py-1.5 font-medium">Folio</th>
                                <th className="px-2 py-1.5 font-medium">Período</th>
                                <th className="px-2 py-1.5 font-medium">CIE-10</th>
                                <th className="px-2 py-1.5 font-medium">Estado</th>
                                <th className="px-2 py-1.5 font-medium">Días autorizados</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rep.licenses.map((l, i) => (
                                <tr key={`${l.folio}-${i}`} className="border-t border-[var(--atm-linea)]">
                                  <td className="px-2 py-1 font-mono text-zinc-800">{l.folio}</td>
                                  <td className="px-2 py-1 text-zinc-700">{periodoLicencia(l)}</td>
                                  <td className="px-2 py-1 text-zinc-700">{l.cie10}</td>
                                  <td className="px-2 py-1 text-zinc-700">{etiquetaEstadoSingular(l.effectiveState)}</td>
                                  <td className="px-2 py-1 text-zinc-700">{diasLicencia(l)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </div>
                  )}

                  {/* La propuesta, con las MISMAS casillas que salen impresas. */}
                  {s.id === "V" && (
                    <div className="mt-1 space-y-1 text-sm">
                      {rep.document.proposal.options.map((o, i) => (
                        <p key={i} className={o.checked ? "font-semibold text-zinc-900" : "text-zinc-600"}>
                          <span className="font-mono">{o.checked ? "[X]" : "[  ]"}</span> {o.label}
                        </p>
                      ))}
                      {rep.document.proposal.note && <p className="text-zinc-600">{rep.document.proposal.note}</p>}
                    </div>
                  )}
                </>
              )}
            </section>
          );
        })}
      </div>

      {/* Historial de pronunciamientos */}
      {rep.reviews.length > 0 && !editando && (
        <div className="rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
          <h4 className="border-b border-[var(--atm-linea)] px-5 py-3 text-sm font-semibold text-zinc-800">
            Historial
          </h4>
          <ul className="divide-y divide-[var(--atm-linea)]">
            {[...rep.reviews].reverse().map((r) => (
              <li key={r.id} className="px-5 py-3 text-sm">
                <p className={r.decision === "APPROVED" ? "font-medium text-[var(--atm-ok)]" : "font-medium text-[var(--atm-obs)]"}>
                  {r.decision === "APPROVED" ? "Ratificado" : "Corrección del médico"}
                  <span className="ml-2 font-normal text-xs text-zinc-400">{fecha(r.createdAt)}</span>
                </p>
                {r.comments && <p className="mt-1 whitespace-pre-wrap text-zinc-600">{r.comments}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {msg && (
        <p className={`rounded-lg border px-4 py-2.5 text-sm ${msg.ok ? TONO.ok : TONO.mal}`}>{msg.texto}</p>
      )}

      {/* Acciones.

          FIJA AL VIEWPORT, no `sticky`. Era `sticky bottom-4` sobre el último
          hijo del contenedor: el bloque pegajoso sólo se sostiene mientras su
          contenedor está a la vista, y siendo el último elemento de una página
          que mide varias pantallas, no aparecía hasta haber bajado el informe
          entero. Con `canRequestChanges: true` el botón estaba renderizado y no
          se veía, que para quien tiene que rectificar es lo mismo que no
          estar. */}
      {puedeActuar && (
        <div className="fixed inset-x-0 bottom-4 z-20 mx-auto w-full max-w-5xl px-6">
        <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-4 shadow-lg">
          {editando ? (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setModo("ver")} className="rounded-lg border border-[var(--atm-linea)] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                Cancelar
              </button>
              <button onClick={enviarModificacion} disabled={busy || !conclusion.trim()}
                      className="rounded-lg bg-[var(--atm-azul)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--atm-azul2)] disabled:opacity-40">
                {busy ? "Guardando…" : "Guardar corrección"}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {cap.canRequestChanges && (
                <button onClick={abrirModificar} className="rounded-lg border border-[var(--atm-linea)] px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                  No estoy de acuerdo, corregir
                </button>
              )}
              {cap.canApprove && (
                <button onClick={ratificar} disabled={busy || !cap.hasActiveSignature}
                        className="rounded-lg bg-[var(--atm-azul)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--atm-azul2)] disabled:opacity-40">
                  {busy ? "Ratificando…" : "Ratificar"}
                </button>
              )}
              {!cap.hasActiveSignature && (
                <span className="text-xs text-[var(--atm-obs)]">
                  Necesitas cargar tu firma en «Mi firma» para ratificar.
                </span>
              )}
            </div>
          )}
        </div>
        </div>
      )}

      {/* Hueco para que la barra fija no tape el final del informe. */}
      {puedeActuar && <div aria-hidden className="h-24" />}
    </div>
  );
}
