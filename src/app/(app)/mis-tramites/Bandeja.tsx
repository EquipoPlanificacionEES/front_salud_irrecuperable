"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, ApiFallo } from "@/lib/api";
import { ORIENTATION_LABEL, type OperationalCase, type ReportWorkflowStatus } from "@/lib/backend";

// GET /api/v1/inbox → los casos con asignación ACTIVA al médico que llama.

type Pestaña = "pendientes" | "historico";

const PENDIENTE = new Set<ReportWorkflowStatus>(["READY_FOR_REVIEW", "CHANGES_REQUESTED"]);

// 3 grupos visuales, igual que WORKFLOW_LABEL en lib/backend.ts.
const CHIP: Record<ReportWorkflowStatus, { texto: string; clase: string }> = {
  READY_FOR_REVIEW: { texto: "Por revisar", clase: "bg-blue-50 text-[var(--atm-azul)]" },
  CHANGES_REQUESTED: { texto: "Devuelto", clase: "bg-amber-50 text-[var(--atm-obs)]" },
  APPROVED: { texto: "Ratificado", clase: "bg-green-50 text-[var(--atm-ok)]" },
  SIGNING: { texto: "Ratificado", clase: "bg-green-50 text-[var(--atm-ok)]" },
  SIGNED: { texto: "Ratificado", clase: "bg-green-50 text-[var(--atm-ok)]" },
  SIGNING_FAILED: { texto: "Devuelto", clase: "bg-red-50 text-[var(--atm-mal)]" },
};
const SIN_INFORME = { texto: "En proceso", clase: "bg-zinc-100 text-zinc-500" };

export function Bandeja() {
  const [casos, setCasos] = useState<OperationalCase[]>([]);
  const [tab, setTab] = useState<Pestaña>("pendientes");
  const [buscar, setBuscar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api<{ cases: OperationalCase[] }>("/inbox")
      .then((d) => setCasos(d.cases))
      .catch((e) => setError(e instanceof ApiFallo ? e.message : "No se pudo cargar la bandeja."))
      .finally(() => setCargando(false));
  }, []);

  const esPendiente = (c: OperationalCase) => !c.report || PENDIENTE.has(c.report.workflowStatus);

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return casos
      .filter((c) => (tab === "pendientes" ? esPendiente(c) : !esPendiente(c)))
      .filter((c) => !q || c.externalCaseId.toLowerCase().includes(q));
  }, [casos, tab, buscar]);

  const nPend = casos.filter(esPendiente).length;
  const nHist = casos.length - nPend;
  const porRevisar = casos.filter((c) => c.report && PENDIENTE.has(c.report.workflowStatus)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-[var(--atm-linea)] bg-white p-0.5">
          {([["pendientes", `Pendientes (${nPend})`], ["historico", `Histórico (${nHist})`]] as const).map(([p, etiqueta]) => (
            <button
              key={p}
              onClick={() => setTab(p)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === p ? "bg-[var(--atm-azul)] text-white" : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        {porRevisar > 0 && tab === "pendientes" && (
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-[var(--atm-azul)]">
            {porRevisar} esperan tu pronunciamiento
          </span>
        )}
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar por Nº de caso"
          className="ml-auto w-56 rounded-lg border border-[var(--atm-linea)] px-3 py-1.5 text-sm outline-none focus:border-[var(--atm-azul2)]"
        />
      </div>

      {error && <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-[var(--atm-mal)]">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--atm-th)] text-left text-white">
              <th className="px-4 py-2.5 font-medium">Nº de caso</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
              <th className="px-4 py-2.5 font-medium">Orientación</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={4} className="px-4 py-12 text-center text-zinc-400">Cargando…</td></tr>}
            {!cargando && filtrados.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-sm text-zinc-400">
                  {tab === "pendientes"
                    ? buscar
                      ? "Ningún caso pendiente coincide con la búsqueda."
                      : "No tienes casos pendientes."
                    : "Todavía no has cerrado ningún caso."}
                </td>
              </tr>
            )}
            {filtrados.map((c) => {
              const chip = c.report ? CHIP[c.report.workflowStatus] : SIN_INFORME;
              return (
                <tr key={c.caseId} className="border-t border-[var(--atm-linea)] hover:bg-[var(--atm-fondo)]">
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-800">{c.externalCaseId}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${chip.clase}`}>{chip.texto}</span>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600">
                    {c.report?.orientationAssessment ? ORIENTATION_LABEL[c.report.orientationAssessment] : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {c.report ? (
                      <Link
                        href={`/mis-tramites/${c.caseId}`}
                        className="rounded-lg border border-[var(--atm-linea)] px-3 py-1 text-xs font-medium text-[var(--atm-azul)] hover:bg-blue-50"
                      >
                        {tab === "pendientes" ? "Revisar" : "Ver"}
                      </Link>
                    ) : (
                      <span className="text-xs text-zinc-400">sin preinforme</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
