"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import { ORIENTATION_LABEL, type BatchListItem, type DoctorWorkload, type ExportJob, type Orientation } from "@/lib/backend";
import { Aviso, Btn, Campo, Chip, EXPORT_LABEL, FilaVacia, Select, Tabla, batchTono, exportTono } from "../ui";

// POST /api/v1/exports {type:"SIGNED_REPORTS_ZIP", filters:{batchId?,doctorProfileId?,orientation?}}
// GET  /api/v1/exports
// GET  /api/v1/exports/:id/download
// GET  /api/v1/admin/batches  → una tarjeta por semana, con su total de casos y sus firmados
//                                (lo exportable). Es lo que arma la grilla de abajo.
//
// La selección se CONGELA al encolar: el ZIP contiene los informes firmados que
// cumplen los filtros en ese instante, aunque después se firmen más.

const ORIENTACIONES: Orientation[] = ["IRRECOVERABLE", "RECOVERABLE", "INDETERMINATE"];

export function Exportaciones() {
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [semanas, setSemanas] = useState<BatchListItem[] | null>(null);
  const [medicos, setMedicos] = useState<DoctorWorkload[]>([]);
  const [fBatch, setFBatch] = useState("");
  const [fMedico, setFMedico] = useState("");
  const [fOrient, setFOrient] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ultimoId, setUltimoId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api<{ batches: BatchListItem[] }>("/admin/batches?limit=200")
      .then((d) => setSemanas([...d.batches].sort((a, b) => (a.batch.sequence ?? 0) - (b.batch.sequence ?? 0))))
      .catch(() => setSemanas([]));
    api<{ doctors: DoctorWorkload[] }>("/admin/doctor-workload?includeInactive=true").then((d) => setMedicos(d.doctors)).catch(() => {});
  }, []);

  const cargar = useCallback(async () => {
    try {
      const d = await api<{ exports: ExportJob[] }>("/exports?limit=50");
      setJobs(d.exports);
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo cargar." });
    }
  }, []);

  useEffect(() => {
    void cargar();
    timer.current = setInterval(cargar, 3000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [cargar]);

  async function generar() {
    setBusy(true);
    setMsg(null);
    const filters: Record<string, string> = {};
    if (fBatch) filters.batchId = fBatch;
    if (fMedico) filters.doctorProfileId = fMedico;
    if (fOrient) filters.orientation = fOrient;
    try {
      const job = await api<{ id: string }>("/exports", { json: { type: "SIGNED_REPORTS_ZIP", filters } });
      setUltimoId(job.id);
      setMsg({
        ok: true,
        texto: "Exportado y guardado en el servidor. Apenas termine de armarse, descárgalo abajo (fila resaltada).",
      });
      await cargar();
    } catch (e) {
      const err = e instanceof ApiFallo ? e : null;
      setMsg({
        ok: false,
        texto:
          err?.code === "NO_EXPORTABLE_REPORTS"
            ? "Ningún informe firmado cumple esos filtros."
            : err?.message ?? "No se pudo generar.",
      });
    } finally {
      setBusy(false);
    }
  }

  const semanaElegida = semanas?.find((s) => s.batch.id === fBatch);
  const firmadosDisponibles = semanaElegida
    ? semanaElegida.summary.signed
    : (semanas ?? []).reduce((s, b) => s + b.summary.signed, 0);
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
              firmados={semanas.reduce((s, b) => s + b.summary.signed, 0)}
              onClick={() => setFBatch("")}
            />
            {semanas.map(({ batch, summary }) => (
              <TarjetaSemana
                key={batch.id}
                activa={fBatch === batch.id}
                titulo={batch.name}
                subtitulo={`${summary.totalCases} caso(s)`}
                firmados={summary.signed}
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
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Btn onClick={generar} disabled={busy || firmadosDisponibles === 0}>
            {busy ? "Exportando…" : `Exportar ${semanaElegida?.batch.name ?? "todas las semanas"} (${firmadosDisponibles})`}
          </Btn>
          <span className="text-xs text-zinc-500">
            Incluye: informes <strong>firmados</strong> de {alcance}. Al hacer clic, el backend arma el ZIP y lo
            <strong> guarda automáticamente</strong> — no hay un paso aparte para guardar. Cuando esté listo, aparece
            abajo con el botón para descargarlo.
          </span>
        </div>
        {firmadosDisponibles === 0 && (
          <p className="mt-2 text-xs text-[var(--atm-obs)]">
            Todavía no hay informes firmados en ese alcance — nada que exportar por ahora.
          </p>
        )}
      </div>

      {msg && <Aviso ok={msg.ok}>{msg.texto}</Aviso>}

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-700">Exportaciones generadas</p>
        <Tabla columnas={["Solicitada", "Estado", "Avance", "Informes", ""]}>
          {jobs.length === 0 && <FilaVacia cols={5}>Sin exportaciones todavía.</FilaVacia>}
          {jobs.map((j) => (
            <tr
              key={j.id}
              className={`border-t border-[var(--atm-linea)] hover:bg-[var(--atm-fondo)] ${
                j.id === ultimoId ? "bg-blue-50/60 ring-1 ring-inset ring-[var(--atm-azul2)]" : ""
              }`}
            >
              <td className="px-4 py-2.5 text-zinc-600">{new Date(j.createdAt).toLocaleString("es-CL")}</td>
              <td className="px-4 py-2.5">
                <Chip tono={exportTono(j.status)}>{EXPORT_LABEL[j.status] ?? j.status}</Chip>
                {j.error && <span className="ml-1 text-xs text-[var(--atm-mal)]">— {j.error.message}</span>}
              </td>
              <td className="px-4 py-2.5 text-zinc-600">{j.progressPercent}%</td>
              <td className="px-4 py-2.5 text-zinc-600">
                {j.processedItems}/{j.totalItems}
              </td>
              <td className="px-4 py-2.5 text-right">
                {j.downloadAvailable ? (
                  <a
                    href={`/api/v1/exports/${j.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs font-medium text-[var(--atm-azul)] hover:bg-blue-50"
                  >
                    Descargar ZIP
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
