"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import {
  CASE_STATUS_LABEL,
  WORKFLOW_LABEL,
  type DoctorWorkload,
  type OperationalCase,
} from "@/lib/backend";
import { Aviso, Btn, Campo, Chip, FilaVacia, Input, Select, Stat, Tabla, Textarea, workflowTono } from "../ui";

// No existe un endpoint de traspaso masivo: el backend solo reasigna caso por caso.
//   GET  /api/v1/admin/doctor-workload?includeInactive=true
//   GET  /api/v1/admin/cases?doctorProfileId=<origen>&assignment=ASSIGNED&limit=200
//   PUT  /api/v1/admin/cases/:caseId/assignment      {doctorProfileId, reason}
//   POST /api/v1/admin/cases/:caseId/assignment/end  {reason}

export function Reasignar() {
  const [medicos, setMedicos] = useState<DoctorWorkload[]>([]);
  const [origen, setOrigen] = useState("");
  const [casos, setCasos] = useState<OperationalCase[]>([]);
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // traspaso masivo (loop de PUT)
  const [destino, setDestino] = useState("");
  const [nMover, setNMover] = useState(1);
  const [motivoLote, setMotivoLote] = useState("");

  // soltar un caso
  const [soltando, setSoltando] = useState<string | null>(null);
  const [motivoSoltar, setMotivoSoltar] = useState("");

  const cargarMedicos = useCallback(async () => {
    try {
      const d = await api<{ doctors: DoctorWorkload[] }>("/admin/doctor-workload?includeInactive=true");
      setMedicos(d.doctors);
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudieron cargar los médicos." });
    }
  }, []);
  useEffect(() => {
    void cargarMedicos();
  }, [cargarMedicos]);

  const cargarCasos = useCallback(async (docId: string) => {
    if (!docId) {
      setCasos([]);
      return;
    }
    setCargando(true);
    try {
      const q = new URLSearchParams({ doctorProfileId: docId, assignment: "ASSIGNED", limit: "200" });
      const d = await api<{ cases: OperationalCase[] }>(`/admin/cases?${q}`);
      setCasos(d.cases);
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudieron cargar los casos." });
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    void cargarCasos(origen);
  }, [origen, cargarCasos]);

  async function refrescar() {
    await Promise.all([cargarMedicos(), cargarCasos(origen)]);
  }

  async function moverUno(caseId: string, doctorProfileId: string) {
    setMsg(null);
    setBusy(true);
    try {
      await api(`/admin/cases/${caseId}/assignment`, {
        method: "PUT",
        json: { doctorProfileId, reason: "Reasignación operativa" },
      });
      setMsg({ ok: true, texto: "Caso movido." });
      await refrescar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo mover el caso." });
    } finally {
      setBusy(false);
    }
  }

  async function moverLote() {
    if (!destino || destino === origen) {
      setMsg({ ok: false, texto: "Elige un médico de destino distinto al de origen." });
      return;
    }
    if (motivoLote.trim().length < 3) {
      setMsg({ ok: false, texto: "Indica un motivo para el traspaso (mín. 3 caracteres)." });
      return;
    }
    const lote = casos.slice(0, Math.max(1, Math.min(nMover, casos.length)));
    setBusy(true);
    setMsg(null);
    let ok = 0;
    for (const c of lote) {
      try {
        await api(`/admin/cases/${c.caseId}/assignment`, {
          method: "PUT",
          json: { doctorProfileId: destino, reason: motivoLote.trim() },
        });
        ok += 1;
      } catch {
        /* se informa el total al final */
      }
    }
    setBusy(false);
    setMotivoLote("");
    setMsg({
      ok: ok === lote.length,
      texto:
        ok === lote.length
          ? `${ok} caso(s) movido(s) al nuevo médico.`
          : `Se movieron ${ok} de ${lote.length}. Revisa los que quedaron y reintenta.`,
    });
    await refrescar();
  }

  async function soltar(caseId: string) {
    if (motivoSoltar.trim().length < 3) {
      setMsg({ ok: false, texto: "Indica un motivo (mín. 3 caracteres)." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api(`/admin/cases/${caseId}/assignment/end`, { json: { reason: motivoSoltar.trim() } });
      setMsg({ ok: true, texto: "Caso liberado. Queda sin médico responsable." });
      setSoltando(null);
      setMotivoSoltar("");
      await refrescar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo liberar el caso." });
    } finally {
      setBusy(false);
    }
  }

  const med = medicos.find((m) => m.doctorProfileId === origen);
  const otros = medicos.filter((m) => m.doctorProfileId !== origen && m.assignable);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-4 shadow-sm">
        <Campo label="Médico a revisar" hint="Se listan sus casos con asignación vigente.">
          <Select className="w-72" value={origen} onChange={(e) => setOrigen(e.target.value)}>
            <option value="">— elige un médico —</option>
            {medicos.map((m) => (
              <option key={m.doctorProfileId} value={m.doctorProfileId}>
                {m.fullName} · {m.currentLoad} caso(s){!m.assignable ? " (inactivo)" : ""}
              </option>
            ))}
          </Select>
        </Campo>
      </div>

      {msg && <Aviso ok={msg.ok}>{msg.texto}</Aviso>}

      {med && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Carga actual" valor={med.currentLoad} />
            <Stat label="Por revisar" valor={med.pendingReview} tono={med.pendingReview ? "obs" : "neutral"} />
            <Stat label="Sin informe" valor={med.casesWithoutReport} />
            <Stat label="Firmados" valor={med.signed} tono="ok" />
          </div>

          {casos.length > 0 && (
            <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm font-medium text-zinc-700">Traspaso en bloque</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo label="Mover a">
                  <Select value={destino} onChange={(e) => setDestino(e.target.value)}>
                    <option value="">— médico de destino —</option>
                    {otros.map((m) => (
                      <option key={m.doctorProfileId} value={m.doctorProfileId}>
                        {m.fullName} · {m.currentLoad} caso(s)
                      </option>
                    ))}
                  </Select>
                </Campo>
                <Campo label={`Cuántos (de ${casos.length})`}>
                  <Input
                    type="number"
                    min={1}
                    max={casos.length}
                    value={nMover}
                    onChange={(e) => setNMover(Math.max(1, Math.min(casos.length, Math.floor(Number(e.target.value) || 1))))}
                  />
                </Campo>
                <Campo label="Motivo">
                  <Input value={motivoLote} onChange={(e) => setMotivoLote(e.target.value)} placeholder="Ausencia, sobrecarga…" />
                </Campo>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Btn onClick={moverLote} disabled={busy || !destino}>
                  {busy ? "Moviendo…" : `Mover ${Math.min(nMover, casos.length)} caso(s)`}
                </Btn>
                <span className="text-xs text-zinc-500">
                  Toma los primeros de la lista. Los movimientos se aplican uno por uno.
                </span>
              </div>
            </div>
          )}

          <Tabla columnas={["Nº trámite", "Semana", "Estado", "Informe", "Mover a", ""]}>
            {cargando && <FilaVacia cols={6}>Cargando…</FilaVacia>}
            {!cargando && casos.length === 0 && <FilaVacia cols={6}>Este médico no tiene casos asignados.</FilaVacia>}
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
                <td className="px-4 py-2.5">
                  <Select
                    className="w-full min-w-44"
                    value=""
                    disabled={busy}
                    onChange={(e) => e.target.value && moverUno(c.caseId, e.target.value)}
                  >
                    <option value="">— elegir médico —</option>
                    {otros.map((m) => (
                      <option key={m.doctorProfileId} value={m.doctorProfileId}>
                        {m.fullName}
                      </option>
                    ))}
                  </Select>
                  {soltando === c.caseId && (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        rows={2}
                        className="w-full text-xs"
                        placeholder="Motivo para dejar el caso sin médico"
                        value={motivoSoltar}
                        onChange={(e) => setMotivoSoltar(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Btn
                          variante="neutral"
                          className="px-2.5 py-1 text-xs"
                          onClick={() => {
                            setSoltando(null);
                            setMotivoSoltar("");
                          }}
                        >
                          Cancelar
                        </Btn>
                        <Btn
                          variante="danger"
                          className="px-2.5 py-1 text-xs"
                          disabled={busy || motivoSoltar.trim().length < 3}
                          onClick={() => soltar(c.caseId)}
                        >
                          {busy ? "Liberando…" : "Confirmar"}
                        </Btn>
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {soltando !== c.caseId && (
                    <Btn
                      variante="danger"
                      className="px-2.5 py-1 text-xs"
                      onClick={() => {
                        setSoltando(c.caseId);
                        setMotivoSoltar("");
                        setMsg(null);
                      }}
                    >
                      Soltar
                    </Btn>
                  )}
                </td>
              </tr>
            ))}
          </Tabla>
        </>
      )}
    </div>
  );
}
