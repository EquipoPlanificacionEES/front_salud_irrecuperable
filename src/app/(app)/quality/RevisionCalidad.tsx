"use client";

import { useEffect, useState } from "react";

interface Caso {
  id: number;
  id_tramite: string;
  solicitante: string;
  estado: string;
  semana: string;
  devolucion_motivo: string | null;
}

// Control de calidad: revisa expedientes y puede devolverlos al médico con un motivo.
// Uso esporádico. POST /api/quality/devolver.
export function RevisionCalidad() {
  const [casos, setCasos] = useState<Caso[]>([]);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  async function cargar() {
    const r = await fetch("/api/casos");
    const d = await r.json();
    if (d.ok) setCasos(d.casos);
  }
  useEffect(() => {
    cargar();
  }, []);

  async function devolver(casoId: number) {
    setEnviando(true);
    setMsg(null);
    try {
      const r = await fetch("/api/quality/devolver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ casoId, motivo }),
      });
      const d = await r.json();
      if (d.ok) {
        setMsg({ ok: true, texto: `Caso ${d.idTramite} devuelto al médico.` });
        setAbierto(null);
        setMotivo("");
        await cargar();
      } else {
        setMsg({ ok: false, texto: d.error ?? "No se pudo devolver." });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            msg.ok
              ? "border-green-200 bg-green-50 text-[var(--atm-ok)]"
              : "border-red-200 bg-red-50 text-[var(--atm-mal)]"
          }`}
        >
          {msg.texto}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--atm-th)] text-left text-white">
              <th className="px-4 py-2 font-medium">Trámite</th>
              <th className="px-4 py-2 font-medium">Solicitante</th>
              <th className="px-4 py-2 font-medium">Semana</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {casos.map((c) => {
              const devuelto = c.estado === "DEVUELTO_MEDICO";
              return (
                <tr key={c.id} className="border-t border-[var(--atm-linea)] align-top">
                  <td className="px-4 py-2 font-mono">{c.id_tramite}</td>
                  <td className="px-4 py-2">{c.solicitante}</td>
                  <td className="px-4 py-2 text-zinc-600">{c.semana}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        devuelto
                          ? "bg-orange-100 text-[var(--atm-obs)]"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {c.estado}
                    </span>
                    {devuelto && c.devolucion_motivo && (
                      <p className="mt-1 max-w-xs text-xs text-zinc-500">{c.devolucion_motivo}</p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!devuelto && abierto !== c.id && (
                      <button
                        onClick={() => {
                          setAbierto(c.id);
                          setMotivo("");
                          setMsg(null);
                        }}
                        className="rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs font-medium text-[var(--atm-azul)] hover:bg-blue-50"
                      >
                        Devolver al médico
                      </button>
                    )}
                    {abierto === c.id && (
                      <div className="w-64 space-y-2 text-left">
                        <textarea
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          rows={3}
                          placeholder="Motivo de la devolución (mín. 10 caracteres)"
                          className="w-full rounded-lg border border-[var(--atm-linea)] p-2 text-xs outline-none focus:border-[var(--atm-azul2)]"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => devolver(c.id)}
                            disabled={enviando || motivo.trim().length < 10}
                            className="rounded-lg bg-[var(--atm-azul)] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => setAbierto(null)}
                            className="rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs text-zinc-600"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {casos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                  Sin casos. Cargá una semana desde Administración.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
