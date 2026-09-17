import type { DocumentosFirmados } from "@/lib/backend";

/**
 * DESCARGAR EL INFORME FIRMADO, EN WORD Y EN PDF.
 *
 * Son el MISMO documento en dos formatos, y cada botón baja el de SU versión:
 * las dos rutas llegan juntas del servidor, atadas a un mismo
 * `reportSnapshotId`. La pantalla no compone rutas ni decide qué versión vale.
 *
 * EL PDF SE MUESTRA COMO ESTÁ. Listo, se descarga; en proceso, se dice; fallido
 * o inexistente, «no disponible» — nunca un botón que respondería 404, y pulsar
 * nada aquí genera ni reintenta un PDF.
 *
 * `compacto`: para tablas, donde la fila ya tiene sus acciones. El nombre
 * accesible sigue siendo completo. `conVersion`: en el historial, donde varias
 * filas ofrecen lo mismo y hay que saber de cuál es cada botón.
 */
export function DescargasFirmadas({
  documentos,
  compacto = false,
  conVersion = false,
}: {
  documentos: DocumentosFirmados;
  compacto?: boolean;
  conVersion?: boolean;
}) {
  const deVersion = conVersion ? ` de la versión ${documentos.version}` : "";
  const tamaño = compacto ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-xs";
  const boton = `inline-flex items-center gap-1 rounded-lg border border-[var(--atm-linea)] ${tamaño} font-medium`;
  const { pdf } = documentos;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <a
        href={ruta(documentos.docx.downloadUrl)}
        target="_blank"
        rel="noreferrer"
        aria-label={`Descargar Word${deVersion}`}
        className={`${boton} text-[var(--atm-azul)] hover:bg-blue-50`}
      >
        <IconoDocumento />
        {compacto ? "Word" : "Descargar Word"}
      </a>
      {pdf.status === "READY" && pdf.downloadUrl ? (
        <a
          href={ruta(pdf.downloadUrl)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Descargar PDF${deVersion}`}
          className={`${boton} text-[var(--atm-azul)] hover:bg-blue-50`}
        >
          <IconoPdf />
          {compacto ? "PDF" : "Descargar PDF"}
        </a>
      ) : pdf.status === "PROCESSING" ? (
        <span aria-disabled="true" className={`${boton} cursor-default text-zinc-400`}>
          <IconoPdf />
          PDF en proceso
        </span>
      ) : (
        <span
          title={pdf.status === "FAILED" ? "No se pudo generar el PDF de esta versión." : undefined}
          className={`${tamaño} text-zinc-400`}
        >
          PDF no disponible
        </span>
      )}
    </span>
  );
}

/** La ruta la compone el backend; aquí sólo se asegura el prefijo del proxy. */
function ruta(url: string): string {
  return `/api/v1${url.replace(/^\/api\/v1/, "")}`;
}

function IconoDocumento() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 1.75h5.5L12.25 4.5v9.75H4z" strokeLinejoin="round" />
      <path d="M9.25 1.75V4.75h3" strokeLinejoin="round" />
      <path d="M6 8.25h4.25M6 10.75h4.25" strokeLinecap="round" />
    </svg>
  );
}

function IconoPdf() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 1.75h5.5L12.25 4.5v9.75H4z" strokeLinejoin="round" />
      <path d="M9.25 1.75V4.75h3" strokeLinejoin="round" />
      <path d="M8.1 7v4.5m0 0-1.75-1.75M8.1 11.5l1.75-1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
