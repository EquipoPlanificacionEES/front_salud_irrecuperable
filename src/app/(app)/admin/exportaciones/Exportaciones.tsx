"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import { useBatches, useDoctorWorkload, useExportPreflight, useExports, useInvalidar } from "@/lib/queries";
import { ORIENTATION_LABEL, type ExportJob, type ExportPreflight, type Orientation } from "@/lib/backend";
import { Aviso, Btn, Campo, Chip, EXPORT_LABEL, FilaVacia, Select, Tabla, batchTono, exportTono } from "../ui";

// GET  /api/v1/exports/preflight?batchId=…   → cuántos Word y cuántos PDF llevará cada ZIP
// POST /api/v1/exports {type:"SIGNED_REPORTS_ZIP", format:"docx"|"pdf", filters:{batchId?,doctorProfileId?,orientation?}}
// GET  /api/v1/exports
// GET  /api/v1/exports/:id/download
// GET  /api/v1/admin/batches  → una tarjeta por semana, con su total de casos y sus firmados
//                                (lo exportable). Es lo que arma la grilla de abajo.
//
// La selección se CONGELA al encolar: el ZIP contiene los informes firmados que
// cumplen los filtros en ese instante, aunque después se firmen más.

const ORIENTACIONES: Orientation[] = ["IRRECOVERABLE", "RECOVERABLE", "INDETERMINATE"];

type Formato = "docx" | "pdf";
const NOMBRE: Record<Formato, string> = { docx: "Word", pdf: "PDF" };

/** «93 disponibles» si están todos; «91 de 93 disponibles» si no. Nunca «completo» a medias. */
export function disponibles(listos: number, total: number): string {
  return listos === total ? `${listos} disponibles` : `${listos} de ${total} disponibles`;
}

/**
 * Descarga el archivo sin sacar al usuario de la pantalla. La API responde con
 * `Content-Disposition: attachment`, así que el navegador lo guarda y no navega.
 */
