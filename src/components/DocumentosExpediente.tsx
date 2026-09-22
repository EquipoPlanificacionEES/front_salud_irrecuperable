"use client";

import { useCaseDocuments } from "@/lib/queries";
import type { CaseDocumentItem } from "@/lib/backend";

/**
 * LOS DOCUMENTOS DE UN EXPEDIENTE.
 *
 * Hasta ahora un expediente era UN PDF y bastaba con un botón: «Ver
 * antecedentes». Hay contratos que lo entregan en una CARPETA —antecedentes
 * médicos, listado maestro de licencias, notificaciones, anexos— y ahí ese
 * botón enseñaba uno de los seis, elegido por el orden de llegada.
 *
 * Con un solo archivo esto NO aparece: la pantalla sigue como estaba, porque
 * una lista de un elemento no informa de nada y sí estorba.
 *
 * QUÉ SE ENSEÑA Y QUÉ NO. Se enseña lo que hace falta para abrir el documento
 * correcto y para saber si el expediente está completo: nombre, qué es, si se
 * pudo leer. NO se enseña la procedencia técnica —de qué documento y de qué
 * página salió cada hecho—: eso vive en el análisis y en la auditoría, y una
 * matriz de trazabilidad delante de un médico es ruido entre él y el
 * expediente.
 */

const CLASE: Record<NonNullable<CaseDocumentItem["documentClass"]>, string> = {
  CLINICAL: "Antecedente clínico",
  ADMINISTRATIVE: "Administrativo",
  NOTIFICATION: "Notificación",
  UNKNOWN: "Sin clasificar",
};

const ESTADO: Record<CaseDocumentItem["status"], { texto: string; tono: string }> = {
  UPLOADED: { texto: "Recibido", tono: "bg-zinc-100 text-zinc-600" },
  PROCESSING: { texto: "Leyendo", tono: "bg-blue-50 text-[var(--atm-azul)]" },
  PROCESSED: { texto: "Procesado", tono: "bg-emerald-50 text-emerald-700" },
  FAILED: { texto: "No se pudo leer", tono: "bg-red-50 text-red-700" },
  SUPERSEDED: { texto: "Sustituido", tono: "bg-amber-50 text-[var(--atm-obs)]" },
};

function tamaño(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function Documento({ doc }: { doc: CaseDocumentItem }) {
  const estado = ESTADO[doc.status];
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--atm-linea)] py-2 first:border-t-0">
      <div className="min-w-0">
        <a
          href={`/api/v1${doc.downloadUrl.replace(/^\/api\/v1/, "")}`}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-sm font-medium text-[var(--atm-azul)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--atm-azul2)] focus-visible:ring-offset-2"
        >
          {doc.fileName}
        </a>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {doc.documentClass ? CLASE[doc.documentClass] : doc.documentType}
          {tamaño(doc.byteSize) && ` · ${tamaño(doc.byteSize)}`}
        </p>
        {doc.warnings.map((w) => (
          <p key={w} className="mt-0.5 text-[11px] font-medium text-red-700">
            {w}
          </p>
        ))}
      </div>
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${estado.tono}`}>{estado.texto}</span>
    </li>
  );
}

/**
 * La lista, sin pedir nada: la usa quien ya tiene los documentos en la mano
 * —la ficha del médico los recibe dentro del informe—.
 *
 * Con uno o ninguno devuelve `null`: ver arriba.
 */
export function ListaDocumentos({
  documentos,
  titulo = "Documentos del expediente",
}: {
  documentos: CaseDocumentItem[];
  titulo?: string;
}) {
  if (documentos.length <= 1) return null;
  const fallidos = documentos.filter((d) => d.status === "FAILED").length;
  return (
    <section className="mt-3 rounded-xl border border-[var(--atm-linea)] bg-white px-4 py-3">
      <h4 className="text-sm font-semibold text-zinc-900">
        {titulo} · {documentos.length}
      </h4>
      {fallidos > 0 && (
        <p className="mt-1 text-xs font-medium text-red-700">
          {fallidos === 1
            ? "Un documento no se pudo leer: el expediente puede estar incompleto."
            : `${fallidos} documentos no se pudieron leer: el expediente puede estar incompleto.`}
        </p>
      )}
      <ul className="mt-1">
        {documentos.map((d) => (
          <Documento key={d.documentId} doc={d} />
        ))}
      </ul>
    </section>
  );
}

/**
 * La misma lista, pidiéndola al servidor. Para administración, que la abre a
 * demanda sobre la fila de un caso y además necesita la COBERTURA: cuántos
 * llegaron, cuántos se leyeron y si falta alguno que no puede faltar.
 */
export function DocumentosExpediente({ caseId }: { caseId: string }) {
  const { data, isPending, error } = useCaseDocuments(caseId);

  if (isPending) return <p className="py-2 text-xs text-zinc-500">Cargando documentos…</p>;
  if (error || !data) return <p className="py-2 text-xs text-red-700">No se pudieron cargar los documentos.</p>;

  const { coverage } = data;
  return (
    <div className="rounded-xl border border-[var(--atm-linea)] bg-zinc-50/60 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-zinc-900">Documentos del expediente · {coverage.received}</h4>
        <p className="text-xs text-zinc-600">
          {coverage.received} recibidos · {coverage.processed} procesados
          {coverage.failed > 0 && ` · ${coverage.failed} fallidos`}
        </p>
      </div>
      {!coverage.ready && (
        <p className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          El expediente NO está listo para analizarse: no se pudo leer{" "}
          {coverage.blocking.length === 1 ? coverage.blocking[0] : `${coverage.blocking.length} documentos`}.
        </p>
      )}
      <ul className="mt-1">
        {data.documents.map((d) => (
          <Documento key={d.documentId} doc={d} />
        ))}
        {data.documents.length === 0 && <li className="py-2 text-xs text-zinc-500">Todavía no ha llegado ninguno.</li>}
      </ul>
      {data.superseded.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-zinc-600">
            Sustituidos · {data.superseded.length}
          </summary>
          <ul className="mt-1">
            {data.superseded.map((d) => (
              <Documento key={d.documentId} doc={d} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
