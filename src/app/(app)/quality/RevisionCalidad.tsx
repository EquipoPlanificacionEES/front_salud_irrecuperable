"use client";

import { useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import { useInvalidar, useReports } from "@/lib/queries";
import { ORIENTATION_LABEL, WORKFLOW_LABEL, type ReportWorkflowStatus } from "@/lib/backend";
import { Refrescando, TablaSkeleton } from "@/components/Skeleton";

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
  // Estado de interfaz: la pestaña elegida y lo que se está escribiendo.
  const [tab, setTab] = useState<Pestaña>("ratificados");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [devolviendo, setDevolviendo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  // Las tres pestañas salen de ESTA lista: cambiar de pestaña no pide nada.
  const { data, error: fallo, isPending, isFetching } = useReports({ limit: 200 });
  const invalidar = useInvalidar();
  const reports = data?.reports ?? [];
  const errorCarga = fallo ? (fallo instanceof ApiFallo ? fallo.message : "No se pudo cargar.") : null;

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
      // Devolver un informe lo saca del circuito de calidad y lo devuelve a la
      // bandeja del médico: caduca el listado y esa bandeja, nada más.
      await invalidar.informeDevuelto();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo devolver." });
    } finally {
      setBusy(false);
    }
  }

  if (isPending) return <TablaSkeleton filas={8} columnas={5} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-sm text-zinc-500">
          Revisa los informes ratificados por los médicos. Si algo no cuadra, devuélvelo para corrección.
        </p>
        <Refrescando visible={isFetching} />
      </div>
      {errorCarga && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-[var(--atm-mal)]">
          {errorCarga}
        </p>
      )}

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
            {filtrados.length === 0 && (
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