function descargar(href: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.rel = "noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function Exportaciones() {
  const [fBatch, setFBatch] = useState("");
  const [fMedico, setFMedico] = useState("");
  const [fOrient, setFOrient] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  /**
   * CADA FORMATO LLEVA SU PROPIO ESTADO. Pedir el ZIP PDF no bloquea el de Word:
   * son dos trabajos independientes en el servidor.
   */
  const [enviando, setEnviando] = useState<Record<Formato, boolean>>({ docx: false, pdf: false });
  const [pendiente, setPendiente] = useState<Record<Formato, string | null>>({ docx: null, pdf: null });
  const [ultimoId, setUltimoId] = useState<string | null>(null);

  // Semanas y médicos: las mismas consultas que el resto de administración.
  const { data: lotes } = useBatches();
  const { data: medicosData } = useDoctorWorkload();
  const semanas = useMemo(
    () => (lotes ? [...lotes].sort((a, b) => (a.batch.sequence ?? 0) - (b.batch.sequence ?? 0)) : []),
    [lotes],
  );
  const medicos = medicosData ?? [];

  /**
   * El sondeo lo lleva la propia consulta, no un `setInterval` a mano: así se
   * detiene solo cuando la pestaña deja de estar visible y no hay temporizador
   * que limpiar. Se sondea SÓLO mientras haya algo en marcha; con todo
   * terminado, dejar el intervalo puesto era pedirle al backend un listado cada
   * tres segundos para siempre.
   */
  const { data: jobsData, error: falloJobs } = useExports();
  const jobs = useMemo(() => jobsData ?? [], [jobsData]);
  const invalidar = useInvalidar();

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (fBatch) f.batchId = fBatch;
    if (fMedico) f.doctorProfileId = fMedico;
    if (fOrient) f.orientation = fOrient;
    return f;
  }, [fBatch, fMedico, fOrient]);

  // Lo que llevará cada ZIP, del servidor y con la misma selección que el ZIP.
  const { data: previo, isPending: previoCargando } = useExportPreflight(filters);

  async function generar(formato: Formato) {
    setEnviando((e) => ({ ...e, [formato]: true }));
    setMsg(null);
    try {
      const job = await api<{ id: string }>("/exports", {
        json: { type: "SIGNED_REPORTS_ZIP", format: formato, filters },
      });
      setUltimoId(job.id);
      setPendiente((p) => ({ ...p, [formato]: job.id }));
      await invalidar.exportacionEncolada();
    } catch (e) {
      const err = e instanceof ApiFallo ? e : null;
      setMsg({
        ok: false,
        texto:
          err?.code === "NO_EXPORTABLE_REPORTS"
            ? formato === "pdf"
              ? "Ningún informe de ese alcance tiene su PDF disponible."
              : "Ningún informe firmado cumple esos filtros."
            : err?.message ?? "No se pudo generar.",
      });
    } finally {
      setEnviando((e) => ({ ...e, [formato]: false }));
    }
  }

  /**
   * CUANDO EL ZIP PEDIDO QUEDA LISTO, SE DESCARGA SOLO. El listado ya se sondea
   * mientras haya trabajos en curso; aquí sólo se mira si el de cada formato
   * terminó.
   */
  useEffect(() => {
    for (const formato of ["docx", "pdf"] as const) {
      const id = pendiente[formato];
      const job = id ? jobs.find((j) => j.id === id) : undefined;
      if (!id || !job) continue;
      if (job.downloadAvailable) {
        setPendiente((p) => ({ ...p, [formato]: null }));
        descargar(`/api/v1/exports/${id}/download`);
        setMsg({ ok: true, texto: resumenListo(job, formato) });
      } else if (job.status === "FAILED" || job.status === "EXPIRED") {
        setPendiente((p) => ({ ...p, [formato]: null }));
        setMsg({ ok: false, texto: `El ZIP ${NOMBRE[formato]} no se pudo preparar: ${job.error?.message ?? "falló"}.` });
      }
    }
  }, [jobs, pendiente]);

  const semanaElegida = semanas?.find((s) => s.batch.id === fBatch);
  const nombreMedico = medicos.find((m) => m.doctorProfileId === fMedico)?.fullName;
  const alcance = [
    semanaElegida?.batch.name ?? "todas las semanas",
    nombreMedico ? `Dr(a). ${nombreMedico}` : null,
    fOrient ? ORIENTATION_LABEL[fOrient as Orientation] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-4 shadow-sm">
        <p className="mb-1 text-sm font-medium text-zinc-700">1. Elige la semana</p>
        <p className="mb-3 text-xs text-zinc-500">
          Cada tarjeta es un lote. No todas las semanas tienen la totalidad de sus casos todavía — el número de la
          derecha es lo ya firmado y listo para exportar.
        </p>

        {semanas === null && <p className="py-6 text-center text-sm text-zinc-400">Cargando semanas…</p>}
        {semanas !== null && semanas.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-400">Todavía no hay semanas creadas.</p>
        )}
        {semanas !== null && semanas.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            <TarjetaSemana
              activa={fBatch === ""}
              titulo="Todas las semanas"
              subtitulo={`${semanas.reduce((s, b) => s + b.summary.totalCases, 0)} caso(s) en total`}
              firmados={semanas.reduce((s, b) => s + b.summary.classification.SIGNED, 0)}
              onClick={() => setFBatch("")}
            />
            {semanas.map(({ batch, summary }) => (
              <TarjetaSemana
                key={batch.id}
                activa={fBatch === batch.id}
                titulo={batch.name}
                subtitulo={`${summary.totalCases} caso(s)`}
                firmados={summary.classification.SIGNED}
                estado={batch.status}
                onClick={() => setFBatch(batch.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-medium text-zinc-700">2. Afina y genera el ZIP</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Médico (opcional)">
            <Select value={fMedico} onChange={(e) => setFMedico(e.target.value)}>
              <option value="">Todos</option>
              {medicos.map((m) => (
                <option key={m.doctorProfileId} value={m.doctorProfileId}>
                  {m.fullName}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo label="Orientación (opcional)">
            <Select value={fOrient} onChange={(e) => setFOrient(e.target.value)}>
              <option value="">Cualquiera</option>
              {ORIENTACIONES.map((o) => (
                <option key={o} value={o}>
                  {ORIENTATION_LABEL[o]}
                </option>
              ))}
            </Select>
          </Campo>
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          {semanaElegida?.batch.name ?? "Todas las semanas"}
          {previo ? ` · ${previo.totalCases} caso(s)` : ""} · alcance: {alcance}. Cada caso va con su{" "}
          <strong>versión firmada vigente</strong>, una sola vez. Al hacer clic se prepara el ZIP en el servidor y se
          descarga solo cuando está listo.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <BotonZip
            formato="docx"
            previo={previo}
            cargando={previoCargando}
            ocupado={enviando.docx || pendiente.docx !== null}
            onClick={() => generar("docx")}
          />
          <BotonZip
            formato="pdf"
            previo={previo}
            cargando={previoCargando}
            ocupado={enviando.pdf || pendiente.pdf !== null}
            onClick={() => generar("pdf")}
          />
        </div>
      </div>

      {falloJobs && <Aviso ok={false}>No se pudo cargar el historial de exportaciones.</Aviso>}
      {msg && <Aviso ok={msg.ok}>{msg.texto}</Aviso>}

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-700">Exportaciones generadas</p>
        <Tabla columnas={["Solicitada", "Formato", "Estado", "Avance", "Informes", ""]}>
          {jobs.length === 0 && <FilaVacia cols={6}>Sin exportaciones todavía.</FilaVacia>}
          {jobs.map((j) => (
            <tr
              key={j.id}
              className={`border-t border-[var(--atm-linea)] hover:bg-[var(--atm-fondo)] ${
                j.id === ultimoId ? "bg-blue-50/60 ring-1 ring-inset ring-[var(--atm-azul2)]" : ""
              }`}
            >
              <td className="px-4 py-2.5 text-zinc-600">{new Date(j.createdAt).toLocaleString("es-CL")}</td>
              <td className="px-4 py-2.5">
                <Chip>{j.format === "PDF" ? "PDF" : "Word"}</Chip>
              </td>
              <td className="px-4 py-2.5">
                <Chip tono={exportTono(j.status)}>{EXPORT_LABEL[j.status] ?? j.status}</Chip>
                {j.error && <span className="ml-1 text-xs text-[var(--atm-mal)]">— {j.error.message}</span>}
              </td>
              <td className="px-4 py-2.5 text-zinc-600">{j.progressPercent}%</td>
              <td className="px-4 py-2.5 text-zinc-600">
                {j.processedItems}/{j.totalItems}
                {(j.unavailableItems ?? 0) > 0 && (
                  <span className="ml-1 text-xs text-[var(--atm-obs)]">
                    ·{" "}
                    {j.format === "PDF"
                      ? `${j.unavailableItems} no disponible(s), listado incluido`
                      : `${j.unavailableItems} sin informe firmado`}
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right">
                {j.downloadAvailable ? (
                  <a
                    href={`/api/v1/exports/${j.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs font-medium text-[var(--atm-azul)] hover:bg-blue-50"
                  >
                    Descargar ZIP {j.format === "PDF" ? "PDF" : "Word"}
                  </a>
                ) : (
                  <span className="text-xs text-zinc-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </Tabla>
      </div>
    </div>
  );
}

/** Qué dice el aviso cuando el ZIP ya bajó: lo que lleva, y lo que no. */
function resumenListo(job: ExportJob, formato: Formato): string {
  const faltan = job.unavailableItems ?? 0;
  if (formato === "pdf") {
    return faltan > 0
      ? `ZIP PDF descargado: ${job.totalItems} PDF. Faltan ${faltan}; van listados en PDF_NO_DISPONIBLES.csv dentro del ZIP.`
      : `ZIP PDF descargado: ${job.totalItems} PDF, todos los del alcance.`;
  }
  return faltan > 0
    ? `ZIP Word descargado: ${job.totalItems} informes. ${faltan} caso(s) sin informe firmado no van incluidos.`
    : `ZIP Word descargado: ${job.totalItems} informes, todos los del alcance.`;
}

/**
 * UN BOTÓN POR FORMATO, con lo que llevará debajo. El recuento es el del
 * servidor: si faltan PDF se dice cuántos, y que irán listados dentro del ZIP.
 */
function BotonZip({
  formato,
  previo,
  cargando,
  ocupado,
  onClick,
}: {
  formato: Formato;
  previo: ExportPreflight | undefined;
  cargando: boolean;
  ocupado: boolean;
  onClick: () => void;
}) {
  const listos = previo ? (formato === "pdf" ? previo.pdf.ready : previo.word.ready) : 0;
  const total = previo?.totalCases ?? 0;
  const faltan = total - listos;
  return (
    <div className="rounded-lg border border-[var(--atm-linea)] p-3">
      <Btn
        onClick={onClick}
        disabled={ocupado || cargando || listos === 0}
        variante={formato === "pdf" ? "primary" : "ghost"}
        className="w-full"
      >
        {ocupado ? `Preparando ZIP ${NOMBRE[formato]}…` : `Descargar ZIP ${NOMBRE[formato]}`}
      </Btn>
      <p className="mt-2 text-xs text-zinc-600">
        {cargando || !previo ? (
          "Contando documentos…"
        ) : (
          <>
            <strong>{NOMBRE[formato]}:</strong> {disponibles(listos, total)}
          </>
        )}
      </p>
      {previo && listos === 0 && total > 0 && (
        <p className="mt-1 text-xs text-[var(--atm-obs)]">Ningún {NOMBRE[formato]} disponible en este alcance.</p>
      )}
      {previo && formato === "pdf" && listos > 0 && faltan > 0 && (
        <p className="mt-1 text-xs text-[var(--atm-obs)]">Se incluirá un listado de los PDF no disponibles.</p>
      )}
    </div>
  );
}

function TarjetaSemana({
  activa,
  titulo,
  subtitulo,
  firmados,
  estado,
  onClick,
}: {
  activa: boolean;
  titulo: string;
  subtitulo: string;
  firmados: number;
  estado?: "OPEN" | "CLOSED";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition ${
        activa
          ? "border-[var(--atm-azul2)] bg-blue-50 ring-1 ring-[var(--atm-azul2)]"
          : "border-[var(--atm-linea)] bg-white hover:border-[var(--atm-azul2)] hover:bg-[var(--atm-fondo)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-800">{titulo}</p>
        {estado && <Chip tono={batchTono(estado)}>{estado === "OPEN" ? "Abierta" : "Cerrada"}</Chip>}
      </div>
      <p className="mt-1 text-xs text-zinc-500">{subtitulo}</p>
      <p className={`mt-2 text-lg font-semibold ${firmados ? "text-[var(--atm-ok)]" : "text-zinc-300"}`}>
        {firmados}
        <span className="ml-1 text-xs font-normal text-zinc-400">firmado(s)</span>
      </p>
    </button>
  );
}
