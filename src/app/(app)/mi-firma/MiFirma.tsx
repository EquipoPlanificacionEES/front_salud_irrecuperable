"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import { useInvalidar, useSignature } from "@/lib/queries";

// GET /api/v1/doctors/me/signature          → estado (hay firma, versión, tamaño)
// GET /api/v1/doctors/me/signature/render   → la firma TAL COMO SE IMPRIME (PNG derivado)
// PUT /api/v1/doctors/me/signature          → sube el PNG/JPG como cuerpo BINARIO
//
// LA VISTA PREVIA ES LA DEL INFORME. La produce el worker con la misma función
// que usa al firmar —fondo quitado, recortada al trazo— y el backend la sirve
// sólo a su dueño. Esta pantalla no la recalcula ni la aproxima: si la dibujara
// el navegador, «así se verá» sería una promesa y no un hecho.
//
// Antes se guardaba en este navegador la imagen ORIGINAL subida, para poder
// verla. Ya no hace falta, y la rúbrica de una persona no tiene por qué quedar
// en el almacenamiento local: se limpia lo que hubiera.

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

const MAX_KB = 400;
const MAX_INTENTOS = 15;

/** Fondo de cuadros para que se vea qué parte es transparente. */
const CUADROS =
  "bg-[length:16px_16px] bg-[linear-gradient(45deg,#e4e4e7_25%,transparent_25%),linear-gradient(-45deg,#e4e4e7_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e4e4e7_75%),linear-gradient(-45deg,transparent_75%,#e4e4e7_75%)] bg-[position:0_0,0_8px,8px_-8px,-8px_0]";

type Impresa =
  | { estado: "cargando" }
  | { estado: "lista"; url: string }
  | { estado: "error"; texto: string };

/**
 * Pide la firma tal como se imprime. Mientras el worker la prepara el backend
 * responde 202 y se vuelve a preguntar; el objeto URL se libera al cambiar de
 * versión o al salir.
 */
export function useFirmaImpresa(version: number | null): Impresa | null {
  const [impresa, setImpresa] = useState<Impresa | null>(null);

  useEffect(() => {
    if (version === null) {
      setImpresa(null);
      return;
    }
    let vivo = true;
    let url: string | null = null;
    let espera: ReturnType<typeof setTimeout> | undefined;
    setImpresa({ estado: "cargando" });

    const pedir = async (intento: number) => {
      try {
        const res = await fetch("/api/v1/doctors/me/signature/render", { credentials: "same-origin", cache: "no-store" });
        if (!vivo) return;
        if (res.status === 202) {
          if (intento >= MAX_INTENTOS) {
            setImpresa({ estado: "error", texto: "La vista previa está tardando. Vuelve a entrar en un momento." });
            return;
          }
          const cuerpo = (await res.json().catch(() => null)) as { retryAfterSeconds?: number } | null;
          espera = setTimeout(() => void pedir(intento + 1), (cuerpo?.retryAfterSeconds ?? 2) * 1000);
          return;
        }
        if (!res.ok) {
          setImpresa({ estado: "error", texto: "No se pudo cargar la vista previa de tu firma." });
          return;
        }
        const blob = await res.blob();
        if (!vivo) return;
        url = URL.createObjectURL(blob);
        setImpresa({ estado: "lista", url });
      } catch {
        if (vivo) setImpresa({ estado: "error", texto: "No se pudo cargar la vista previa de tu firma." });
      }
    };
    void pedir(1);

    return () => {
      vivo = false;
      if (espera) clearTimeout(espera);
      if (url) URL.revokeObjectURL(url);
    };
  }, [version]);

  return impresa;
}

