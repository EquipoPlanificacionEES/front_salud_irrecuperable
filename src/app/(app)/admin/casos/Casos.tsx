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
import { Aviso, Btn, Chip, FilaVacia, Select, Stat, Tabla, Textarea, workflowTono } from "../ui";

// GET  /api/v1/admin/cases?batchId=&assignment=&status=&limit=&offset=
// GET  /api/v1/admin/doctor-workload            (desplegable de reasignación)
// PUT  /api/v1/admin/cases/:id/assignment       {doctorProfileId}
// POST /api/v1/admin/cases/:id/assignment/end   {reason}   ← el motivo es OBLIGATORIO

export function Casos() {
  const [casos, setCasos] = useState<OperationalCase[]>([]);
  const [total, setTotal] = useState(0);
  const [semanas, setSemanas] = useState<BatchListItem[]>([]);
  const [medicos, setMedicos] = useState<DoctorWorkload[]>([]);
  const [fBatch, setFBatch] = useState("");
  const [fAsig, setFAsig] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

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
      await api(`/admin/cases/${caseId}/assignment`, { method: "PUT", json: { doctorProfileId } });
      setMsg({ ok: true, texto: "Caso reasignado." });
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "Error al reasignar." });
    }
  }

  async function quitar(caseId: string) {
    if (motivo.trim().length < 3) {
      setMsg({ ok: false, texto: "Indica un motivo (mín. 3 caracteres)." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api(`/admin/cases/${caseId}/assignment/end`, { json: { reason: motivo.trim() } });
      setMsg({ ok: true, texto: "Asignación retirada. El caso queda sin médico responsable." });
      setQuitando(null);
      setMotivo("");
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo retirar la asignación." });
    } finally {
      setBusy(false);
    }
  }

  const asignados = casos.filter((c) => c.assignment).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Casos (filtro actual)" valor={total} />
        <Stat label="Con médico" valor={asignados} tono="ok" />
        <Stat label="Sin asignar" valor={casos.length - asignados} tono={casos.length - asignados ? "obs" : "neutral"} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--atm-linea)] bg-white p-3 text-sm shadow-sm">
        <Select value={fBatch} onChange={(e) => setFBatch(e.target.value)}>
          <option value="">Todas las semanas</option>
          {semanas.map(({ batch }) => (
            <option key={batch.id} value={batch.id}>
              {batch.name}
            </option>
          ))}
        </Select>
        <Select value={fAsig} onChange={(e) => setFAsig(e.target.value)}>
          <option value="">Asignadas y sin asignar</option>
          <option value="ASSIGNED">Solo asignadas</option>
          <option value="UNASSIGNED">Solo sin asignar</option>
        </Select>
      </div>

      {msg && <Aviso ok={msg.ok}>{msg.texto}</Aviso>}

      <Tabla columnas={["Nº trámite", "Semana", "Estado", "Informe", "Orientación", "Médico responsable", ""]}>
        {cargando && <FilaVacia cols={7}>Cargando…</FilaVacia>}
        {!cargando && casos.length === 0 && (
          <FilaVacia cols={7}>Sin casos. Llegan cuando el bot procesa una semana.</FilaVacia>
        )}
        {casos.map((c) => (
          <tr key={c.caseId} className="border-t border-[var(--atm-linea)] align-top hover:bg-[var(--atm-fondo)]">
            <td className="px-4 py-2.5 font-mono text-xs text-zinc-800">{c.externalCaseId}</td>
            <td className="px-4 py-2.5 text-zinc-600">{c.batch?.name ?? "—"}</td>
            <td className="px-4 py-2.5">
              <Chip>{CASE_STATUS_LABEL[c.status] ?? c.status}</Chip>
            </td>
            <td className="px-4 py-2.5">
              {c.report ? (
                <Chip tono={workflowTono(c.report.workflowStatus)}>{WORKFLOW_LABEL[c.report.workflowStatus]}</Chip>
              ) : (
                <span className="text-xs text-zinc-400">—</span>
              )}
            </td>
            <td className="px-4 py-2.5 text-zinc-600">
              {c.report?.orientationAssessment ? ORIENTATION_LABEL[c.report.orientationAssessment] : "—"}
            </td>
            <td className="px-4 py-2.5">
              <Select
                className="w-full min-w-44"
                value={c.assignment?.doctorProfileId ?? ""}
                onChange={(e) => e.target.value && reasignar(c.caseId, e.target.value)}
              >
                <option value="">— sin asignar —</option>
                {medicos.map((m) => (
                  <option key={m.doctorProfileId} value={m.doctorProfileId}>
                    {m.fullName}
                    {!m.assignable ? " (inactivo)" : ""}
                  </option>
                ))}
              </Select>
              {quitando === c.caseId && (
                <div className="mt-2 space-y-2">
                  <Textarea
                    rows={2}
                    className="w-full text-xs"
                    placeholder="Motivo para dejar el caso sin médico (queda en el historial)"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Btn
                      variante="neutral"
                      className="px-2.5 py-1 text-xs"
                      onClick={() => {
                        setQuitando(null);
                        setMotivo("");
                      }}
                    >
                      Cancelar
                    </Btn>
                    <Btn
                      variante="danger"
                      className="px-2.5 py-1 text-xs"
                      disabled={busy || motivo.trim().length < 3}
                      onClick={() => quitar(c.caseId)}
                    >
                      {busy ? "Retirando…" : "Confirmar"}
                    </Btn>
                  </div>
                </div>
              )}
            </td>
            <td className="px-4 py-2.5 text-right">
              {c.assignment && quitando !== c.caseId && (
                <Btn
                  variante="danger"
                  className="px-2.5 py-1 text-xs"
                  onClick={() => {
                    setQuitando(c.caseId);
                    setMotivo("");
                    setMsg(null);
                  }}
                >
                  Quitar
                </Btn>
              )}
            </td>
          </tr>
        ))}
      </Tabla>
    </div>
  );
}
