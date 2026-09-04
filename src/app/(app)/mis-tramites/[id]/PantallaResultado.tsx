"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import { WORKFLOW_LABEL, es, type ReportWorkflowStatus } from "@/lib/backend";

// GET  /api/v1/cases/:caseId/report      → preinforme (secciones I–V + anexo + capacidades)
// POST /api/v1/reports/:reportId/approve  {comments?}  → RATIFICAR (firma la que tiene cargada el médico)
// POST /api/v1/reports/:reportId/reviews  {comments}   → MODIFICAR: el médico manda la nueva redacción de IV y V
//
// NOTA: el backend todavía no deja reescribir el informe en sitio (ReportSnapshot
// es inmutable). "Modificar" envía la nueva conclusión (IV) y propuesta (V) como
// una solicitud de corrección — el informe queda "Cambios pedidos".

interface Field { label: string; value: string }
interface Section { id: string; title: string; narrative: string; fields: Field[]; items: string[] }
interface Report {
  id: string;
  caseReference: string;
  version: number;
  workflowStatus: ReportWorkflowStatus;
  sections: Section[];
  proposal: { recoverableChecked: boolean; irrecoverableChecked: boolean; unresolvedNote: string | null };
  readiness: { status: "READY" | "NOT_READY"; blockers: { code: string; statement: string }[] };
  draftArtifact: { downloadUrl: string } | null;
  finalArtifact: { downloadUrl: string } | null;
  capabilities: { canRequestChanges: boolean; canApprove: boolean; hasActiveSignature: boolean };
}

type Evaluacion = "RECOVERABLE" | "IRRECOVERABLE";

