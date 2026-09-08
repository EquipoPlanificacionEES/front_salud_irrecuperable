"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiFallo } from "@/lib/api";
import { useAssignmentContext, useBatches, useInvalidar } from "@/lib/queries";
import type { AssignmentPreview } from "@/lib/backend";
import { TablaSkeleton } from "@/components/Skeleton";
import { Aviso, Btn, Campo, Select, Stat, Tabla } from "../ui";

// GET  /api/v1/admin/batches?status=OPEN
// GET  /api/v1/admin/batches/:id/assignment-context
// POST /api/v1/admin/batches/:id/assignments/preview   {allocations:[{doctorProfileId,quantity}]}
// POST /api/v1/admin/batches/:id/assignments           {allocations, eligibilityFingerprint}

export function Asignaciones() {
  const qp = useSearchParams();
  const [elegida, setElegida] = useState<string | null>(null);
  const [cant, setCant] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<AssignmentPreview | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: semanas = [], error: falloSemanas, isPending: cargandoSemanas } = useBatches({
    status: "OPEN",
  });
  const invalidar = useInvalidar();

  /**
   * EL ESLABÓN QUE SOBRABA EN LA CADENA.
   *
   * Esta pantalla era la más lenta de administración —576 ms frente a 355 ms de
   * las demás— porque encadenaba: pedir las semanas, guardar la elegida en
   * estado, RENDERIZAR, y sólo entonces pedir el contexto de reparto. Ese render
   * intermedio es un salto entero de ida y vuelta al backend que no hacía falta.
   *
   * La semana elegida se DERIVA de las semanas en vez de guardarse: en cuanto
   * llegan, `batchId` ya tiene valor en ese mismo render y la consulta del
   * contexto arranca sin esperar a otro. `elegida` sólo existe para cuando la
   * persona cambia el desplegable a mano.
   *
   * Y como las semanas son la MISMA consulta que usan casos, informes y el
   * resumen, quien llega aquí desde otra pantalla de administración ya las tiene
   * en caché: entonces no queda ni cadena ni espera.
   */
  const pedida = qp.get("semana");
  const batchId =
    elegida ??
    (pedida && semanas.some((b) => b.batch.id === pedida) ? pedida : (semanas[0]?.batch.id ?? ""));

  const { data: ctx, error: falloCtx } = useAssignmentContext(batchId);

  const errorCarga =
    falloSemanas || falloCtx
      ? falloSemanas instanceof ApiFallo
        ? falloSemanas.message
        : falloCtx instanceof ApiFallo
          ? falloCtx.message
          : "No se pudo cargar la semana."
      : null;

  /** Cambiar de semana descarta la previsualización: era de la anterior. */
  function elegirSemana(id: string) {
    setElegida(id);
    setPreview(null);
    setCant({});
  }

  const allocations = () =>
    Object.entries(cant)
      .filter(([, q]) => q > 0)
      .map(([doctorProfileId, quantity]) => ({ doctorProfileId, quantity }));

  const totalPedido = allocations().reduce((s, a) => s + a.quantity, 0);
  const disponible = ctx?.eligibleCases ?? 0;
  const restante = Math.max(0, disponible - totalPedido);

  async function previsualizar() {
    if (!ctx || allocations().length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      setPreview(
        await api<AssignmentPreview>(`/admin/batches/${ctx.batch.id}/assignments/preview`, { json: { allocations: allocations() } }),
      );
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
      // Repartir trabajo cambia la carga de cada médico, el listado operacional,
      // el contexto de esta semana y las bandejas. Se caduca eso y nada más.
      await invalidar.asignacionesCambiadas();
    } catch (e) {
      setMsg({
        ok: false,
        texto:
          e instanceof ApiFallo
            ? `${e.message}${e.status === 409 ? " (el universo de casos cambió; vuelve a previsualizar)" : ""}`
            : "Error al confirmar.",
      });
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  const proyeccion = (docId: string) => preview?.allocations.find((a) => a.doctorProfileId === docId);

  if (cargandoSemanas) return <TablaSkeleton filas={3} columnas={5} />;

  return (
    <div className="space-y-5">
      {errorCarga && <Aviso ok={false}>{errorCarga}</Aviso>}
      <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-4 shadow-sm">
        <Campo label="Semana a repartir" hint="Solo aparecen las semanas abiertas.">
          <Select className="w-64" value={batchId} onChange={(e) => elegirSemana(e.target.value)}>
            {semanas.length === 0 && <option value="">— sin semanas abiertas —</option>}
            {semanas.map(({ batch }) => (
              <option key={batch.id} value={batch.id}>
                {batch.name}
              </option>
            ))}
          </Select>
        </Campo>
      </div>

      {ctx && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Casos elegibles" valor={ctx.eligibleCases} />
            <Stat label="Ya asignados" valor={ctx.assignedCases} />
            <Stat
              label={`A repartir ahora (máx. ${disponible})`}
              valor={totalPedido}
              tono={totalPedido ? "azul" : "neutral"}
            />
          </div>

          {!ctx.assignable && <Aviso ok={false}>Semana cerrada — no acepta reparto. Reábrela desde “Semanas”.</Aviso>}
          {ctx.assignable && disponible === 0 && (
            <Aviso ok={false}>Esta semana no tiene casos sin asignar. No hay nada que repartir.</Aviso>
          )}
          {ctx.assignable && disponible > 0 && (
            <p className="text-sm text-zinc-500">
              Repartes <strong className="text-zinc-800">{totalPedido}</strong> de {disponible} disponibles ·{" "}
              {restante} quedarán sin asignar. No puedes pedir más de lo que hay.
            </p>
          )}

          <Tabla
            columnas={[
              "Médico",
              "SIS",
              // «Asignados» y no «carga actual»: cuenta TODOS sus expedientes,
              // firmados incluidos, que es lo que hace falta saber para repartir.
              "Asignados",
              "Por revisar",
              "Retenidos",
              "Asignar",
              ...(preview ? ["Quedaría con"] : []),
            ]}
          >
            {ctx.doctors.length === 0 && (
              <tr>
                <td colSpan={preview ? 7 : 6} className="px-4 py-10 text-center text-zinc-400">
                  No hay médicos en el contrato.
                </td>
              </tr>
            )}
            {ctx.doctors.map((d) => (
              <tr
                key={d.doctorProfileId}
                className={`border-t border-[var(--atm-linea)] ${!d.assignable ? "opacity-50" : "hover:bg-[var(--atm-fondo)]"}`}
              >
                <td className="px-4 py-2.5 text-zinc-800">
                  {d.fullName}
                  {!d.assignable && " (inactivo)"}
                </td>
                <td className="px-4 py-2.5 text-zinc-500">{d.professionalCode ?? "—"}</td>
                <td className="px-4 py-2.5 text-zinc-600">{d.assignedCases}</td>
                <td className="px-4 py-2.5 text-zinc-600">{d.classification.PENDING_REVIEW}</td>
                <td className="px-4 py-2.5 text-zinc-600">{d.classification.HOLD || "—"}</td>
                <td className="px-4 py-2.5">
                  <input
                    type="number"
                    min={0}
                    max={disponible}
                    disabled={!d.assignable || !ctx.assignable || disponible === 0}
                    value={cant[d.doctorProfileId] ?? ""}
                    onChange={(e) => {
                      const bruto = Math.max(0, Math.floor(Number(e.target.value) || 0));
                      setPreview(null);
                      setCant((c) => {
                        const otros = Object.entries(c).reduce(
                          (s, [k, v]) => (k === d.doctorProfileId ? s : s + (v || 0)),
                          0,
                        );
                        const tope = Math.max(0, disponible - otros);
                        return { ...c, [d.doctorProfileId]: Math.min(bruto, tope) };
                      });
                    }}
                    className="w-20 rounded-lg border border-[var(--atm-linea)] px-2 py-1 text-sm outline-none focus:border-[var(--atm-azul2)] disabled:bg-zinc-50"
                  />
                </td>
                {preview && (
                  <td className="px-4 py-2.5 font-medium text-zinc-700">
                    {proyeccion(d.doctorProfileId)?.projectedLoad ?? d.assignedCases}
                  </td>
                )}
              </tr>
            ))}
          </Tabla>

          {preview && !preview.valid && (
            <ul className="space-y-1 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-[var(--atm-mal)]">
              {preview.problems.map((p, i) => (
                <li key={i}>· {p.statement}</li>
              ))}
            </ul>
          )}
          {preview?.valid && (
            <Aviso ok>
              Plan válido: {preview.requestedCases} caso(s) a repartir, quedan {preview.remainingCases} sin asignar.
            </Aviso>
          )}
          {msg && <Aviso ok={msg.ok}>{msg.texto}</Aviso>}

          <div className="flex gap-2">
            {/* Ambos llaman al backend: el botón lo dice mientras tanto, y se
                bloquea para que no se mande dos veces la misma distribución. */}
            <Btn variante="ghost" onClick={previsualizar} disabled={busy || totalPedido === 0 || !ctx.assignable}>
              {busy ? "Calculando…" : "Previsualizar"}
            </Btn>
            <Btn onClick={confirmar} disabled={busy || !preview?.valid}>
              {busy ? "Asignando…" : "Confirmar distribución"}
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}
