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

/**
 * EL TOPE DEL ARCHIVO COMPLETO. La autoridad es el backend, que lo comprueba
 * al abrir la carga y otra vez sobre lo reensamblado; esto sólo evita que
 * alguien espere a subir 40 MB para enterarse.
 */
const MAX_BYTES = 25 * 1024 * 1024;

/** Lo calcula el servidor al abrir la carga; esto es sólo el valor por defecto. */
const CHUNK_POR_DEFECTO = 3 * 1024 * 1024;

function legible(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

/** sha256 del archivo, calculado en el navegador: es la prueba de integridad. */
async function sha256De(archivo: File): Promise<string> {
  const buf = await archivo.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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
  FILE_TOO_LARGE: "El expediente supera el máximo admitido.",
  SHA256_MISMATCH:
    "El expediente reensamblado no coincide con el original. No se sustituyó nada; vuelve a intentarlo.",
  SIZE_MISMATCH: "El tamaño reensamblado no coincide con el del archivo. No se sustituyó nada.",
  INCOMPLETE_UPLOAD: "Faltaron partes por subir. No se sustituyó nada; vuelve a intentarlo.",
  CHUNK_CONTENT_MISMATCH: "Una parte llegó con contenido distinto. Vuelve a empezar la subida.",
  UPLOAD_EXPIRED: "La subida caducó. Vuelve a intentarlo.",
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
  const [fase, setFase] = useState<"subiendo" | "validando" | null>(null);
  const [progreso, setProgreso] = useState(0);
  const invalidar = useInvalidar();

  const notaValida = nota.trim().length >= 10;
  const demasiadoGrande = archivo !== null && archivo.size > MAX_BYTES;
  const puedeEnviar = archivo !== null && !demasiadoGrande && notaValida && !enviando;
  const firmado = Boolean(caso.report?.signedAt);

  /**
   * SUBIDA POR PARTES, Y POR QUÉ.
   *
   * Esta pantalla habla con el backend a través de una función serverless que
   * rechaza cualquier petición de más de 4,5 MB. Los expedientes pesan más, y
   * comprimirlos no es una opción: el sha256 del archivo de la contraparte
   * tiene que sobrevivir intacto. Así que se parte aquí y se reensambla allí.
   *
   * El usuario no elige nada de esto: elige un PDF y pulsa un botón.
   */
  async function enviar() {
    if (!puedeEnviar || !archivo) return;
    setEnviando(true);
    setError(null);
    setProgreso(0);
    setFase("subiendo");
    try {
      const expectedSha256 = await sha256De(archivo);

      const sesion = await api<{ uploadId: string; chunkSize: number }>(
        `/admin/cases/${caso.caseId}/source-document/uploads`,
        {
          json: {
            fileName: archivo.name,
            expectedSize: archivo.size,
            expectedSha256,
          },
        },
      );
      const tam = sesion.chunkSize > 0 ? sesion.chunkSize : CHUNK_POR_DEFECTO;
      const total = Math.ceil(archivo.size / tam);

      for (let i = 0; i < total; i++) {
        const trozo = archivo.slice(i * tam, Math.min((i + 1) * tam, archivo.size));
        await api(
          `/admin/cases/${caso.caseId}/source-document/uploads/${sesion.uploadId}/chunks/${i}`,
          {
            method: "PUT",
            body: await trozo.arrayBuffer(),
            headers: { "Content-Type": "application/octet-stream" },
          },
        );
        setProgreso(Math.round(((i + 1) / total) * 100));
      }

      setFase("validando");
      const r = await api<{ newSha256: string; processingJobId: string | null }>(
        `/admin/cases/${caso.caseId}/source-document/uploads/${sesion.uploadId}/complete`,
        {
          json: {
            note: nota.trim(),
            reprocess: reprocesar,
            // El id de la incidencia no lo compone el cliente: el backend lo
            // valida contra el caso, y si no es suya responde 404.
            ...(resolverIncidencia && caso.hold?.holdId
              ? { resolveHoldId: caso.hold.holdId }
              : {}),
          },
        },
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
      setFase(null);
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

      <Campo label="Expediente corregido (PDF)" hint={`Tamaño máximo: ${legible(MAX_BYTES)}`}>
        <input
          type="file"
          accept="application/pdf"
          aria-label="Expediente corregido"
          className="w-full text-xs"
          disabled={enviando}
          onChange={(e) => {
            setArchivo(e.target.files?.[0] ?? null);
            setError(null);
          }}
        />
      </Campo>

      {archivo && (
        <p className="text-xs text-zinc-600">
          <span className="font-mono">{archivo.name}</span> · {legible(archivo.size)}
        </p>
      )}
      {demasiadoGrande && (
        <Aviso ok={false}>
          Ese archivo pesa {legible(archivo.size)} y el máximo son {legible(MAX_BYTES)}.
        </Aviso>
      )}

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

      {fase === "subiendo" && (
        <div className="space-y-1">
          <p className="text-xs text-zinc-600">Subiendo expediente… {progreso}%</p>
          <div className="h-1.5 w-full overflow-hidden rounded bg-zinc-200">
            <div
              className="h-full bg-[var(--atm-azul)] transition-all"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
      )}
      {fase === "validando" && (
        <p className="text-xs text-zinc-600">Validando expediente…</p>
      )}

      {error && <Aviso ok={false}>{error}</Aviso>}

      <div className="flex flex-wrap items-center gap-2">
        <Btn variante="neutral" className="px-2.5 py-1 text-xs" onClick={onCerrar}>
          Cancelar
        </Btn>
        <Btn variante="primary" className="px-2.5 py-1 text-xs" disabled={!puedeEnviar} onClick={enviar}>
          {enviando ? (fase === "validando" ? "Validando…" : "Subiendo…") : "Sustituir expediente"}
        </Btn>
        {archivo === null && <span className="text-xs text-zinc-500">Elige el PDF corregido.</span>}
      </div>
    </div>
  );
}
