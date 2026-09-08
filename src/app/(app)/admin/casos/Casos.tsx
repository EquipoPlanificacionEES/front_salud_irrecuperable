"use client";

import { useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import { useAdminCases, useBatches, useDoctorWorkload, useInvalidar } from "@/lib/queries";
import { CASE_STATUS_LABEL, ORIENTATION_LABEL, WORKFLOW_LABEL } from "@/lib/backend";
import { Refrescando, TablaSkeleton } from "@/components/Skeleton";
import { Aviso, Btn, Chip, FilaVacia, Select, Stat, Tabla, Textarea, workflowTono } from "../ui";

// GET  /api/v1/admin/cases?batchId=&assignment=&status=&limit=&offset=
// GET  /api/v1/admin/doctor-workload            (desplegable de reasignación)
// PUT  /api/v1/admin/cases/:id/assignment       {doctorProfileId}
// POST /api/v1/admin/cases/:id/assignment/end   {reason}   ← el motivo es OBLIGATORIO

export function Casos() {
  // Filtros: estado de INTERFAZ. Entran en la clave de la consulta, así que dos
  // combinaciones distintas no se pisan en la caché.
  const [fBatch, setFBatch] = useState("");
  const [fAsig, setFAsig] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  // Compartidas con el resumen, informes, asignaciones y reasignación: si otra
  // pantalla las pidió hace poco, aquí no cuestan nada.
  const { data: semanas = [] } = useBatches();
  const { data: medicos = [] } = useDoctorWorkload();

  const filtros = { batchId: fBatch || undefined, assignment: fAsig || undefined, limit: 100 };
  const { data, error: fallo, isPending, isFetching } = useAdminCases(filtros);
  const invalidar = useInvalidar();

  const casos = data?.cases ?? [];
  const total = data?.total ?? 0;
  const errorCarga = fallo ? (fallo instanceof ApiFallo ? fallo.message : "No se pudo cargar.") : null;

  async function reasignar(caseId: string, doctorProfileId: string) {
    setMsg(null);
    try {
      await api(`/admin/cases/${caseId}/assignment`, { method: "PUT", json: { doctorProfileId } });
      setMsg({ ok: true, texto: "Caso reasignado." });
      // Mover un caso cambia la carga del médico que lo pierde y la del que lo
      // gana, el listado, el contexto de reparto de esa semana y la bandeja.
      await invalidar.asignacionesCambiadas();
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
      await invalidar.asignacionesCambiadas();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo retirar la asignación." });
    } finally {
      setBusy(false);
    }
  }

  const asignados = casos.filter((c) => c.assignment).length;

  // Primera carga: esqueleto. Al cambiar de filtro la tabla NO se desmonta:
  // `placeholderData` conserva el resultado anterior mientras llega el nuevo, y
  // el punto de «Actualizando…» dice que está en marcha. Antes desaparecía
  // entera y volvía a aparecer, con 93 filas de salto de layout.
  if (isPending) return <TablaSkeleton filas={10} columnas={7} />;

  return (
    <div className="space-y-5">
      {errorCarga && <Aviso ok={false}>{errorCarga}</Aviso>}
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
        {/* Al cambiar de filtro la tabla de abajo sigue en pantalla con el
            resultado anterior. Esto dice que ya viene el nuevo. */}
        <span className="ml-auto">
          <Refrescando visible={isFetching} />
        </span>
      </div>

      {msg && <Aviso ok={msg.ok}>{msg.texto}</Aviso>}

      <Tabla columnas={["Nº trámite", "Semana", "Estado", "Informe", "Orientación", "Médico responsable", ""]}>
        {casos.length === 0 && (
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
