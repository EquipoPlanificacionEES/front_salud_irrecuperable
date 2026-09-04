"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiFallo } from "@/lib/api";
import type { AssignmentContext, AssignmentPreview, BatchListItem } from "@/lib/backend";

// GET  /api/v1/admin/batches?status=OPEN
// GET  /api/v1/admin/batches/:id/assignment-context
// POST /api/v1/admin/batches/:id/assignments/preview   {allocations:[{doctorProfileId,quantity}]}
// POST /api/v1/admin/batches/:id/assignments           {allocations, eligibilityFingerprint}

const input = "w-20 rounded-lg border border-[var(--atm-linea)] px-2 py-1 text-sm outline-none focus:border-[var(--atm-azul2)]";

export function Asignaciones() {
  const qp = useSearchParams();
  const [semanas, setSemanas] = useState<BatchListItem[]>([]);
  const [batchId, setBatchId] = useState<string>("");
  const [ctx, setCtx] = useState<AssignmentContext | null>(null);
  const [cant, setCant] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<AssignmentPreview | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ batches: BatchListItem[] }>("/admin/batches?status=OPEN&limit=200")
      .then((d) => {
        setSemanas(d.batches);
        const pedido = qp.get("semana");
        setBatchId(pedido && d.batches.some((b) => b.batch.id === pedido) ? pedido : d.batches[0]?.batch.id ?? "");
      })
      .catch((e) => setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudieron cargar las semanas." }));
  }, [qp]);

  const cargarCtx = useCallback(async (id: string) => {
    if (!id) return;
    setPreview(null);
    setCant({});
    try {
      setCtx(await api<AssignmentContext>(`/admin/batches/${id}/assignment-context`));
    } catch (e) {
      setCtx(null);
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo cargar la semana." });
    }
  }, []);
  useEffect(() => {
    void cargarCtx(batchId);
  }, [batchId, cargarCtx]);

  const allocations = () =>
    Object.entries(cant)
      .filter(([, q]) => q > 0)
      .map(([doctorProfileId, quantity]) => ({ doctorProfileId, quantity }));

  const totalPedido = allocations().reduce((s, a) => s + a.quantity, 0);

  async function previsualizar() {
    if (!ctx || allocations().length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      setPreview(await api<AssignmentPreview>(`/admin/batches/${ctx.batch.id}/assignments/preview`, { json: { allocations: allocations() } }));
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "Error en la previsualización." });
    } finally {
      setBusy(false);
    }
  }

  async function confirmar() {
    if (!ctx || !preview || !preview.valid) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ assignedCaseCount: number }>(`/admin/batches/${ctx.batch.id}/assignments`, {
        json: { allocations: allocations(), eligibilityFingerprint: preview.eligibilityFingerprint },
      });
      setMsg({ ok: true, texto: `Distribución confirmada: ${r.assignedCaseCount} caso(s) asignado(s).` });
      setPreview(null);
      setCant({});
      await cargarCtx(ctx.batch.id);
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? `${e.message}${e.status === 409 ? " (el universo de casos cambió; vuelve a previsualizar)" : ""}` : "Error al confirmar." });
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  const proyeccion = (docId: string) => preview?.allocations.find((a) => a.doctorProfileId === docId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-zinc-600">Semana</label>
        <select
          className="rounded-lg border border-[var(--atm-linea)] px-3 py-2 text-sm outline-none focus:border-[var(--atm-azul2)]"
          value={batchId}
          onChange={(e) => setBatchId(e.target.value)}
        >
          {semanas.length === 0 && <option value="">— sin semanas abiertas —</option>}
          {semanas.map(({ batch }) => (
            <option key={batch.id} value={batch.id}>{batch.name}</option>
          ))}
        </select>
      </div>

      {ctx && (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            <Pill label="Casos elegibles" valor={ctx.eligibleCases} />
            <Pill label="Ya asignados" valor={ctx.assignedCases} />
            <Pill label="A repartir ahora" valor={totalPedido} destacado />
            {!ctx.assignable && <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-[var(--atm-obs)]">Semana cerrada — no acepta reparto</span>}
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--atm-th)] text-left text-white">
                  <th className="px-4 py-2 font-medium">Médico</th>
                  <th className="px-4 py-2 font-medium">SIS</th>
                  <th className="px-4 py-2 font-medium">Carga actual</th>
                  <th className="px-4 py-2 font-medium">Pendientes</th>
                  <th className="px-4 py-2 font-medium">Asignar</th>
                  {preview && <th className="px-4 py-2 font-medium">Quedaría con</th>}
                </tr>
              </thead>
              <tbody>
                {ctx.doctors.length === 0 && (
                  <tr><td colSpan={preview ? 6 : 5} className="px-4 py-6 text-center text-zinc-400">No hay médicos en el contrato.</td></tr>
                )}
                {ctx.doctors.map((d) => (
                  <tr key={d.doctorProfileId} className={`border-t border-[var(--atm-linea)] ${!d.assignable ? "opacity-50" : ""}`}>
                    <td className="px-4 py-2">{d.fullName}{!d.assignable && " (inactivo)"}</td>
                    <td className="px-4 py-2 text-zinc-500">{d.professionalCode ?? "—"}</td>
                    <td className="px-4 py-2 text-zinc-600">{d.currentLoad}</td>
                    <td className="px-4 py-2 text-zinc-600">{d.pendingReview}</td>
                    <td className="px-4 py-2">
                      <input
                        className={input}
                        type="number"
                        min={0}
                        disabled={!d.assignable || !ctx.assignable}
                        value={cant[d.doctorProfileId] ?? ""}
                        onChange={(e) => {
                          setPreview(null);
                          setCant((c) => ({ ...c, [d.doctorProfileId]: Math.max(0, Number(e.target.value) || 0) }));
                        }}
                      />
                    </td>
                    {preview && (
                      <td className="px-4 py-2 text-zinc-600">
                        {proyeccion(d.doctorProfileId)?.projectedLoad ?? d.currentLoad}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview && !preview.valid && (
            <ul className="rounded-lg border border-[var(--atm-mal)] bg-red-50 p-3 text-sm text-[var(--atm-mal)]">
              {preview.problems.map((p, i) => <li key={i}>· {p.statement}</li>)}
            </ul>
          )}
          {preview?.valid && (
            <p className="text-sm text-[var(--atm-ok)]">
              Plan válido: {preview.requestedCases} casos a repartir, quedan {preview.remainingCases} sin asignar.
            </p>
          )}
          {msg && <p className={`text-sm ${msg.ok ? "text-[var(--atm-ok)]" : "text-[var(--atm-mal)]"}`}>{msg.texto}</p>}

          <div className="flex gap-2">
            <button
              onClick={previsualizar}
              disabled={busy || totalPedido === 0 || !ctx.assignable}
              className="rounded-lg border border-[var(--atm-azul2)] px-4 py-2 text-sm font-semibold text-[var(--atm-azul)] hover:bg-blue-50 disabled:opacity-40"
            >
              Previsualizar
            </button>
            <button
              onClick={confirmar}
              disabled={busy || !preview?.valid}
              className="rounded-lg bg-[var(--atm-azul)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--atm-azul2)] disabled:opacity-40"
            >
              Confirmar distribución
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Pill({ label, valor, destacado }: { label: string; valor: number; destacado?: boolean }) {
  return (
    <span className={`rounded-lg border px-3 py-1.5 ${destacado ? "border-[var(--atm-azul2)] bg-blue-50 font-semibold text-[var(--atm-azul)]" : "border-[var(--atm-linea)] bg-white text-zinc-600"}`}>
      {label}: {valor}
    </span>
  );
}
