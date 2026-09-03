"use client";

import { useEffect, useRef, useState } from "react";

// TSI-303 — subir una imagen (PNG/JPG) de la firma y enviarla al backend.
export function MiFirma() {
  const [firma, setFirma] = useState<string | null>(null);
  const [nueva, setNueva] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/mi-firma")
      .then((r) => r.json())
      .then((d) => d.ok && setFirma(d.firma));
  }, []);

  function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "image/png" && f.type !== "image/jpeg") {
      setMsg({ ok: false, texto: "La firma debe ser PNG o JPG." });
      return;
    }
    if (f.size > 500_000) {
      setMsg({ ok: false, texto: "La imagen es demasiado grande (máx. ~370 KB)." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setNueva(reader.result as string);
      setMsg(null);
    };
    reader.readAsDataURL(f);
  }

  async function guardar() {
    if (!nueva) return;
    setGuardando(true);
    try {
      const r = await fetch("/api/mi-firma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firma: nueva }),
      });
      const d = await r.json();
      if (d.ok) {
        setFirma(nueva);
        setNueva(null);
        if (input.current) input.current.value = "";
        setMsg({ ok: true, texto: "Firma guardada." });
      } else {
        setMsg({ ok: false, texto: d.error ?? "No se pudo guardar." });
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="max-w-lg space-y-5">
      <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-5 shadow-sm">
        <p className="mb-2 text-sm text-zinc-500">Firma actual</p>
        {firma ? (
          <img src={firma} alt="Firma" className="max-h-28 border border-[var(--atm-linea)] bg-white p-2" />
        ) : (
          <p className="text-sm text-zinc-400">Sin firma cargada.</p>
        )}
      </div>

      <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-5 shadow-sm">
        <p className="mb-2 text-sm text-zinc-500">Nueva firma (PNG o JPG)</p>
        <input ref={input} type="file" accept="image/png,image/jpeg" onChange={elegir} className="text-sm" />
        {nueva && (
          <img src={nueva} alt="Vista previa" className="mt-3 max-h-28 border border-[var(--atm-linea)] bg-white p-2" />
        )}
        {msg && (
          <p className={`mt-3 text-sm ${msg.ok ? "text-[var(--atm-ok)]" : "text-[var(--atm-mal)]"}`}>
            {msg.texto}
          </p>
        )}
        <button
          onClick={guardar}
          disabled={!nueva || guardando}
          className="mt-4 rounded-lg bg-[var(--atm-azul)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--atm-azul2)] disabled:opacity-40"
        >
          {guardando ? "Guardando…" : "Guardar firma"}
        </button>
      </div>

      <p className="text-xs text-zinc-400">
        La firma se adjunta a cada ratificación/modificación de caso y se envía al backend, que la
        fusiona al archivo final.
      </p>
    </div>
  );
}
