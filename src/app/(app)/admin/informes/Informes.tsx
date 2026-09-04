"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import {
  ORIENTATION_LABEL,
  WORKFLOW_LABEL,
  type BatchListItem,
  type ReportListItem,
  type ReportWorkflowStatus,
} from "@/lib/backend";

// GET /api/v1/reports?batchId=&workflowStatus=&limit=&offset=
// GET /api/v1/reports/:id/download          (PRE_REPORT .docx)
// GET /api/v1/reports/:id/signed-document   (informe final firmado .docx)

const sel = "rounded-lg border border-[var(--atm-linea)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--atm-azul2)]";
const ORDEN: ReportWorkflowStatus[] = ["READY_FOR_REVIEW", "CHANGES_REQUESTED", "APPROVED", "SIGNING", "SIGNED", "SIGNING_FAILED"];

export function Informes() {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [counts, setCounts] = useState<Partial<Record<ReportWorkflowStatus, number>>>({});
  const [total, setTotal] = useState(0);
  const [semanas, setSemanas] = useState<BatchListItem[]>([]);
  const [fBatch, setFBatch] = useState("");
  const [fWf, setFWf] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api<{ batches: BatchListItem[] }>("/admin/batches?limit=200").then((d) => setSemanas(d.batches)).catch(() => {});
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    const q = new URLSearchParams({ limit: "100" });
    if (fBatch) q.set("batchId", fBatch);
    if (fWf) q.set("workflowStatus", fWf);
    try {
      const d = await api<{ reports: ReportListItem[]; total: number; countsByWorkflowStatus: Record<string, number> }>(`/reports?${q}`);
      setReports(d.reports);
      setTotal(d.total);
      setCounts(d.countsByWorkflowStatus as Partial<Record<ReportWorkflowStatus, number>>);
    } catch (e) {
      setMsg(e instanceof ApiFallo ? e.message : "No se pudo cargar.");
    } finally {
      setCargando(false);
    }
  }, [fBatch, fWf]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select className={sel} value={fBatch} onChange={(e) => setFBatch(e.target.value)}>
          <option value="">Todas las semanas</option>
          {semanas.map(({ batch }) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
        </select>
        <select className={sel} value={fWf} onChange={(e) => setFWf(e.target.value)}>
          <option value="">Cualquier estado</option>
          {ORDEN.map((w) => <option key={w} value={w}>{WORKFLOW_LABEL[w]}</option>)}
        </select>
        <span className="text-zinc-400">{total} informe(s)</span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {ORDEN.filter((w) => counts[w]).map((w) => (
          <span key={w} className="rounded-lg border border-[var(--atm-linea)] bg-white px-2.5 py-1 text-zinc-600">
            {WORKFLOW_LABEL[w]}: {counts[w]}
          </span>
        ))}
      </div>

      {msg && <p className="text-sm text-[var(--atm-mal)]">{msg}</p>}

      <div className="overflow-x-auto rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--atm-th)] text-left text-white">
              <th className="px-4 py-2 font-medium">Nº trámite</th>
              <th className="px-4 py-2 font-medium">Semana</th>
              <th className="px-4 py-2 font-medium">Médico</th>
              <th className="px-4 py-2 font-medium">Versión</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Orientación</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={7} className="px-4 py-6 text-center text-zinc-400">Cargando…</td></tr>}
            {!cargando && reports.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-400">Sin informes. Aparecen cuando un caso se procesa.</td></tr>
            )}
            {reports.map((r) => (
              <tr key={r.reportId} className="border-t border-[var(--atm-linea)]">
                <td className="px-4 py-2 font-mono text-xs">{r.externalCaseId}</td>
                <td className="px-4 py-2 text-zinc-600">{r.batch?.name ?? "—"}</td>
                <td className="px-4 py-2 text-zinc-600">{r.doctor?.fullName ?? "—"}</td>
                <td className="px-4 py-2 text-zinc-600">v{r.version}</td>
                <td className="px-4 py-2 text-zinc-600">{WORKFLOW_LABEL[r.workflowStatus]}</td>
                <td className="px-4 py-2 text-zinc-600">{r.orientationAssessment ? ORIENTATION_LABEL[r.orientationAssessment] : "—"}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <a
                    href={`/api/v1/reports/${r.reportId}/download`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs text-[var(--atm-azul)] hover:bg-blue-50"
                  >
                    Preinforme
                  </a>
                  {r.signedAt && (
                    <a
                      href={`/api/v1/reports/${r.reportId}/signed-document`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1 rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs text-[var(--atm-azul)] hover:bg-blue-50"
                    >
                      Firmado
                    </a>
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
