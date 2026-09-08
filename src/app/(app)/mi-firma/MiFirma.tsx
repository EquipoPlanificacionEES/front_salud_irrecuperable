"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import { useInvalidar, useSignature } from "@/lib/queries";
import { useSesion } from "@/components/SesionProvider";

// GET /api/v1/doctors/me/signature   → estado (hay firma, versión, tamaño)
// PUT /api/v1/doctors/me/signature   → sube el PNG/JPG como cuerpo BINARIO
//
// El backend NO devuelve los bytes de la firma vigente (por diseño). Para que el
// médico igual la VEA, guardamos la última imagen que subió en este navegador.

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

export function MiFirma() {
  const { sesion } = useSesion();
  const cacheKey = `firma:${sesion.uid}`;
  const [imagenLocal, setImagenLocal] = useState<string | null>(null);
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

  useEffect(() => {
    // La IMAGEN de la firma sí se guarda en este navegador, y sólo aquí: el
    // backend no devuelve sus bytes por diseño. Va bajo una clave por usuario y
    // no es un dato clínico. El ESTADO de la firma viaja por la caché en
    // memoria, como todo lo demás.
    try {
      setImagenLocal(localStorage.getItem(cacheKey));
    } catch {
      /* sin localStorage */
    }
  }, [cacheKey]);

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
      try {
        localStorage.setItem(cacheKey, nueva.dataUrl);
      } catch {
        /* sin persistencia local */
      }
      setImagenLocal(nueva.dataUrl);
      cancelar();
      setMsg({ ok: true, texto: "Firma guardada." });
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo guardar." });
    } finally {
      setGuardando(false);
    }
  }

  const s = estado?.signature;
  const tieneFirma = !!estado?.hasActiveSignature && !!s;

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
              <div className="flex min-h-[110px] items-center justify-center rounded-lg border border-[var(--atm-linea)] bg-[var(--atm-fondo)] p-4">
                {imagenLocal ? (
                  <img src={imagenLocal} alt="Tu firma" className="max-h-24 w-auto" />
                ) : (
                  <p className="max-w-xs text-center text-xs text-zinc-400">
                    La subiste desde otro equipo, así que aquí no se puede previsualizar.
                    <br />
                    Vuelve a subirla en este navegador para verla.
                  </p>
                )}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-y-2 text-xs sm:grid-cols-3">
                <Dato titulo="Formato" valor={s.mimeType === "image/png" ? "PNG" : "JPG"} />
                <Dato titulo="Tamaño" valor={`${s.width}×${s.height} px · ${(s.fileSize / 1024).toFixed(0)} KB`} />
                <Dato titulo="Actualizada" valor={new Date(s.updatedAt).toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })} />
              </dl>
              {estado.totalVersions > 1 && (
                <p className="mt-3 text-xs text-zinc-400">
                  {estado.totalVersions} versiones guardadas. Las anteriores no se borran.
                </p>
              )}
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
              <p className="text-xs text-zinc-500">PNG o JPG · máximo {MAX_KB} KB · fondo transparente o blanco</p>
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
                <p className="mb-1.5 text-xs font-medium text-zinc-500">Así se verá en el informe</p>
                <div className="flex min-h-[100px] items-center justify-center rounded-lg border border-[var(--atm-linea)] bg-white p-4">
                  <img src={nueva.dataUrl} alt="Vista previa" className="max-h-24 w-auto" />
                </div>
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
