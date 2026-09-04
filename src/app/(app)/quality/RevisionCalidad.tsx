"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import { ORIENTATION_LABEL, WORKFLOW_LABEL, type ReportListItem, type ReportWorkflowStatus } from "@/lib/backend";

// GET  /api/v1/reports                                       → informes del contrato
// POST /api/v1/reports/:reportId/return-to-doctor {reason}   → devolver al médico asignado
//
// El control de calidad revisa los informes RATIFICADOS y, si algo no cuadra,
// los devuelve al médico para que los corrija (abre una versión nueva del informe).

type Pestaña = "ratificados" | "en_medico" | "todos";

const RATIFICADO = new Set<ReportWorkflowStatus>(["APPROVED", "SIGNING", "SIGNED", "SIGNING_FAILED"]);

const CHIP: Record<ReportWorkflowStatus, string> = {
  READY_FOR_REVIEW: "bg-blue-50 text-[var(--atm-azul)]",
  CHANGES_REQUESTED: "bg-amber-50 text-[var(--atm-obs)]",
  APPROVED: "bg-green-50 text-[var(--atm-ok)]",
  SIGNING: "bg-blue-50 text-[var(--atm-azul)]",
  SIGNED: "bg-green-50 text-[var(--atm-ok)]",
  SIGNING_FAILED: "bg-red-50 text-[var(--atm-mal)]",
};

export function RevisionCalidad() {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [tab, setTab] = useState<Pestaña>("ratificados");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [devolviendo, setDevolviendo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const d = await api<{ reports: ReportListItem[] }>("/reports?limit=200");
      setReports(d.reports);
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo cargar." });
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtrados = reports.filter((r) =>
    tab === "todos"
      ? true
      : tab === "ratificados"
        ? RATIFICADO.has(r.workflowStatus)
        : r.workflowStatus === "READY_FOR_REVIEW" || r.workflowStatus === "CHANGES_REQUESTED",
  );
  const nRatif = reports.filter((r) => RATIFICADO.has(r.workflowStatus)).length;
  const nMedico = reports.filter(
    (r) => r.workflowStatus === "READY_FOR_REVIEW" || r.workflowStatus === "CHANGES_REQUESTED",
  ).length;

  async function devolver(reportId: string) {
    if (motivo.trim().length < 10) {
      setMsg({ ok: false, texto: "El motivo debe tener al menos 10 caracteres." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ newVersion: number }>(`/reports/${reportId}/return-to-doctor`, {
        json: { reason: motivo.trim() },
      });
      setMsg({ ok: true, texto: `Devuelto al médico. Se abrió la versión ${r.newVersion} para su corrección.` });
      setDevolviendo(null);
      setMotivo("");
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo devolver." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Revisa los informes ratificados por los médicos. Si algo no cuadra, devuélvelo para corrección.
      </p>

      <div className="flex rounded-lg border border-[var(--atm-linea)] bg-white p-0.5">
        {(
          [
            ["ratificados", `Ratificados (${nRatif})`],
            ["en_medico", `En el médico (${nMedico})`],
            ["todos", "Todos"],
          ] as const
        ).map(([p, etiqueta]) => (
          <button
            key={p}
            onClick={() => setTab(p)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === p ? "bg-[var(--atm-azul)] text-white" : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {msg && (
        <p
          className={`rounded-lg border px-4 py-2.5 text-sm ${
            msg.ok ? "border-green-300 bg-green-50 text-[var(--atm-ok)]" : "border-red-300 bg-red-50 text-[var(--atm-mal)]"
          }`}
        >
          {msg.texto}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--atm-th)] text-left text-white">
              <th className="px-4 py-2.5 font-medium">Nº trámite</th>
              <th className="px-4 py-2.5 font-medium">Médico</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
              <th className="px-4 py-2.5 font-medium">Orientación</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-400">Cargando…</td></tr>
            )}
            {!cargando && filtrados.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-400">Sin informes en esta vista.</td></tr>
            )}
            {filtrados.map((r) => (
              <tr key={r.reportId} className="border-t border-[var(--atm-linea)] align-top">
                <td className="px-4 py-2.5 font-mono text-xs text-zinc-800">{r.externalCaseId}</td>
                <td className="px-4 py-2.5 text-zinc-600">{r.doctor?.fullName ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CHIP[r.workflowStatus]}`}>
                    {WORKFLOW_LABEL[r.workflowStatus]}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-zinc-600">
                  {r.orientationAssessment ? ORIENTATION_LABEL[r.orientationAssessment] : "—"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {devolviendo === r.reportId ? (
                    <div className="w-72 space-y-2 text-left">
                      <textarea
                        className="w-full rounded-lg border border-[var(--atm-linea)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--atm-azul2)]"
                        rows={3}
                        placeholder="Motivo de la devolución (mín. 10 caracteres)"
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setDevolviendo(null);
                            setMotivo("");
                          }}
                          className="rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs text-zinc-600"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => devolver(r.reportId)}
                          disabled={busy || motivo.trim().length < 10}
                          className="rounded-lg bg-[var(--atm-azul)] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          {busy ? "Devolviendo…" : "Confirmar devolución"}
                        </button>
                      </div>
                    </div>
                  ) : RATIFICADO.has(r.workflowStatus) ? (
                    <button
                      onClick={() => {
                        setDevolviendo(r.reportId);
                        setMotivo("");
                        setMsg(null);
                      }}
                      className="rounded-lg border border-[var(--atm-linea)] px-3 py-1 text-xs font-medium text-[var(--atm-azul)] hover:bg-blue-50"
                    >
                      Devolver al médico
                    </button>
                  ) : (
                    <span className="text-xs text-zinc-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
