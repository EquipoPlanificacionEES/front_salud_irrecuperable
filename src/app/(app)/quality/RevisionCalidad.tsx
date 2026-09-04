"use client";

import { useEffect, useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import { ORIENTATION_LABEL, WORKFLOW_LABEL, type ReportListItem } from "@/lib/backend";

// El circuito de control de calidad (cola, claim, review) todavía NO está en el
// backend (no aparece en las 40 rutas). Por ahora QUALITY puede LEER los
// informes: GET /api/v1/reports.
export function RevisionCalidad() {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api<{ reports: ReportListItem[] }>("/reports?limit=100")
      .then((d) => setReports(d.reports))
      .catch((e) => setMsg(e instanceof ApiFallo ? e.message : "No se pudo cargar."))
      .finally(() => setCargando(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--atm-obs)] bg-amber-50 p-4 text-sm">
        <p className="font-medium">Control de calidad en construcción</p>
        <p className="mt-1 text-zinc-600">
          La cola de revisión, la toma de casos y la devolución al médico aún no están en el backend.
          Esta vista solo lista los informes del contrato.
        </p>
      </div>

      {msg && <p className="text-sm text-[var(--atm-mal)]">{msg}</p>}

      <div className="overflow-x-auto rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--atm-th)] text-left text-white">
              <th className="px-4 py-2 font-medium">Nº trámite</th>
              <th className="px-4 py-2 font-medium">Médico</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Orientación</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={4} className="px-4 py-6 text-center text-zinc-400">Cargando…</td></tr>}
            {!cargando && reports.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-400">Sin informes.</td></tr>
            )}
            {reports.map((r) => (
              <tr key={r.reportId} className="border-t border-[var(--atm-linea)]">
                <td className="px-4 py-2 font-mono text-xs">{r.externalCaseId}</td>
                <td className="px-4 py-2 text-zinc-600">{r.doctor?.fullName ?? "—"}</td>
                <td className="px-4 py-2 text-zinc-600">{WORKFLOW_LABEL[r.workflowStatus]}</td>
                <td className="px-4 py-2 text-zinc-600">{r.orientationAssessment ? ORIENTATION_LABEL[r.orientationAssessment] : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
