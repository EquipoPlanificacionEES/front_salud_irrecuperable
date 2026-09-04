"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import { es, type ReportWorkflowStatus } from "@/lib/backend";
import { descargarInformePdf } from "@/lib/informe-pdf";
import { desglosarLicencias, fraseAnio, descDx, type LicenciaBackend } from "@/lib/licencias";

// GET  /api/v1/cases/:caseId/report      → preinforme (secciones I–V + capacidades). El ANEXO no se muestra.
// POST /api/v1/reports/:reportId/approve  {comments?}  → RATIFICAR (usa la firma cargada del médico)
// POST /api/v1/reports/:reportId/reviews  {comments}   → MODIFICAR: nueva redacción de IV y V
//
// El backend no permite reescribir el informe en sitio (ReportSnapshot es inmutable):
// "Modificar" manda la nueva conclusión (IV) y propuesta (V) como corrección.

interface Field { label: string; value: string }
interface Section { id: string; title: string; narrative: string; fields: Field[]; items: string[] }
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
  sections: Section[];
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
      const r = await api<Report>(`/cases/${caseId}/report`);
      // El ANEXO no se muestra NI se incluye en ningún documento: se descarta aquí,
      // en el único punto donde entran los datos del informe.
      const limpio = { ...r, sections: r.sections.filter((sec) => sec.id !== "ANEXO") };
      setRep(limpio);
      return limpio;
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
    setConclusion(rep.sections.find((s) => s.id === "IV")?.narrative ?? "");
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
  const inputBase = "w-full rounded-lg border border-[var(--atm-linea)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--atm-azul2)]";
  const puedeActuar = cap.canApprove || cap.canRequestChanges;
  const desglose = desglosarLicencias(rep.licenses);

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
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${estado.chip}`}>{estado.texto}</span>
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
        {rep.sections.map((s) => {
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
              ) : s.id === "II" && desglose ? (
                <div className="space-y-3 text-sm">
                  {desglose.periodo && (
                    <p><span className="text-zinc-500">Período evaluado: </span><span className="font-medium text-zinc-900">{desglose.periodo}</span></p>
                  )}
                  <ul className="space-y-1.5">
                    {desglose.porAnio.map((a) => (
                      <li key={a.anio} className="leading-relaxed text-zinc-700">{fraseAnio(a, descDx)}</li>
                    ))}
                  </ul>
                  <p className="border-t border-[var(--atm-linea)] pt-2">
                    <span className="text-zinc-500">Total licencias evaluadas (autorizadas): </span>
                    <span className="font-semibold text-zinc-900">{desglose.totalAutorizadas}</span>
                    <span className="text-zinc-500"> · Total días: </span>
                    <span className="font-semibold text-zinc-900">{desglose.totalDiasCompletos ? desglose.totalDiasAutorizados : `≥ ${desglose.totalDiasAutorizados}`}</span>
                  </p>
                  {desglose.rechazadas.length > 0 && (
                    <p className="text-[var(--atm-obs)]">
                      Licencias rechazadas (no computadas): {desglose.rechazadas.length} —{" "}
                      {desglose.rechazadas.map((r) => `Folio ${r.folio}, ${r.periodo}, ${r.dias} día(s), ${r.cie10} ${descDx(r.cie10)}`).join("; ")}.
                    </p>
                  )}
                  {/* Los demás datos administrativos (FULME, TPI…) siguen apareciendo abajo. */}
                  {s.fields.filter((f) => /FULME|TPI|Criterio/.test(f.label)).length > 0 && (
                    <dl className="mt-1 grid grid-cols-1 gap-x-8 gap-y-1.5 border-t border-[var(--atm-linea)] pt-2 sm:grid-cols-2">
                      {s.fields.filter((f) => /FULME|TPI|Criterio/.test(f.label)).map((f, i) => (
                        <div key={i} className="flex gap-2"><dt className="shrink-0 text-zinc-500">{f.label}:</dt><dd className="text-zinc-800">{es(f.value)}</dd></div>
                      ))}
                    </dl>
                  )}
                </div>
              ) : (
                <>
                  {s.narrative && <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{s.narrative}</p>}
                  {s.fields.length > 0 && (
                    <dl className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
                      {s.fields.map((f, i) => (
                        <div key={i} className="flex gap-2 text-sm">
                          <dt className="shrink-0 text-zinc-500">{f.label}:</dt>
                          <dd className="text-zinc-800">{es(f.value)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {s.items.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-zinc-700">
                      {s.items.map((it, i) => <li key={i}>{es(it)}</li>)}
                    </ul>
                  )}
                  {s.id === "V" && (
                    <div className="mt-2 space-y-1.5 text-sm">
                      {([
                        ["Salud recuperable", rep.proposal.recoverableChecked],
                        ["Salud irrecuperable", rep.proposal.irrecoverableChecked],
                      ] as const).map(([texto, marcado]) => (
                        <div key={texto} className="flex items-center gap-2">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center border text-[11px] font-bold leading-none ${
                              marcado ? "border-zinc-900 text-zinc-900" : "border-zinc-400 text-transparent"
                            }`}
                          >
                            X
                          </span>
                          <span className={marcado ? "font-medium text-zinc-900" : "text-zinc-600"}>{texto.toUpperCase()}</span>
                        </div>
                      ))}
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

      {/* Acciones */}
      {puedeActuar && (
        <div className="sticky bottom-4 rounded-xl border border-[var(--atm-linea)] bg-white p-4 shadow-md">
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
      )}
    </div>
  );
}
