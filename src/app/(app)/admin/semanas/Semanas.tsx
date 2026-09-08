"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { api, ApiFallo } from "@/lib/api";
import { useBatches, useInvalidar } from "@/lib/queries";
import { TablaSkeleton } from "@/components/Skeleton";
import { Aviso, Btn, Chip, FilaVacia, Input, Stat, Tabla, batchTono } from "../ui";

// GET/POST /api/v1/admin/batches · POST /api/v1/admin/batches/:id/close|reopen

export function Semanas() {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [nombre, setNombre] = useState("");
  const [busy, setBusy] = useState(false);

  // La MISMA consulta que usan casos, informes, asignaciones y el resumen.
  const { data, error: fallo, isPending } = useBatches();
  const invalidar = useInvalidar();
  const items = useMemo(
    () => (data ? [...data].sort((a, b) => (b.batch.sequence ?? 0) - (a.batch.sequence ?? 0)) : []),
    [data],
  );
  const errorCarga = fallo ? (fallo instanceof ApiFallo ? fallo.message : "No se pudo cargar.") : null;

  async function crear() {
    if (!nombre.trim() || busy) return;
    setMsg(null);
    setBusy(true);
    try {
      const r = await api<{ created: boolean }>("/admin/batches", { json: { name: nombre.trim() } });
      setMsg({ ok: true, texto: r.created ? "Semana creada." : "Esa semana ya existía." });
      setNombre("");
      await invalidar.lotesCambiados();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "Error al crear." });
    } finally {
      setBusy(false);
    }
  }

  async function alternar(id: string, status: string) {
    setMsg(null);
    try {
      await api(`/admin/batches/${id}/${status === "OPEN" ? "close" : "reopen"}`, { method: "POST" });
      await invalidar.lotesCambiados();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "Error." });
    }
  }

  const abiertas = items.filter((i) => i.batch.status === "OPEN").length;
  const sinAsignar = items.reduce((s, i) => s + i.summary.unassignedCases, 0);
  const casos = items.reduce((s, i) => s + i.summary.totalCases, 0);

  if (isPending) return <TablaSkeleton filas={4} columnas={5} />;

  return (
    <div className="space-y-5">
      {errorCarga && <Aviso ok={false}>{errorCarga}</Aviso>}
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Semanas" valor={items.length} />
          <Stat label="Abiertas" valor={abiertas} tono="ok" />
          <Stat label="Casos totales" valor={casos} />
          <Stat label="Casos sin asignar" valor={sinAsignar} tono={sinAsignar ? "obs" : "neutral"} />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--atm-linea)] bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-600">Abrir una semana a mano</span>
          <Input
            className="w-64"
            placeholder='ej. "Semana 6"'
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && crear()}
          />
        </label>
        <Btn onClick={crear} disabled={!nombre.trim() || busy}>
          {busy ? "Creando…" : "Crear semana"}
        </Btn>
      </div>

      {msg && <Aviso ok={msg.ok}>{msg.texto}</Aviso>}

      <Tabla columnas={["Semana", "Estado", "Origen", "Casos", "Sin asignar", "Por revisar", "Retenidos", "Firmados", ""]}>
        {items.length === 0 && <FilaVacia cols={9}>Sin semanas. Crea la primera.</FilaVacia>}
        {items.map(({ batch, summary }) => (
          <tr key={batch.id} className="border-t border-[var(--atm-linea)] hover:bg-[var(--atm-fondo)]">
            <td className="px-4 py-2.5 font-medium text-zinc-800">{batch.name}</td>
            <td className="px-4 py-2.5">
              <Chip tono={batchTono(batch.status)}>{batch.status === "OPEN" ? "Abierta" : "Cerrada"}</Chip>
            </td>
            <td className="px-4 py-2.5 text-zinc-500">{batch.source === "MANUAL" ? "Manual" : "Bot"}</td>
            <td className="px-4 py-2.5 text-zinc-600">{summary.totalCases}</td>
            <td className="px-4 py-2.5 text-zinc-600">{summary.unassignedCases}</td>
            <td className="px-4 py-2.5 text-zinc-600">{summary.classification.PENDING_REVIEW}</td>
            <td className="px-4 py-2.5 text-zinc-600">{summary.classification.HOLD || "—"}</td>
            <td className="px-4 py-2.5 text-zinc-600">{summary.classification.SIGNED}</td>
            <td className="px-4 py-2.5 text-right whitespace-nowrap">
              <Link
                href={`/admin/asignaciones?semana=${batch.id}`}
                className="rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs font-medium text-[var(--atm-azul)] hover:bg-blue-50"
              >
                Asignar
              </Link>
              <button
                onClick={() => alternar(batch.id, batch.status)}
                className="ml-1 rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
              >
                {batch.status === "OPEN" ? "Cerrar" : "Reabrir"}
              </button>
            </td>
          </tr>
        ))}
      </Tabla>
    </div>
  );
}
