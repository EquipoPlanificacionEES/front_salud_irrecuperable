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
import { Aviso, Chip, FilaVacia, Select, Tabla, workflowTono } from "../ui";

// GET /api/v1/reports?batchId=&workflowStatus=&limit=&offset=
// GET /api/v1/reports/:id/download          (PRE_REPORT .docx)
// GET /api/v1/reports/:id/signed-document   (informe final firmado .docx)

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--atm-linea)] bg-white p-3 text-sm shadow-sm">
        <Select value={fBatch} onChange={(e) => setFBatch(e.target.value)}>
          <option value="">Todas las semanas</option>
          {semanas.map(({ batch }) => (
            <option key={batch.id} value={batch.id}>
              {batch.name}
            </option>
          ))}
        </Select>
        <Select value={fWf} onChange={(e) => setFWf(e.target.value)}>
          <option value="">Cualquier estado</option>
          {ORDEN.map((w) => (
            <option key={w} value={w}>
              {WORKFLOW_LABEL[w]}
            </option>
          ))}
        </Select>
        <span className="ml-auto text-zinc-400">{total} informe(s)</span>
      </div>

      {ORDEN.some((w) => counts[w]) && (
        <div className="flex flex-wrap gap-2">
          {ORDEN.filter((w) => counts[w]).map((w) => (
            <Chip key={w} tono={workflowTono(w)}>
              {WORKFLOW_LABEL[w]}: {counts[w]}
            </Chip>
          ))}
        </div>
      )}

      {msg && <Aviso ok={false}>{msg}</Aviso>}

      <Tabla columnas={["Nº trámite", "Semana", "Médico", "Versión", "Estado", "Orientación", ""]}>
        {cargando && <FilaVacia cols={7}>Cargando…</FilaVacia>}
        {!cargando && reports.length === 0 && (
          <FilaVacia cols={7}>Sin informes. Aparecen cuando un caso se procesa.</FilaVacia>
        )}
        {reports.map((r) => (
          <tr key={r.reportId} className="border-t border-[var(--atm-linea)] hover:bg-[var(--atm-fondo)]">
            <td className="px-4 py-2.5 font-mono text-xs text-zinc-800">{r.externalCaseId}</td>
            <td className="px-4 py-2.5 text-zinc-600">{r.batch?.name ?? "—"}</td>
            <td className="px-4 py-2.5 text-zinc-600">{r.doctor?.fullName ?? "—"}</td>
            <td className="px-4 py-2.5 text-zinc-600">v{r.version}</td>
            <td className="px-4 py-2.5">
              <Chip tono={workflowTono(r.workflowStatus)}>{WORKFLOW_LABEL[r.workflowStatus]}</Chip>
            </td>
            <td className="px-4 py-2.5 text-zinc-600">
              {r.orientationAssessment ? ORIENTATION_LABEL[r.orientationAssessment] : "—"}
            </td>
            <td className="px-4 py-2.5 text-right whitespace-nowrap">
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
      </Tabla>
    </div>
  );
}
