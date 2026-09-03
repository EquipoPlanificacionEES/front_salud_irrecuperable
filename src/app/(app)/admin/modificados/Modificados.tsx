"use client";

import { useEffect, useState } from "react";

interface Caso {
  id: number;
  id_tramite: string;
  solicitante: string;
  semana: string;
  estado_documento: string | null;
  calificacion_final: string | null;
}

// Casos donde el médico MODIFICÓ la propuesta (fricción médico ↔ admin).
export function Modificados() {
  const [rows, setRows] = useState<Caso[]>([]);
  const [detalle, setDetalle] = useState<Record<number, unknown>>({});

  useEffect(() => {
    fetch("/api/casos?decision=MODIFICA")
      .then((r) => r.json())
      .then((d) => setRows(d.ok ? d.casos : []));
  }, []);

  async function verCampos(id: number) {
    if (detalle[id]) {
      setDetalle((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
      return;
    }
    const r = await fetch(`/api/casos/${id}`);
    const d = await r.json();
    if (d.ok) setDetalle((p) => ({ ...p, [id]: d.caso.resolucion?.campos_modificados ?? {} }));
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--atm-th)] text-left text-white">
            <th className="px-4 py-2 font-medium">Trámite</th>
            <th className="px-4 py-2 font-medium">Solicitante</th>
            <th className="px-4 py-2 font-medium">Semana</th>
            <th className="px-4 py-2 font-medium">Calificación final</th>
            <th className="px-4 py-2 font-medium">Campos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-t border-[var(--atm-linea)] align-top">
              <td className="px-4 py-2 font-mono">{c.id_tramite}</td>
              <td className="px-4 py-2">{c.solicitante}</td>
              <td className="px-4 py-2 text-zinc-600">{c.semana}</td>
              <td className="px-4 py-2">{c.calificacion_final ?? "—"}</td>
              <td className="px-4 py-2">
                <button
                  onClick={() => verCampos(c.id)}
                  className="rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs text-[var(--atm-azul)] hover:bg-blue-50"
                >
                  {detalle[c.id] ? "Ocultar" : "Ver campos"}
                </button>
                {detalle[c.id] != null && (
                  <pre className="mt-2 max-w-md overflow-auto rounded bg-zinc-50 p-2 text-xs text-zinc-700">
                    {JSON.stringify(detalle[c.id], null, 2)}
                  </pre>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-zinc-400">
                Ningún caso modificado todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
