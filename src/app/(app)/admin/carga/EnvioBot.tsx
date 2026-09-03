"use client";

import { useEffect, useState } from "react";

interface SemanaProc {
  id: number;
  numero: number;
  codigo: string;
  habilitada: number;
  listos: number;
}

// TSI-206 — el admin elige entre las semanas ya llegadas (1..actual), empaqueta y envía al bot.
export function EnvioBot() {
  const [semanas, setSemanas] = useState<SemanaProc[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  async function cargar() {
    const r = await fetch("/api/bot/semanas");
    const d = await r.json();
    if (d.ok) setSemanas(d.semanas);
  }
  useEffect(() => {
    cargar();
  }, []);

  function toggle(n: number) {
    setSel((prev) => {
      const s = new Set(prev);
      s.has(n) ? s.delete(n) : s.add(n);
      return s;
    });
  }

  const habilitadas = semanas.filter((s) => s.habilitada === 1);
  const totalListos = habilitadas
    .filter((s) => sel.has(s.numero))
    .reduce((a, s) => a + s.listos, 0);

  async function enviar() {
    setEnviando(true);
    setMsg(null);
    try {
      const r = await fetch("/api/bot/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semanas: [...sel] }),
      });
      const d = await r.json();
      setMsg(
        d.ok
          ? {
              ok: true,
              texto: `Run #${d.run} — ${d.casosEnviados} expedientes (${d.documentosEnviados} docs) enviados a ${d.destino}. El informe ya está en la bandeja del médico.`,
            }
          : { ok: false, texto: d.error ?? "No se pudo enviar." },
      );
      setSel(new Set());
      await cargar();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Semanas del proceso: 1 a 11. Habilitadas para procesar: {habilitadas.map((s) => s.numero).join(", ") || "—"}.
      </p>

      <div className="flex flex-wrap gap-2">
        {semanas.map((s) => {
          const on = sel.has(s.numero);
          const disabled = s.habilitada !== 1;
          return (
            <button
              key={s.id}
              disabled={disabled}
              onClick={() => toggle(s.numero)}
              className={`rounded-lg border px-3 py-2 text-sm ${
                disabled
                  ? "cursor-not-allowed border-[var(--atm-linea)] bg-zinc-50 text-zinc-300"
                  : on
                    ? "border-[var(--atm-azul)] bg-[var(--atm-azul)] text-white"
                    : "border-[var(--atm-linea)] bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {s.codigo}
              <span className="ml-1 text-xs opacity-70">({s.listos})</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-zinc-600">
          {sel.size} semana(s) · {totalListos} expedientes listos
        </span>
        <button
          onClick={enviar}
          disabled={sel.size === 0 || totalListos === 0 || enviando}
          className="rounded-lg bg-[var(--atm-azul)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--atm-azul2)] disabled:opacity-40"
        >
          {enviando ? "Enviando al bot…" : "Empaquetar y enviar al bot"}
        </button>
      </div>

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

      <p className="text-xs text-zinc-400">
        El front arma el paquete (GET) y lo reenvía al bot (POST a <code>BOT_URL</code>; si no está
        configurada, se simula y el informe se genera localmente). El bot crea Case + CaseDocument en
        PostgreSQL. Cada envío queda en el <strong>Historial BOT</strong>.
      </p>
    </div>
  );
}
