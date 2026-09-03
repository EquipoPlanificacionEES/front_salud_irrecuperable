"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

// TSI-301 — Bandeja "Mis trámites" (solo médico): Pendientes / Histórico / Devueltos.
// Cada caso: Nº de caso (id interno) + Nº de búsqueda (id_tramite, el que usan los doctores).

type Pestaña = "pendientes" | "historico" | "devueltos";

interface Caso {
  id: number;
  id_tramite: string;
  solicitante: string;
  estado: string;
  estado_documento: string | null;
  devolucion_motivo: string | null;
  calificacion_final: string | null;
}

const QUERY: Record<Pestaña, string> = {
  pendientes: "flujo=EN_REVISION",
  historico: "flujo=COMPLETADO",
  devueltos: "estado=DEVUELTO_MEDICO",
};

export function Bandeja() {
  const [tab, setTab] = useState<Pestaña>("pendientes");
  const [casos, setCasos] = useState<Caso[]>([]);
  const [cargando, setCargando] = useState(false);
  const [buscar, setBuscar] = useState("");

  useEffect(() => {
    setCargando(true);
    fetch(`/api/casos?${QUERY[tab]}`)
      .then((r) => r.json())
      .then((d) => setCasos(d.ok ? d.casos : []))
      .finally(() => setCargando(false));
  }, [tab]);

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return casos;
    return casos.filter(
      (c) =>
        c.id_tramite.toLowerCase().includes(q) ||
        String(c.id).includes(q) ||
        c.solicitante.toLowerCase().includes(q),
    );
  }, [casos, buscar]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["pendientes", "historico", "devueltos"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setTab(p)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${
              tab === p
                ? "bg-[var(--atm-azul)] text-white"
                : "border border-[var(--atm-linea)] bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {p}
          </button>
        ))}
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar por Nº de búsqueda o solicitante"
          className="ml-auto w-64 rounded-lg border border-[var(--atm-linea)] px-3 py-1.5 text-sm outline-none focus:border-[var(--atm-azul2)]"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--atm-th)] text-left text-white">
              <th className="px-4 py-2 font-medium">Nº de caso</th>
              <th className="px-4 py-2 font-medium">Nº de búsqueda</th>
              <th className="px-4 py-2 font-medium">Solicitante</th>
              <th className="px-4 py-2 font-medium">
                {tab === "devueltos" ? "Motivo" : tab === "historico" ? "Resultado" : "Estado"}
              </th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {!cargando &&
              filtrados.map((c) => (
                <tr key={c.id} className="border-t border-[var(--atm-linea)] align-top">
                  <td className="px-4 py-2 font-mono text-zinc-500">{c.id}</td>
                  <td className="px-4 py-2 font-mono">{c.id_tramite}</td>
                  <td className="px-4 py-2">{c.solicitante}</td>
                  <td className="px-4 py-2 text-zinc-600">
                    {tab === "devueltos"
                      ? c.devolucion_motivo
                      : tab === "historico"
                        ? `${c.estado_documento ?? "—"}${c.calificacion_final ? ` · ${c.calificacion_final}` : ""}`
                        : "En revisión"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/mis-tramites/${c.id}`}
                      className="rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs font-medium text-[var(--atm-azul)] hover:bg-blue-50"
                    >
                      {tab === "pendientes" ? "Revisar" : "Ver"}
                    </Link>
                  </td>
                </tr>
              ))}
            {!cargando && filtrados.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-400">
                  Sin trámites {tab}.
                </td>
              </tr>
            )}
            {cargando && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-400">
                  Cargando…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
