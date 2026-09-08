"use client";

import { useState } from "react";
import { ApiFallo } from "@/lib/api";
import { useBatches, useReports } from "@/lib/queries";
import { ORIENTATION_LABEL, WORKFLOW_LABEL, type ReportWorkflowStatus } from "@/lib/backend";
import { Refrescando, TablaSkeleton } from "@/components/Skeleton";
import { Aviso, Chip, FilaVacia, Select, Tabla, workflowTono } from "../ui";

// GET /api/v1/reports?batchId=&workflowStatus=&limit=&offset=
// GET /api/v1/reports/:id/download          (PRE_REPORT .docx)
// GET /api/v1/reports/:id/signed-document   (informe final firmado .docx)

const ORDEN: ReportWorkflowStatus[] = ["READY_FOR_REVIEW", "CHANGES_REQUESTED", "APPROVED", "SIGNING", "SIGNED", "SIGNING_FAILED"];

export function Informes() {
  const [fBatch, setFBatch] = useState("");
  const [fWf, setFWf] = useState("");

  // Las semanas las comparten cinco pantallas. Cinco minutos de frescura: un
  // lote se abre o se cierra a mano, no cambia solo.
  const { data: semanas = [] } = useBatches();
  const filtros = { batchId: fBatch || undefined, workflowStatus: fWf || undefined, limit: 100 };
  const { data, error: fallo, isPending, isFetching } = useReports(filtros);

  const reports = data?.reports ?? [];
  const total = data?.total ?? 0;
  const counts = (data?.countsByWorkflowStatus ?? {}) as Partial<Record<ReportWorkflowStatus, number>>;
  const msg = fallo ? (fallo instanceof ApiFallo ? fallo.message : "No se pudo cargar.") : null;

  // Cambiar de filtro NO desmonta la tabla: `placeholderData` conserva el
  // resultado anterior mientras llega el nuevo.
  if (isPending) return <TablaSkeleton filas={10} columnas={6} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--atm-linea)] bg-white p-3 text-sm shadow-sm">
        <Select value={fBatch} onChange={(e) => setFBatch(e.target.value)}>
          <option value="">Todas las semanas</option>
          {semanas.map(({ batch }) => (
            <option key={batch.id} value={batch.id}>
              {batch.name}
            </option>
          ))}
        </Select>
        <Select value={fWf} onChange={(e) => setFWf(e.target.value)}>
          <option value="">Cualquier estado</option>
          {ORDEN.map((w) => (
            <option key={w} value={w}>
              {WORKFLOW_LABEL[w]}
            </option>
          ))}
        </Select>
        <span className="ml-auto flex items-center gap-3 text-zinc-400">
          <Refrescando visible={isFetching} />
          {total} informe(s)
        </span>
      </div>

      {ORDEN.some((w) => counts[w]) && (
        <div className="flex flex-wrap gap-2">
          {ORDEN.filter((w) => counts[w]).map((w) => (
            <Chip key={w} tono={workflowTono(w)}>
              {WORKFLOW_LABEL[w]}: {counts[w]}
            </Chip>
          ))}
        </div>
      )}

      {msg && <Aviso ok={false}>{msg}</Aviso>}

      <Tabla columnas={["Nº trámite", "Semana", "Médico", "Versión", "Estado", "Orientación", ""]}>
        {reports.length === 0 && (
          <FilaVacia cols={7}>Sin informes. Aparecen cuando un caso se procesa.</FilaVacia>
        )}
        {reports.map((r) => (
          <tr key={r.reportId} className="border-t border-[var(--atm-linea)] hover:bg-[var(--atm-fondo)]">
            <td className="px-4 py-2.5 font-mono text-xs text-zinc-800">{r.externalCaseId}</td>
            <td className="px-4 py-2.5 text-zinc-600">{r.batch?.name ?? "—"}</td>
            <td className="px-4 py-2.5 text-zinc-600">{r.doctor?.fullName ?? "—"}</td>
            <td className="px-4 py-2.5 text-zinc-600">v{r.version}</td>
            <td className="px-4 py-2.5">
              <Chip tono={workflowTono(r.workflowStatus)}>{WORKFLOW_LABEL[r.workflowStatus]}</Chip>
            </td>
            <td className="px-4 py-2.5 text-zinc-600">
              {r.orientationAssessment ? ORIENTATION_LABEL[r.orientationAssessment] : "—"}
            </td>
            <td className="px-4 py-2.5 text-right whitespace-nowrap">
              <a
                href={`/api/v1/reports/${r.reportId}/download`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs text-[var(--atm-azul)] hover:bg-blue-50"
              >
                Preinforme
              </a>
              {r.signedAt && (
                <a
                  href={`/api/v1/reports/${r.reportId}/signed-document`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs text-[var(--atm-azul)] hover:bg-blue-50"
                >
                  Firmado
                </a>
              )}
            </td>
          </tr>
        ))}
      </Tabla>
    </div>
  );
}
