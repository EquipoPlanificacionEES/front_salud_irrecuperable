"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiFallo } from "@/lib/api";
import type { BatchListItem } from "@/lib/backend";

// GET/POST /api/v1/admin/batches · POST /api/v1/admin/batches/:id/close|reopen

export function Semanas() {
  const [items, setItems] = useState<BatchListItem[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const d = await api<{ batches: BatchListItem[] }>("/admin/batches?limit=200");
      setItems([...d.batches].sort((a, b) => (b.batch.sequence ?? 0) - (a.batch.sequence ?? 0)));
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo cargar." });
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function crear() {
    if (!nombre.trim()) return;
    setMsg(null);
    try {
      const r = await api<{ created: boolean }>("/admin/batches", { json: { name: nombre.trim() } });
      setMsg({ ok: true, texto: r.created ? "Semana creada." : "Esa semana ya existía." });
      setNombre("");
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "Error al crear." });
    }
  }

  async function alternar(id: string, status: string) {
    setMsg(null);
    try {
      await api(`/admin/batches/${id}/${status === "OPEN" ? "close" : "reopen"}`, { method: "POST" });
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "Error." });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="rounded-lg border border-[var(--atm-linea)] px-3 py-2 text-sm outline-none focus:border-[var(--atm-azul2)]"
          placeholder='Nombre de la semana (ej. "Semana 6")'
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && crear()}
        />
        <button onClick={crear} className="rounded-lg bg-[var(--atm-azul)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--atm-azul2)]">
          Crear semana
        </button>
      </div>

      {msg && <p className={`text-sm ${msg.ok ? "text-[var(--atm-ok)]" : "text-[var(--atm-mal)]"}`}>{msg.texto}</p>}

      <div className="overflow-x-auto rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--atm-th)] text-left text-white">
              <th className="px-4 py-2 font-medium">Semana</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Casos</th>
              <th className="px-4 py-2 font-medium">Sin asignar</th>
              <th className="px-4 py-2 font-medium">En revisión</th>
              <th className="px-4 py-2 font-medium">Firmados</th>
              <th className="px-4 py-2 font-medium">Origen</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-zinc-400">Cargando…</td></tr>
            )}
            {!cargando && items.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-zinc-400">Sin semanas. Crea la primera.</td></tr>
            )}
            {items.map(({ batch, summary }) => (
              <tr key={batch.id} className="border-t border-[var(--atm-linea)]">
                <td className="px-4 py-2 font-medium">{batch.name}</td>
                <td className="px-4 py-2">
                  <span className={batch.status === "OPEN" ? "text-[var(--atm-ok)]" : "text-zinc-400"}>
                    {batch.status === "OPEN" ? "abierta" : "cerrada"}
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-600">{summary.totalCases}</td>
                <td className="px-4 py-2 text-zinc-600">{summary.unassignedCases}</td>
                <td className="px-4 py-2 text-zinc-600">{summary.readyForReview + summary.changesRequested}</td>
                <td className="px-4 py-2 text-zinc-600">{summary.signed}</td>
                <td className="px-4 py-2 text-zinc-500">{batch.source === "MANUAL" ? "manual" : "bot"}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <Link
                    href={`/admin/asignaciones?semana=${batch.id}`}
                    className="rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs font-medium text-[var(--atm-azul)] hover:bg-blue-50"
                  >
                    Asignar
                  </Link>
                  <button
                    onClick={() => alternar(batch.id, batch.status)}
                    className="ml-1 rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs text-zinc-600"
                  >
                    {batch.status === "OPEN" ? "Cerrar" : "Reabrir"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