export function MiFirma() {
  const [nueva, setNueva] = useState<{ dataUrl: string; file: File } | null>(null);
  const [cambiando, setCambiando] = useState(false);
  const [arrastra, setArrastra] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const { data: estadoQuery, error: falloEstado } = useSignature<Estado>();
  const invalidar = useInvalidar();
  const estado = estadoQuery ?? null;
  const errorCarga = falloEstado
    ? falloEstado instanceof ApiFallo
      ? falloEstado.message
      : "No se pudo cargar el estado de tu firma."
    : null;
  const cargar = () => invalidar.firmaCambiada();

  const s = estado?.signature;
  const tieneFirma = !!estado?.hasActiveSignature && !!s;
  const impresa = useFirmaImpresa(tieneFirma && s ? s.version : null);

  useEffect(() => {
    // Limpieza de la copia local de la firma original que guardaban versiones
    // anteriores de esta pantalla.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith("firma:")) localStorage.removeItem(k);
      }
    } catch {
      /* sin localStorage */
    }
  }, []);

  function tomarArchivo(f: File | undefined) {
    if (!f) return;
    if (f.type !== "image/png" && f.type !== "image/jpeg") {
      setMsg({ ok: false, texto: "La firma debe ser una imagen PNG o JPG." });
      return;
    }
    if (f.size > MAX_KB * 1024) {
      setMsg({ ok: false, texto: `La imagen pesa ${(f.size / 1024).toFixed(0)} KB; el máximo es ${MAX_KB} KB.` });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setNueva({ dataUrl: reader.result as string, file: f });
      setMsg(null);
    };
    reader.readAsDataURL(f);
  }

  function cancelar() {
    setNueva(null);
    setCambiando(false);
    setMsg(null);
    if (input.current) input.current.value = "";
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
      cancelar();
      setMsg({ ok: true, texto: "Firma guardada. Abajo ves cómo se imprimirá." });
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo guardar." });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      {/* --- Firma vigente --- */}
      <div className="overflow-hidden rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--atm-linea)] px-5 py-3">
          <h3 className="text-sm font-semibold text-zinc-800">Firma vigente</h3>
          {tieneFirma ? (
            <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-[var(--atm-ok)]">
              Versión {s.version}
            </span>
          ) : (
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-[var(--atm-obs)]">
              Sin firma
            </span>
          )}
        </div>

        <div className="px-5 py-5">
          {tieneFirma ? (
            <>
              <p className="mb-1.5 text-xs font-medium text-zinc-500">Así se imprime en el informe</p>
              {impresa?.estado === "lista" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <figure className="flex min-h-[110px] flex-col items-center justify-center rounded-lg border border-[var(--atm-linea)] bg-white p-4">
                    <img src={impresa.url} alt="Tu firma tal como se imprime" className="max-h-24 w-auto" />
                    <figcaption className="mt-2 text-[11px] text-zinc-400">Sobre el papel del informe</figcaption>
                  </figure>
                  <figure className={`flex min-h-[110px] flex-col items-center justify-center rounded-lg border border-[var(--atm-linea)] p-4 ${CUADROS}`}>
                    <img src={impresa.url} alt="" aria-hidden className="max-h-24 w-auto" />
                    <figcaption className="mt-2 rounded bg-white/80 px-1 text-[11px] text-zinc-500">
                      Los cuadros son la parte transparente
                    </figcaption>
                  </figure>
                </div>
              ) : (
                <div className="flex min-h-[110px] items-center justify-center rounded-lg border border-[var(--atm-linea)] bg-[var(--atm-fondo)] p-4">
                  <p className="max-w-xs text-center text-xs text-zinc-400" role={impresa?.estado === "error" ? "alert" : undefined}>
                    {impresa?.estado === "error" ? impresa.texto : "Preparando la vista previa…"}
                  </p>
                </div>
              )}
              <dl className="mt-4 grid grid-cols-2 gap-y-2 text-xs sm:grid-cols-3">
                <Dato titulo="Archivo original" valor={s.mimeType === "image/png" ? "PNG" : "JPG"} />
                <Dato titulo="Tamaño" valor={`${s.width}×${s.height} px · ${(s.fileSize / 1024).toFixed(0)} KB`} />
                <Dato titulo="Actualizada" valor={new Date(s.updatedAt).toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })} />
              </dl>
              <p className="mt-3 text-xs text-zinc-400">
                Tu archivo original se guarda tal cual. Para el informe se usa una copia con el fondo
                transparente y recortada a la firma; el trazo no se modifica.
                {estado.totalVersions > 1 && ` ${estado.totalVersions} versiones guardadas; las anteriores no se borran.`}
              </p>
            </>
          ) : (
            <div className="flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--atm-linea)] bg-[var(--atm-fondo)] p-6 text-center">
              <p className="text-sm text-zinc-600">Todavía no has cargado tu firma.</p>
              <p className="text-xs text-zinc-400">La necesitas para poder ratificar informes.</p>
            </div>
          )}
        </div>

        {!cambiando && (
          <div className="border-t border-[var(--atm-linea)] px-5 py-3">
            <button
              onClick={() => { setCambiando(true); setMsg(null); }}
              className={
                tieneFirma
                  ? "rounded-lg border border-[var(--atm-azul2)] px-4 py-2 text-sm font-semibold text-[var(--atm-azul)] hover:bg-blue-50"
                  : "rounded-lg bg-[var(--atm-azul)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--atm-azul2)]"
              }
            >
              {tieneFirma ? "Cambiar firma" : "Subir firma"}
            </button>
          </div>
        )}
      </div>

      {/* --- Subir / reemplazar --- */}
      {cambiando && (
        <div className="overflow-hidden rounded-xl border border-[var(--atm-azul2)] bg-white shadow-sm">
          <div className="border-b border-[var(--atm-linea)] px-5 py-3">
            <h3 className="text-sm font-semibold text-zinc-800">
              {tieneFirma ? "Cambiar firma" : "Subir firma"}
            </h3>
          </div>

          <div className="space-y-4 px-5 py-5">
            <div
              onDragOver={(e) => { e.preventDefault(); setArrastra(true); }}
              onDragLeave={() => setArrastra(false)}
              onDrop={(e) => { e.preventDefault(); setArrastra(false); tomarArchivo(e.dataTransfer.files?.[0]); }}
              onClick={() => input.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-6 py-8 text-center transition ${
                arrastra ? "border-[var(--atm-azul2)] bg-blue-50" : "border-[var(--atm-linea)] bg-[var(--atm-fondo)] hover:border-[var(--atm-azul2)]"
              }`}
            >
              <p className="text-sm font-medium text-[var(--atm-azul)]">
                {nueva ? nueva.file.name : "Selecciona o arrastra tu firma"}
              </p>
              <p className="text-xs text-zinc-500">PNG o JPG · máximo {MAX_KB} KB · fondo claro y parejo</p>
              <input
                ref={input}
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => tomarArchivo(e.target.files?.[0])}
                className="hidden"
              />
            </div>

            {nueva && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-zinc-500">Archivo seleccionado (original)</p>
                <div className={`flex min-h-[100px] items-center justify-center rounded-lg border border-[var(--atm-linea)] p-4 ${CUADROS}`}>
                  <img src={nueva.dataUrl} alt="Archivo seleccionado" className="max-h-24 w-auto" />
                </div>
                <p className="mt-1.5 text-xs text-zinc-500">
                  Al guardarla se prepara la versión que se imprime —fondo transparente, recortada— y la verás
                  en «Firma vigente» antes de ratificar ningún informe.
                </p>
              </div>
            )}

            {errorCarga && !msg && (
              <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-[var(--atm-mal)]">{errorCarga}</p>
            )}
            {msg && (
              <p className={`text-sm ${msg.ok ? "text-[var(--atm-ok)]" : "text-[var(--atm-mal)]"}`}>{msg.texto}</p>
            )}

            <div className="flex gap-2">
              <button onClick={cancelar} className="rounded-lg border border-[var(--atm-linea)] px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={!nueva || guardando}
                className="rounded-lg bg-[var(--atm-azul)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--atm-azul2)] disabled:opacity-40"
              >
                {guardando ? "Guardando…" : "Guardar firma"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!cambiando && msg && (
        <p className={`text-sm ${msg.ok ? "text-[var(--atm-ok)]" : "text-[var(--atm-mal)]"}`}>{msg.texto}</p>
      )}

      <p className="text-xs text-zinc-400">
        Tu firma se adjunta al informe final cuando ratificas un caso. Cambiarla no altera los informes ya firmados.
      </p>
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-zinc-400">{titulo}</dt>
      <dd className="mt-0.5 text-zinc-700">{valor}</dd>
    </div>
  );
}
