"use client";

import { useEffect, useState } from "react";

// Bandeja de carga del administrador: elige una semana habilitada y registra los expedientes (TSI-206).

interface Semana {
  id: number;
  codigo: string;
  desde: string;
  hasta: string;
  habilitada: number;
  cargada_en: string | null;
  casos: number;
}

interface Resultado {
  ok: boolean;
  error?: string;
  semana?: string;
  casosCreados?: number;
  documentosCreados?: number;
}

export function Carga() {
  const [semanas, setSemanas] = useState<Semana[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);

  async function refrescar() {
    const r = await fetch("/api/semanas");
    const d = await r.json();
    if (d.ok) setSemanas(d.semanas);
  }

  useEffect(() => {
    refrescar();
  }, []);

  async function cargar() {
    if (sel == null) return;
    setCargando(true);
    setRes(null);
    try {
      const r = await fetch("/api/carga", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semanaId: sel }),
      });
      setRes(await r.json());
      await refrescar();
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--atm-th)] text-left text-white">
              <th className="w-10 px-4 py-2"></th>
              <th className="px-4 py-2 font-medium">Semana</th>
              <th className="px-4 py-2 font-medium">Rango</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Expedientes</th>
            </tr>
          </thead>
          <tbody>
            {semanas.map((s) => {
              const disponible = s.habilitada === 1;
              return (
                <tr key={s.id} className="border-t border-[var(--atm-linea)]">
                  <td className="px-4 py-2">
                    <input
                      type="radio"
                      name="semana"
                      disabled={!disponible}
                      checked={sel === s.id}
                      onChange={() => setSel(s.id)}
                    />
                  </td>
                  <td className="px-4 py-2 font-mono">{s.codigo}</td>
                  <td className="px-4 py-2 text-zinc-600">
                    {s.desde} → {s.hasta}
                  </td>
                  <td className="px-4 py-2">
                    {s.cargada_en ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-[var(--atm-ok)]">
                        cargada
                      </span>
                    ) : disponible ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-[var(--atm-azul)]">
                        habilitada
                      </span>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                        no disponible
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-zinc-600">{s.casos}</td>
                </tr>
              );
            })}
            {semanas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                  Sin semanas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        onClick={cargar}
        disabled={sel == null || cargando}
        className="rounded-lg bg-[var(--atm-azul)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--atm-azul2)] disabled:opacity-40"
      >
        {cargando ? "Cargando expedientes…" : "Cargar expedientes de la semana"}
      </button>

      {res && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            res.ok
              ? "border-green-200 bg-green-50 text-[var(--atm-ok)]"
              : "border-red-200 bg-red-50 text-[var(--atm-mal)]"
          }`}
        >
          {res.ok
            ? `Semana ${res.semana}: ${res.casosCreados} expedientes y ${res.documentosCreados} documentos registrados.`
            : res.error}
        </div>
      )}

      <p className="text-xs text-zinc-400">
        Mock: simula la descarga del BOT creando <code>casos</code> (Case) y{" "}
        <code>caso_documentos</code> (CaseDocument). Con backend real lo hará el bot en PostgreSQL.
      </p>
    </div>
  );
}
