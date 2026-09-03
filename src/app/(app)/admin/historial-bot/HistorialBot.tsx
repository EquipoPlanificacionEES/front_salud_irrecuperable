"use client";

import { useEffect, useState } from "react";

interface Corrida {
  id: number;
  run: number;
  region: string | null;
  encontrados: number;
  descargados: number;
  errores: number;
  duracion_seg: number;
  usuario: string;
  creado_en: string;
  semanas: string;
}

// TSI-208 — historial de corridas del bot del propio admin.
export function HistorialBot() {
  const [rows, setRows] = useState<Corrida[]>([]);

  useEffect(() => {
    fetch("/api/bot/historial")
      .then((r) => r.json())
      .then((d) => setRows(d.ok ? d.corridas : []));
  }, []);

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--atm-th)] text-left text-white">
            <th className="px-3 py-2 font-medium">Fecha</th>
            <th className="px-3 py-2 font-medium">Run</th>
            <th className="px-3 py-2 font-medium">Región</th>
            <th className="px-3 py-2 font-medium">Semanas</th>
            <th className="px-3 py-2 font-medium">Encontrados</th>
            <th className="px-3 py-2 font-medium">Descargados</th>
            <th className="px-3 py-2 font-medium">Errores</th>
            <th className="px-3 py-2 font-medium">Duración</th>
            <th className="px-3 py-2 font-medium">Usuario</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-t border-[var(--atm-linea)]">
              <td className="px-3 py-2 whitespace-nowrap text-zinc-600">{c.creado_en}</td>
              <td className="px-3 py-2 font-mono">#{c.run}</td>
              <td className="px-3 py-2">{c.region ?? "Nacional"}</td>
              <td className="px-3 py-2 text-zinc-600">{c.semanas || "—"}</td>
              <td className="px-3 py-2">{c.encontrados}</td>
              <td className="px-3 py-2">{c.descargados}</td>
              <td className={`px-3 py-2 ${c.errores ? "text-[var(--atm-mal)]" : ""}`}>{c.errores}</td>
              <td className="px-3 py-2 text-zinc-600">{c.duracion_seg}s</td>
              <td className="px-3 py-2 text-zinc-600">{c.usuario}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="px-3 py-10 text-center text-zinc-400">
                Sin corridas todavía. Envía expedientes al bot desde “Carga y envío al bot”.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