export function PantallaResultado({ caseId }: { caseId: string }) {
  const [rep, setRep] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<"ver" | "modificar">("ver");
  const [conclusion, setConclusion] = useState("");
  const [evaluacion, setEvaluacion] = useState<Evaluacion>("IRRECOVERABLE");
  const [nota, setNota] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setRep(await api<Report>(`/cases/${caseId}/report`));
    } catch (e) {
      setError(
        e instanceof ApiFallo
          ? e.status === 404
            ? "Este caso todavía no tiene preinforme (no se ha procesado)."
            : e.status === 403
              ? "Este caso no está asignado a ti."
              : e.message
          : "No se pudo cargar el caso.",
      );
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
      setMsg({ ok: true, texto: "Modificación enviada. El informe queda para corrección." });
      setModo("ver");
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "Error al enviar." });
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
      setMsg({ ok: true, texto: "Informe ratificado y enviado a firma." });
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "Error al ratificar." });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="rounded-xl border border-[var(--atm-linea)] bg-white p-5 text-sm text-zinc-500">{error}</p>;
  if (!rep) return <p className="text-sm text-zinc-400">Cargando…</p>;

  const cap = rep.capabilities;
  const editando = modo === "modificar";
  const inputBase = "w-full rounded-lg border border-[var(--atm-linea)] px-3 py-2 text-sm outline-none focus:border-[var(--atm-azul2)]";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h3 className="text-base font-semibold text-zinc-900">Nº {rep.caseReference}</h3>
        <span className="rounded-full border border-[var(--atm-linea)] bg-white px-2 py-0.5 text-xs text-zinc-500">
          {WORKFLOW_LABEL[rep.workflowStatus]} · v{rep.version}
        </span>
        {rep.draftArtifact && (
          <a href={`/api/v1${rep.draftArtifact.downloadUrl.replace(/^\/api\/v1/, "")}`} target="_blank" rel="noreferrer" className="text-sm text-[var(--atm-azul2)]">
            Descargar preinforme (.docx)
          </a>
        )}
        {rep.finalArtifact && (
          <a href={`/api/v1${rep.finalArtifact.downloadUrl.replace(/^\/api\/v1/, "")}`} target="_blank" rel="noreferrer" className="text-sm text-[var(--atm-azul2)]">
            Descargar informe firmado (.docx)
          </a>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
        {rep.sections.map((s) => {
          const editable = editando && (s.id === "IV" || s.id === "V");
          return (
            <section key={s.id} className={`border-t border-[var(--atm-linea)] px-5 py-4 first:border-t-0 ${editable ? "bg-blue-50/40" : ""}`}>
              <h4 className="mb-2 text-sm font-semibold text-zinc-800">{s.title}</h4>

              {editando && s.id === "IV" ? (
                <textarea
                  className={`${inputBase} min-h-[120px]`}
                  value={conclusion}
                  onChange={(e) => setConclusion(e.target.value)}
                  placeholder="Conclusión general"
                />
              ) : editando && s.id === "V" ? (
                <div className="space-y-2">
                  <div className="flex gap-4 text-sm">
                    {(["RECOVERABLE", "IRRECOVERABLE"] as const).map((v) => (
                      <label key={v} className="flex items-center gap-1.5">
                        <input type="radio" name="evaluacion" checked={evaluacion === v} onChange={() => setEvaluacion(v)} />
                        {v === "RECOVERABLE" ? "Salud recuperable" : "Salud irrecuperable"}
                      </label>
                    ))}
                  </div>
                  <textarea
                    className={inputBase}
                    rows={2}
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    placeholder="Nota (opcional)"
                  />
                </div>
              ) : (
                <>
                  {s.narrative && <p className="whitespace-pre-wrap text-sm text-zinc-700">{s.narrative}</p>}
                  {s.fields.length > 0 && (
                    <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                      {s.fields.map((f, i) => (
                        <div key={i} className="text-sm">
                          <dt className="inline text-zinc-500">{f.label}: </dt>
                          <dd className="inline text-zinc-800">{es(f.value)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {s.items.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
                      {s.items.map((it, i) => <li key={i}>{es(it)}</li>)}
                    </ul>
                  )}
                </>
              )}
            </section>
          );
        })}
      </div>

      {!editando && (
        <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-4 text-sm shadow-sm">
          <p className="text-zinc-600">
            Propuesta marcada:{" "}
            <span className="font-medium">
              {rep.proposal.recoverableChecked ? "Recuperable" : rep.proposal.irrecoverableChecked ? "No recuperable" : "sin marcar"}
            </span>
          </p>
          {rep.readiness.status === "NOT_READY" && (
            <ul className="mt-2 list-disc pl-5 text-[var(--atm-mal)]">
              {rep.readiness.blockers.map((b) => <li key={b.code}>{b.statement}</li>)}
            </ul>
          )}
        </div>
      )}

      {msg && <p className={`text-sm ${msg.ok ? "text-[var(--atm-ok)]" : "text-[var(--atm-mal)]"}`}>{msg.texto}</p>}

      {(cap.canApprove || cap.canRequestChanges) && (
        <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-4 shadow-sm">
          {editando ? (
            <div className="flex gap-2">
              <button onClick={() => setModo("ver")} className="rounded-lg border border-[var(--atm-linea)] px-4 py-2 text-sm text-zinc-600">
                Cancelar
              </button>
              <button onClick={enviarModificacion} disabled={busy || !conclusion.trim()} className="rounded-lg bg-[var(--atm-azul)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                Enviar modificación
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {cap.canRequestChanges && (
                <button onClick={abrirModificar} className="rounded-lg border border-[var(--atm-linea)] px-4 py-2 text-sm font-medium text-zinc-700">
                  Modificar
                </button>
              )}
              {cap.canApprove && (
                <button onClick={ratificar} disabled={busy || !cap.hasActiveSignature} className="rounded-lg bg-[var(--atm-azul)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                  Ratificar
                </button>
              )}
              {!cap.hasActiveSignature && (
                <span className="text-xs text-[var(--atm-obs)]">Sube tu firma en «Mi firma» para poder ratificar.</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
