"use client";

import { useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import { useInvalidar } from "@/lib/queries";
import { CASE_STATUS_LABEL, type OperationalCase } from "@/lib/backend";
import { Aviso, Btn, Campo, Chip, Input, Textarea } from "../ui";

/**
 * RECTIFICAR EL NÚMERO DE TRÁMITE DE UN EXPEDIENTE.
 *
 * Existe para que corregir un identificador equivocado NO sea una llamada a la
 * API desde Postman. Es una operación administrativa con consecuencias —puede
 * retirar otro expediente de la operación— y por eso tiene que ocurrir donde
 * queda registro de quién la hizo, con el motivo escrito delante.
 *
 * LA INTERFAZ NO ES LA AUTORIDAD. Todas las condiciones las vuelve a comprobar
 * el backend, y esta pantalla está preparada para que las rechace: lo que hace
 * es evitar que el administrador descubra un 409 después de haber escrito la
 * justificación, y traducir el rechazo a algo legible cuando llega.
 *
 * LA ABSORCIÓN NO SE ELIGE SOLA. Si el número de destino ya lo lleva otro
 * expediente, aquí se muestra cuál es y qué tiene, y hay que marcarlo
 * explícitamente. El formulario NUNCA manda `absorbCaseId` por su cuenta.
 */

type Modo = "RECTIFY_ID" | "REASSIGN_CASE";

/**
 * LOS DOS ERRORES, dichos como los entiende quien los corrige.
 *
 * La diferencia no es de matiz: decide si el identificador anterior queda
 * libre para el trámite que de verdad lo lleva. Elegir mal el modo A cuando
 * era B deja a un trámite real sin poder existir nunca.
 */
const MODOS: { valor: Modo; titulo: string; explicacion: string; consecuencia: string }[] = [
  {
    valor: "RECTIFY_ID",
    titulo: "El identificador anterior era incorrecto",
    explicacion: "No corresponde a ningún trámite real y deja de utilizarse.",
    consecuencia: "El identificador anterior queda ligado a este expediente como historia.",
  },
  {
    valor: "REASSIGN_CASE",
    titulo: "Los antecedentes pertenecen a otro trámite",
    explicacion:
      "El identificador anterior SÍ es un trámite real y sigue esperando su propio expediente.",
    consecuencia:
      "El identificador anterior QUEDARÁ DISPONIBLE para recibir su propio expediente.",
  },
];

/** El rechazo del backend, dicho en cristiano. La clave es `details[0].issue`. */
const RECHAZO: Record<string, string> = {
  TARGET_OCCUPIED:
    "Ese número ya lo lleva otro expediente activo. Para continuar hay que confirmar expresamente que se absorbe.",
  ABSORB_TARGET_MISMATCH:
    "El expediente que ocupa ese número no es el que se declaró. Vuelve a comprobar el destino.",
  ALREADY_SUPERSEDED: "Ese expediente ya había sido absorbido por otro.",
  CASE_APPROVED:
    "El expediente de destino tiene una aprobación médica. No se absorbe: eso retiraría un pronunciamiento.",
  CASE_SIGNED: "El expediente de destino tiene un informe firmado. No se absorbe.",
  CASE_SUPERSEDED: "Este expediente ya fue absorbido por otro: no puede rectificar su identificador.",
  ALREADY_CURRENT: "El expediente ya se identifica con ese número.",
  NO_ACTIVE_REFERENCE: "Este expediente no tiene un identificador vigente que corregir.",
  AMBIGUOUS_TARGET:
    "Ese número lo ocupan varios expedientes activos. Hay que resolver la ambigüedad antes de rectificar.",
  NO_CASE_TO_ABSORB: "Se marcó absorber, pero ningún expediente activo lleva ese número.",
  IDENTIFIER_MISMATCH: "El expediente de destino no se identifica con ese número.",
  REQUIRED: "Falta la justificación.",
};

function mensajeDeFallo(e: unknown): string {
  if (!(e instanceof ApiFallo)) return "No se pudo rectificar el identificador.";
  const issue = Array.isArray(e.details)
    ? (e.details[0] as { issue?: string } | undefined)?.issue
    : undefined;
  if (issue && RECHAZO[issue]) return RECHAZO[issue] as string;
  if (e.status === 403) return "Tu sesión no tiene permiso para rectificar identificadores.";
  // 404 también cubre el expediente de otro contrato, y a propósito: decir que
  // existe en otra organización ya sería contar de más.
  if (e.status === 404) return "Ese expediente no existe.";
  if (e.status === 400) return e.message || "El formulario no está completo.";
  return e.message || "No se pudo rectificar el identificador.";
}

interface Props {
  readonly caso: OperationalCase;
  readonly onCerrar: () => void;
  readonly onHecho: (texto: string) => void;
}

export function RectificarId({ caso, onCerrar, onHecho }: Props) {
  const [modo, setModo] = useState<Modo | null>(null);
  const [nuevoId, setNuevoId] = useState("");
  const [nota, setNota] = useState("");
  const [absorber, setAbsorber] = useState(false);
  const [ocupante, setOcupante] = useState<OperationalCase | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [buscado, setBuscado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidar = useInvalidar();

  const idValido = /^\d{5,}$/.test(nuevoId.trim());
  const notaValida = nota.trim().length >= 10;
  const destinoComprobado = buscado === nuevoId.trim();
  const faltaConfirmar = ocupante !== null && !absorber;
  const puedeEnviar =
    modo !== null &&
    idValido &&
    notaValida &&
    destinoComprobado &&
    !faltaConfirmar &&
    !enviando &&
    !buscando;

  /** Quién ocupa el número de destino. Se consulta ANTES de pedir nada más. */
  async function comprobarDestino() {
    const id = nuevoId.trim();
    if (!idValido) return;
    setBuscando(true);
    setError(null);
    setAbsorber(false);
    try {
      const r = await api<{ cases: OperationalCase[] }>(
        `/admin/cases?externalCaseId=${encodeURIComponent(id)}&limit=5`,
      );
      const otros = r.cases.filter((c) => c.caseId !== caso.caseId);
      setOcupante(otros[0] ?? null);
      setBuscado(id);
    } catch (e) {
      setError(mensajeDeFallo(e));
    } finally {
      setBuscando(false);
    }
  }

  async function enviar() {
    if (!puedeEnviar) return;
    setEnviando(true);
    setError(null);
    try {
      await api(`/admin/cases/${caso.caseId}/correct-identity`, {
        json: {
          mode: modo,
          targetExternalCaseId: nuevoId.trim(),
          note: nota.trim(),
          // Sólo va cuando el administrador lo confirmó marcándolo.
          ...(ocupante && absorber ? { absorbCaseId: ocupante.caseId } : {}),
        },
      });
      await invalidar.identificadorRectificado(caso.caseId);
      const liberado =
        modo === "REASSIGN_CASE"
          ? ` El identificador ${caso.externalCaseId} queda disponible para su propio expediente.`
          : "";
      onHecho(
        (ocupante && absorber
          ? `Identificador corregido a ${nuevoId.trim()}. El expediente ${ocupante.externalCaseId} quedó absorbido.`
          : `Identificador corregido a ${nuevoId.trim()}.`) + liberado,
      );
      onCerrar();
    } catch (e) {
      setError(mensajeDeFallo(e));
    } finally {
      setEnviando(false);
    }
  }

  const firmado = caso.report?.signedAt !== null && caso.report?.signedAt !== undefined;

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-[var(--atm-linea)] bg-[var(--atm-fondo)] p-3">
      <div className="text-xs text-zinc-600">
        <p className="font-medium text-zinc-800">Corregir identificador de trámite</p>
        <p className="mt-1">
          El número actual <span className="font-mono">{caso.externalCaseId}</span> se conserva como
          histórico y no se reescribe: es el que consta en los informes ya emitidos. El nuevo pasa a
          ser el vigente.
          {firmado
            ? " Este expediente está firmado: el documento, su contenido y su firma no se tocan."
            : ""}
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-zinc-600">Tipo de corrección</legend>
        {MODOS.map((m) => (
          <label
            key={m.valor}
            className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs ${
              modo === m.valor
                ? "border-[var(--atm-azul)] bg-white"
                : "border-[var(--atm-linea)] bg-white/60"
            }`}
          >
            <input
              type="radio"
              name="modo-correccion"
              className="mt-0.5"
              value={m.valor}
              checked={modo === m.valor}
              onChange={() => setModo(m.valor)}
            />
            <span>
              <span className="block font-medium text-zinc-800">{m.titulo}</span>
              <span className="block text-zinc-600">{m.explicacion}</span>
              <span
                className={`mt-1 block ${
                  m.valor === "REASSIGN_CASE" ? "font-medium text-amber-800" : "text-zinc-500"
                }`}
              >
                {m.consecuencia}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Identificador actual">
          <Input value={caso.externalCaseId} readOnly disabled className="w-full font-mono" />
        </Campo>
        <Campo label="Identificador nuevo" hint="Número de trámite, 5 dígitos o más.">
          <div className="flex gap-2">
            <Input
              className="w-full font-mono"
              inputMode="numeric"
              placeholder="34218380"
              value={nuevoId}
              aria-label="Identificador nuevo"
              onChange={(e) => {
                setNuevoId(e.target.value);
                setOcupante(null);
                setBuscado(null);
                setAbsorber(false);
              }}
            />
            <Btn
              variante="neutral"
              className="whitespace-nowrap px-2.5 py-1 text-xs"
              disabled={!idValido || buscando}
              onClick={comprobarDestino}
            >
              {buscando ? "Comprobando…" : "Comprobar"}
            </Btn>
          </div>
        </Campo>
      </div>

      <Campo
        label="Justificación"
        hint="Obligatoria. Es lo que habrá que releer si la rectificación se cuestiona."
      >
        <Textarea
          rows={3}
          className="w-full text-xs"
          aria-label="Justificación"
          placeholder="Contraparte confirma que los antecedentes procesados bajo el identificador anterior corresponden a este trámite…"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
      </Campo>

      {destinoComprobado && ocupante === null && (
        <Aviso ok>Ese identificador está libre. No se absorbe ningún expediente.</Aviso>
      )}

      {ocupante && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs">
          <p className="font-medium text-amber-900">Existe un caso con este ID</p>
          <div className="flex flex-wrap items-center gap-2 text-amber-900">
            <span className="font-mono">{ocupante.externalCaseId}</span>
            <Chip>{CASE_STATUS_LABEL[ocupante.status] ?? ocupante.status}</Chip>
            <span>Retención: {ocupante.hold ? "sí" : "no"}</span>
            <span>
              Aprobado:{" "}
              {ocupante.report && ocupante.report.workflowStatus !== "READY_FOR_REVIEW" &&
              ocupante.report.workflowStatus !== "CHANGES_REQUESTED"
                ? "sí"
                : "no"}
            </span>
            <span>Firmado: {ocupante.report?.signedAt ? "sí" : "no"}</span>
          </div>
          <p className="text-amber-800">
            Absorberlo lo retira de la operación. No se borra: conserva su documento, su ingesta, su
            auditoría y sus retenciones, que se resuelven en el mismo acto.
          </p>
          <label className="flex items-start gap-2 text-amber-900">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={absorber}
              onChange={(e) => setAbsorber(e.target.checked)}
            />
            <span>
              Confirmo que este expediente debe quedar absorbido por{" "}
              <span className="font-mono">{caso.externalCaseId}</span>
            </span>
          </label>
        </div>
      )}

      {error && <Aviso ok={false}>{error}</Aviso>}

      <div className="flex flex-wrap items-center gap-2">
        <Btn variante="neutral" className="px-2.5 py-1 text-xs" onClick={onCerrar}>
          Cancelar
        </Btn>
        <Btn variante="primary" className="px-2.5 py-1 text-xs" disabled={!puedeEnviar} onClick={enviar}>
          {enviando ? "Corrigiendo…" : "Corregir identificador"}
        </Btn>
        {modo === null && (
          <span className="text-xs text-zinc-500">Elige primero el tipo de corrección.</span>
        )}
        {modo !== null && !destinoComprobado && idValido && (
          <span className="text-xs text-zinc-500">Comprueba el identificador de destino primero.</span>
        )}
        {faltaConfirmar && (
          <span className="text-xs text-amber-700">Confirma la absorción para continuar.</span>
        )}
      </div>
    </div>
  );
}
