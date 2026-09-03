"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FichaCaso } from "./FichaCaso";

// TSI-402 / TSI-302 / TSI-303 — Pantalla resultado (solo médico):
// ficha del caso + Ver PDF / Descargar DOCX + resolución (ratificar/modificar) con firma.

interface Detalle {
  id: number;
  id_tramite: string;
  solicitante: string;
  estado: string;
  estado_documento: string | null;
  estado_flujo: string | null;
  devolucion_motivo: string | null;
  informe: Record<string, unknown> | null;
  documentos: { tipo: string; nombre: string }[];
  resolucion: {
    decision: string;
    calificacion_final: string | null;
    campos_modificados: Record<string, unknown>;
    tiene_firma: boolean;
    creado_en: string;
  } | null;
}

const CAMPOS_EDITABLES = [
  { key: "diagnostico_principal", label: "Diagnóstico principal" },
  { key: "porcentaje_sugerido", label: "Porcentaje" },
  { key: "grado", label: "Grado" },
  { key: "origen", label: "Origen" },
];

export function PantallaResultado({ id }: { id: number }) {
  const router = useRouter();
  const [d, setD] = useState<Detalle | null>(null);
  const [decision, setDecision] = useState<"RATIFICA" | "MODIFICA">("RATIFICA");
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [calif, setCalif] = useState("");
  const [firmaGuardada, setFirmaGuardada] = useState<string | null>(null);
  const [usarGuardada, setUsarGuardada] = useState(true);
  const [firmaNueva, setFirmaNueva] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    const r = await fetch(`/api/casos/${id}`);
    const j = await r.json();
    if (j.ok) {
      setD(j.caso);
      const p = (j.caso.informe?.propuesta ?? {}) as Record<string, unknown>;
      const init: Record<string, string> = {};
      for (const c of CAMPOS_EDITABLES) init[c.key] = p[c.key] == null ? "" : String(p[c.key]);
      setCampos(init);
      setCalif(p.porcentaje_sugerido != null ? `${p.porcentaje_sugerido}%` : "");
    }
  }
  useEffect(() => {
    cargar();
    fetch("/api/mi-firma")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.firma) setFirmaGuardada(j.firma);
        else setUsarGuardada(false);
      });
  }, [id]);

  function onFirma(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "image/png" && f.type !== "image/jpeg") {
      setError("La firma debe ser PNG o JPG.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFirmaNueva(reader.result as string);
      setError(null);
    };
    reader.readAsDataURL(f);
  }

  async function enviar() {
    setEnviando(true);
    setError(null);
    const p = (d?.informe?.propuesta ?? {}) as Record<string, unknown>;
    const diff: Record<string, unknown> = {};
    if (decision === "MODIFICA") {
      for (const c of CAMPOS_EDITABLES) {
        if (String(p[c.key] ?? "") !== campos[c.key]) diff[c.key] = campos[c.key];
      }
    }
    const firmaPng = usarGuardada ? null : firmaNueva; // null => backend usa la firma guardada
    try {
      const r = await fetch(`/api/casos/${id}/resolver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          calificacionFinal:
            decision === "MODIFICA"
              ? calif
              : p.porcentaje_sugerido != null
                ? `${p.porcentaje_sugerido}%`
                : null,
          campos: diff,
          firmaPng,
        }),
      });
      const j = await r.json();
      if (!j.ok) {
        setError(j.error ?? "No se pudo enviar.");
        return;
      }
      await cargar();
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  if (!d) return <p className="text-sm text-zinc-400">Cargando…</p>;

  const enRevision = d.estado_flujo === "EN_REVISION";
  const firmaLista = usarGuardada ? !!firmaGuardada : !!firmaNueva;

  return (
    <div className="space-y-6">
      {d.devolucion_motivo && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-[var(--atm-obs)]">
          Devuelto por Control de calidad: {d.devolucion_motivo}
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-zinc-900">
            Informe generado
            <span className="ml-2 font-mono text-xs font-normal text-zinc-500">
              Nº caso {d.id} · Nº búsqueda {d.id_tramite}
            </span>
          </h3>
          <div className="flex gap-2">
            <a
              href={`/api/casos/${id}/informe?formato=pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-[var(--atm-linea)] px-3 py-1.5 text-sm font-medium text-[var(--atm-azul)] hover:bg-blue-50"
            >
              Ver PDF
            </a>
            <a
              href={`/api/casos/${id}/informe?formato=docx`}
              className="rounded-lg border border-[var(--atm-linea)] px-3 py-1.5 text-sm font-medium text-[var(--atm-azul)] hover:bg-blue-50"
            >
              Descargar DOCX
            </a>
          </div>
        </div>
        <FichaCaso informe={d.informe} />
      </div>

      {enRevision ? (
        <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-semibold text-zinc-900">Resolución del médico</h3>

          <div className="mb-4 flex gap-4 text-sm">
            {(["RATIFICA", "MODIFICA"] as const).map((op) => (
              <label key={op} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="decision"
                  checked={decision === op}
                  onChange={() => setDecision(op)}
                />
                {op === "RATIFICA" ? "Ratificar propuesta" : "Modificar propuesta"}
              </label>
            ))}
          </div>

          {decision === "MODIFICA" && (
            <div className="mb-4 space-y-3">
              {CAMPOS_EDITABLES.map((c) => (
                <div key={c.key} className="flex flex-col gap-1">
                  <label className="text-xs text-zinc-500">{c.label}</label>
                  <input
                    value={campos[c.key] ?? ""}
                    onChange={(e) => setCampos((p) => ({ ...p, [c.key]: e.target.value }))}
                    className="rounded-lg border border-[var(--atm-linea)] px-3 py-1.5 text-sm outline-none focus:border-[var(--atm-azul2)]"
                  />
                </div>
              ))}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Calificación final</label>
                <input
                  value={calif}
                  onChange={(e) => setCalif(e.target.value)}
                  className="rounded-lg border border-[var(--atm-linea)] px-3 py-1.5 text-sm outline-none focus:border-[var(--atm-azul2)]"
                />
              </div>
            </div>
          )}

          {/* TSI-303 — firma */}
          <div className="mb-4 space-y-2">
            <p className="text-xs text-zinc-500">Firma (PNG o JPG)</p>
            {firmaGuardada && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={usarGuardada}
                  onChange={(e) => setUsarGuardada(e.target.checked)}
                />
                Usar mi firma guardada
                <img src={firmaGuardada} alt="firma" className="h-8 border border-[var(--atm-linea)] bg-white" />
              </label>
            )}
            {!usarGuardada && (
              <div>
                <input type="file" accept="image/png,image/jpeg" onChange={onFirma} className="text-sm" />
                {firmaNueva && (
                  <img
                    src={firmaNueva}
                    alt="firma nueva"
                    className="mt-1 h-10 border border-[var(--atm-linea)] bg-white"
                  />
                )}
              </div>
            )}
          </div>

          {error && <p className="mb-3 text-sm text-[var(--atm-mal)]">{error}</p>}

          <button
            onClick={enviar}
            disabled={enviando || !firmaLista}
            className="rounded-lg bg-[var(--atm-azul)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--atm-azul2)] disabled:opacity-40"
          >
            {enviando
              ? "Enviando…"
              : decision === "RATIFICA"
                ? "Ratificar y enviar al backend"
                : "Modificar y enviar al backend"}
          </button>
          <p className="mt-2 text-xs text-zinc-400">
            Se envían al backend la decisión + la firma. El backend fusiona la firma al archivo y deja
            el caso como <strong>ratificado/completado</strong>.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-sm">
          <p className="font-semibold text-[var(--atm-ok)]">
            {d.estado_documento} · {d.estado_flujo}
          </p>
          {d.resolucion && (
            <ul className="mt-2 space-y-1 text-zinc-700">
              <li>Decisión: {d.resolucion.decision}</li>
              <li>Calificación final: {d.resolucion.calificacion_final ?? "—"}</li>
              <li>Firma: {d.resolucion.tiene_firma ? "adjunta ✓" : "—"}</li>
              {Object.keys(d.resolucion.campos_modificados ?? {}).length > 0 && (
                <li>
                  Campos modificados:{" "}
                  <code className="text-xs">{JSON.stringify(d.resolucion.campos_modificados)}</code>
                </li>
              )}
              <li className="text-xs text-zinc-500">{d.resolucion.creado_en}</li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
