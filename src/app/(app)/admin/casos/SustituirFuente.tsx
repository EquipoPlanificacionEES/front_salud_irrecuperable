"use client";

import { useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import { useInvalidar } from "@/lib/queries";
import type { OperationalCase } from "@/lib/backend";
import { Aviso, Btn, Campo, Textarea } from "../ui";

/**
 * SUSTITUIR EL EXPEDIENTE FUENTE DE UN CASO.
 *
 * La contraparte manda a veces el expediente de otra persona y después el
 * corregido. Antes había que meterlo por la ingesta del bot, que pisa los
 * bytes del anterior; el documento contaminado es la prueba de por qué hubo
 * una incidencia, y perderlo la deja sin sustento.
 *
 * Aquí el corregido entra estrenando su propia clave y el anterior deja de ser
 * evidencia sin desaparecer. Esta pantalla existe para que eso no sea una
 * llamada a la API con la sesión pegada a mano.
 *
 * LA INTERFAZ NO ES LA AUTORIDAD: el servidor vuelve a comprobarlo todo —que
 * sea un PDF, que no sea idéntico al de otro caso, que el expediente no esté
 * firmado— y esta pantalla traduce el rechazo a algo legible.
 */

const RECHAZO: Record<string, string> = {
  DUPLICATE_SOURCE_DOCUMENT:
    "Ese expediente es idéntico al de otro trámite. No se acepta: es justo la señal que levanta las incidencias.",
  UNCHANGED_SOURCE: "Ese expediente es idéntico al que ya está vigente en este caso.",
  CASE_APPROVED: "Este expediente tiene una aprobación médica: su fuente no se sustituye.",
  CASE_SIGNED: "Este expediente está firmado: su fuente no se sustituye.",
  CASE_SUPERSEDED: "Este expediente fue absorbido por otro.",
  NOT_A_PDF: "El archivo no es un PDF.",
  EMPTY: "El archivo está vacío.",
  ALREADY_RESOLVED: "Esa incidencia ya estaba resuelta.",
  STORAGE_CHECKSUM_MISMATCH: "Los bytes guardados no coinciden con los enviados. No se registró nada.",
  REQUIRED: "Falta la justificación.",
};

function mensajeDeFallo(e: unknown): string {
  if (!(e instanceof ApiFallo)) return "No se pudo sustituir el expediente.";
  const issue = Array.isArray(e.details)
    ? (e.details[0] as { issue?: string } | undefined)?.issue
    : undefined;
  if (issue && RECHAZO[issue]) return RECHAZO[issue] as string;
  if (e.status === 403) return "Tu sesión no tiene permiso para sustituir expedientes.";
  if (e.status === 404) return "Ese expediente no existe.";
  if (e.status === 413) return "El expediente supera el tamaño máximo admitido.";
  return e.message || "No se pudo sustituir el expediente.";
}

interface Props {
  readonly caso: OperationalCase;
  readonly onCerrar: () => void;
  readonly onHecho: (texto: string) => void;
}

export function SustituirFuente({ caso, onCerrar, onHecho }: Props) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [nota, setNota] = useState("");
  const [resolverIncidencia, setResolverIncidencia] = useState(true);
  const [reprocesar, setReprocesar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidar = useInvalidar();

  const notaValida = nota.trim().length >= 10;
  const puedeEnviar = archivo !== null && notaValida && !enviando;
  const firmado = Boolean(caso.report?.signedAt);

  async function enviar() {
    if (!puedeEnviar || !archivo) return;
    setEnviando(true);
    setError(null);
    try {
      const cuerpo = new FormData();
      cuerpo.append("note", nota.trim());
      cuerpo.append("reprocess", reprocesar ? "true" : "false");
      // El id de la incidencia no lo compone el cliente: el backend lo valida
      // contra el caso, y si no es suya responde 404.
      if (resolverIncidencia && caso.hold?.holdId) cuerpo.append("resolveHoldId", caso.hold.holdId);
      cuerpo.append("file", archivo, archivo.name);

      const r = await api<{ newSha256: string; processingJobId: string | null }>(
        `/admin/cases/${caso.caseId}/source-document`,
        { method: "POST", body: cuerpo },
      );
      await invalidar.identificadorRectificado(caso.caseId);
      onHecho(
        `Expediente sustituido (sha256 ${r.newSha256.slice(0, 12)}…). ` +
          (r.processingJobId ? "Reprocesamiento encolado." : "Sin reprocesar."),
      );
      onCerrar();
    } catch (e) {
      setError(mensajeDeFallo(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-[var(--atm-linea)] bg-[var(--atm-fondo)] p-3">
      <div className="text-xs text-zinc-600">
        <p className="font-medium text-zinc-800">Sustituir el expediente fuente</p>
        <p className="mt-1">
          El expediente actual NO se borra: deja de ser evidencia y sigue descargable, porque es la
          prueba de por qué hubo una incidencia. El corregido pasa a ser la única fuente que lee la
          extracción.
        </p>
      </div>

      {firmado && (
        <Aviso ok={false}>
          Este expediente está firmado. El servidor rechazará la sustitución: un informe firmado no
          puede pasar a sostenerse sobre antecedentes que el médico no leyó.
        </Aviso>
      )}

      <Campo label="Expediente corregido (PDF)">
        <input
          type="file"
          accept="application/pdf"
          aria-label="Expediente corregido"
          className="w-full text-xs"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
        />
      </Campo>

      <Campo
        label="Justificación"
        hint="Obligatoria. Es lo que habrá que releer si la sustitución se cuestiona."
      >
        <Textarea
          rows={3}
          className="w-full text-xs"
          aria-label="Justificación de la sustitución"
          placeholder="Contraparte remite expediente corregido para este trámite…"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
      </Campo>

      <div className="space-y-1.5 text-xs text-zinc-700">
        {caso.hold && (
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={resolverIncidencia}
              onChange={(e) => setResolverIncidencia(e.target.checked)}
            />
            <span>
              Levantar la incidencia de este caso en el mismo acto. Se resuelve sólo si el
              expediente nuevo pasa todas las comprobaciones.
            </span>
          </label>
        )}
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={reprocesar}
            onChange={(e) => setReprocesar(e.target.checked)}
          />
          <span>
            Reprocesar con la fuente nueva. Vuelve a leer el expediente con el modelo: consume cuota.
          </span>
        </label>
      </div>

      {error && <Aviso ok={false}>{error}</Aviso>}

      <div className="flex flex-wrap items-center gap-2">
        <Btn variante="neutral" className="px-2.5 py-1 text-xs" onClick={onCerrar}>
          Cancelar
        </Btn>
        <Btn variante="primary" className="px-2.5 py-1 text-xs" disabled={!puedeEnviar} onClick={enviar}>
          {enviando ? "Subiendo…" : "Sustituir expediente"}
        </Btn>
        {archivo === null && <span className="text-xs text-zinc-500">Elige el PDF corregido.</span>}
      </div>
    </div>
  );
}
