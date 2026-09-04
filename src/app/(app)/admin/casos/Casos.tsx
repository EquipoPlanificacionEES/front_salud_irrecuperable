"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import {
  CASE_STATUS_LABEL,
  ORIENTATION_LABEL,
  WORKFLOW_LABEL,
  type BatchListItem,
  type DoctorWorkload,
  type OperationalCase,
} from "@/lib/backend";

// GET /api/v1/admin/cases?batchId=&assignment=&status=&limit=&offset=
// GET /api/v1/admin/doctor-workload            (para el desplegable de reasignación)
// PUT /api/v1/admin/cases/:id/assignment       {doctorProfileId}
// POST /api/v1/admin/cases/:id/assignment/end

const sel = "rounded-lg border border-[var(--atm-linea)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--atm-azul2)]";

export function Casos() {
  const [casos, setCasos] = useState<OperationalCase[]>([]);
  const [total, setTotal] = useState(0);
  const [semanas, setSemanas] = useState<BatchListItem[]>([]);
  const [medicos, setMedicos] = useState<DoctorWorkload[]>([]);
  const [fBatch, setFBatch] = useState("");
  const [fAsig, setFAsig] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api<{ batches: BatchListItem[] }>("/admin/batches?limit=200").then((d) => setSemanas(d.batches)).catch(() => {});
    api<{ doctors: DoctorWorkload[] }>("/admin/doctor-workload?includeInactive=true").then((d) => setMedicos(d.doctors)).catch(() => {});
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    const q = new URLSearchParams({ limit: "100" });
    if (fBatch) q.set("batchId", fBatch);
    if (fAsig) q.set("assignment", fAsig);
    try {
      const d = await api<{ cases: OperationalCase[]; total: number }>(`/admin/cases?${q}`);
      setCasos(d.cases);
      setTotal(d.total);
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo cargar." });
    } finally {
      setCargando(false);
    }
  }, [fBatch, fAsig]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function reasignar(caseId: string, doctorProfileId: string) {
    setMsg(null);
    try {
      if (doctorProfileId === "__end__") {
        await api(`/admin/cases/${caseId}/assignment/end`, { method: "POST" });
      } else {
        await api(`/admin/cases/${caseId}/assignment`, { method: "PUT", json: { doctorProfileId } });
      }
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "Error al reasignar." });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select className={sel} value={fBatch} onChange={(e) => setFBatch(e.target.value)}>
          <option value="">Todas las semanas</option>
          {semanas.map(({ batch }) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
        </select>
        <select className={sel} value={fAsig} onChange={(e) => setFAsig(e.target.value)}>
          <option value="">Asignadas y sin asignar</option>
          <option value="ASSIGNED">Solo asignadas</option>
          <option value="UNASSIGNED">Solo sin asignar</option>
        </select>
        <span className="text-zinc-400">{total} caso(s)</span>
      </div>

      {msg && <p className={`text-sm ${msg.ok ? "text-[var(--atm-ok)]" : "text-[var(--atm-mal)]"}`}>{msg.texto}</p>}

      <div className="overflow-x-auto rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--atm-th)] text-left text-white">
              <th className="px-4 py-2 font-medium">Nº trámite</th>
              <th className="px-4 py-2 font-medium">Semana</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Informe</th>
              <th className="px-4 py-2 font-medium">Orientación</th>
              <th className="px-4 py-2 font-medium">Médico</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={6} className="px-4 py-6 text-center text-zinc-400">Cargando…</td></tr>}
            {!cargando && casos.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-400">Sin casos. Llegan cuando el bot procesa una semana.</td></tr>
            )}
            {casos.map((c) => (
              <tr key={c.caseId} className="border-t border-[var(--atm-linea)]">
                <td className="px-4 py-2 font-mono text-xs">{c.externalCaseId}</td>
                <td className="px-4 py-2 text-zinc-600">{c.batch?.name ?? "—"}</td>
                <td className="px-4 py-2 text-zinc-600">{CASE_STATUS_LABEL[c.status] ?? c.status}</td>
                <td className="px-4 py-2 text-zinc-600">{c.report ? WORKFLOW_LABEL[c.report.workflowStatus] : "—"}</td>
                <td className="px-4 py-2 text-zinc-600">
                  {c.report?.orientationAssessment ? ORIENTATION_LABEL[c.report.orientationAssessment] : "—"}
                </td>
                <td className="px-4 py-2">
                  <select
                    className={sel}
                    value={c.assignment?.doctorProfileId ?? ""}
                    onChange={(e) => e.target.value && reasignar(c.caseId, e.target.value)}
                  >
                    <option value="">— sin asignar —</option>
                    {medicos.map((m) => (
                      <option key={m.doctorProfileId} value={m.doctorProfileId}>{m.fullName}</option>
                    ))}
                    {c.assignment && <option value="__end__">Quitar asignación</option>}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
