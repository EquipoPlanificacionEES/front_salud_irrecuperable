"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import { useSesion } from "@/components/SesionProvider";

// TSI-303 — firma del médico contra el backend real:
//   GET /api/v1/doctors/me/signature   → estado (hay firma, versión, tamaño)
//   PUT /api/v1/doctors/me/signature   → sube el PNG/JPG como cuerpo BINARIO (sin multipart)
//
// El backend NO devuelve los bytes de la firma vigente (por diseño: "una firma no
// es un asset público"). Para que el médico igual la VEA, guardamos la última
// imagen que subió en localStorage de este navegador y la mostramos aquí.
// Vista completa entre dispositivos requiere un endpoint nuevo en el backend
// (p. ej. GET /api/v1/doctors/me/signature/image que sirva los bytes al dueño).

interface Estado {
  hasActiveSignature: boolean;
  totalVersions: number;
  signature: {
    version: number;
    mimeType: string;
    width: number;
    height: number;
    fileSize: number;
    updatedAt: string;
  } | null;
}

export function MiFirma() {
  const { sesion } = useSesion();
  const cacheKey = `firma:${sesion.uid}`;
  const [estado, setEstado] = useState<Estado | null>(null);
  const [imagenLocal, setImagenLocal] = useState<string | null>(null);
  const [nueva, setNueva] = useState<{ dataUrl: string; file: File } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function cargar() {
    try {
      setEstado(await api<Estado>("/doctors/me/signature"));
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo cargar." });
    }
  }
  useEffect(() => {
    void cargar();
    try {
      setImagenLocal(localStorage.getItem(cacheKey));
    } catch {
      /* localStorage no disponible */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "image/png" && f.type !== "image/jpeg") {
      setMsg({ ok: false, texto: "La firma debe ser PNG o JPG." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setNueva({ dataUrl: reader.result as string, file: f });
      setMsg(null);
    };
    reader.readAsDataURL(f);
  }

  async function guardar() {
    if (!nueva) return;
    setGuardando(true);
    setMsg(null);
    try {
      await api("/doctors/me/signature", {
        method: "PUT",
        headers: { "Content-Type": nueva.file.type },
        body: nueva.file,
      });
      try {
        localStorage.setItem(cacheKey, nueva.dataUrl);
      } catch {
        /* sin persistencia local */
      }
      setImagenLocal(nueva.dataUrl);
      setNueva(null);
      if (input.current) input.current.value = "";
      setMsg({ ok: true, texto: "Firma guardada." });
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo guardar." });
    } finally {
      setGuardando(false);
    }
  }

  const s = estado?.signature;

  return (
    <div className="max-w-lg space-y-5">
      <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-5 shadow-sm">
        <p className="mb-2 text-sm text-zinc-500">Firma registrada</p>
        {estado?.hasActiveSignature && s ? (
          <div className="space-y-2">
            {imagenLocal ? (
              <img
                src={imagenLocal}
                alt="Firma vigente"
                className="max-h-28 rounded border border-[var(--atm-linea)] bg-white p-2"
              />
            ) : (
              <p className="text-xs text-zinc-400">
                Vista previa no disponible en este equipo (la subiste desde otro). Súbela de nuevo aquí para verla.
              </p>
            )}
            <p className="text-sm font-medium text-[var(--atm-ok)]">Firma vigente · versión {s.version}</p>
            <p className="text-xs text-zinc-500">
              {s.mimeType} · {s.width}×{s.height} · {(s.fileSize / 1024).toFixed(0)} KB · actualizada{" "}
              {new Date(s.updatedAt).toLocaleDateString("es-CL")}
              {estado.totalVersions > 1 && ` · ${estado.totalVersions} versiones`}
            </p>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Sin firma cargada. No podrás aprobar informes hasta subir una.</p>
        )}
      </div>

      <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-5 shadow-sm">
        <p className="mb-2 text-sm text-zinc-500">
          {estado?.hasActiveSignature ? "Reemplazar firma" : "Subir firma"} (PNG o JPG)
        </p>
        <input ref={input} type="file" accept="image/png,image/jpeg" onChange={elegir} className="text-sm" />
        {nueva && <img src={nueva.dataUrl} alt="Vista previa" className="mt-3 max-h-28 rounded border border-[var(--atm-linea)] bg-white p-2" />}
        {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-[var(--atm-ok)]" : "text-[var(--atm-mal)]"}`}>{msg.texto}</p>}
        <button
          onClick={guardar}
          disabled={!nueva || guardando}
          className="mt-4 rounded-lg bg-[var(--atm-azul)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--atm-azul2)] disabled:opacity-40"
        >
          {guardando ? "Guardando…" : "Guardar firma"}
        </button>
      </div>

      <p className="text-xs text-zinc-400">
        La firma se sube como imagen y el backend la versiona; se fusiona al informe final firmado.
      </p>
    </div>
  );
}
