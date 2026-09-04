"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, ApiFallo } from "@/lib/api";
import { WORKFLOW_LABEL, type OperationalCase } from "@/lib/backend";

// GET /api/v1/inbox → los casos con asignación ACTIVA al médico que llama.
// El médico entra a cada caso por /mis-tramites/<caseId> (GET /cases/:id/report).

type Pestaña = "pendientes" | "historico";

const PENDIENTE = new Set(["READY_FOR_REVIEW", "CHANGES_REQUESTED"]);

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

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return casos
      .filter((c) => {
        const wf = c.report?.workflowStatus;
        const esPendiente = !wf || PENDIENTE.has(wf);
        return tab === "pendientes" ? esPendiente : !esPendiente;
      })
      .filter((c) => !q || c.externalCaseId.toLowerCase().includes(q));
  }, [casos, tab, buscar]);

  const nPend = casos.filter((c) => !c.report || PENDIENTE.has(c.report.workflowStatus)).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["pendientes", "historico"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setTab(p)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${
              tab === p ? "bg-[var(--atm-azul)] text-white" : "border border-[var(--atm-linea)] bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {p === "pendientes" ? `Pendientes (${nPend})` : "Histórico"}
          </button>
        ))}
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar por Nº de caso"
          className="ml-auto w-64 rounded-lg border border-[var(--atm-linea)] px-3 py-1.5 text-sm outline-none focus:border-[var(--atm-azul2)]"
        />
      </div>

      {error && <p className="mb-3 text-sm text-[var(--atm-mal)]">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--atm-th)] text-left text-white">
              <th className="px-4 py-2 font-medium">Nº de caso</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Orientación</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={4} className="px-4 py-10 text-center text-zinc-400">Cargando…</td></tr>}
            {!cargando && filtrados.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-zinc-400">Sin trámites {tab}.</td></tr>
            )}
            {filtrados.map((c) => (
              <tr key={c.caseId} className="border-t border-[var(--atm-linea)]">
                <td className="px-4 py-2 font-mono text-xs">{c.externalCaseId}</td>
                <td className="px-4 py-2 text-zinc-600">
                  {c.report ? WORKFLOW_LABEL[c.report.workflowStatus] : "Sin preinforme"}
                </td>
                <td className="px-4 py-2 text-zinc-600">
                  {c.report?.orientationAssessment
                    ? c.report.orientationAssessment === "RECOVERABLE"
                      ? "Recuperable"
                      : c.report.orientationAssessment === "IRRECOVERABLE"
                        ? "No recuperable"
                        : "Indeterminada"
                    : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  {c.report ? (
                    <Link
                      href={`/mis-tramites/${c.caseId}`}
                      className="rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs font-medium text-[var(--atm-azul)] hover:bg-blue-50"
                    >
                      {tab === "pendientes" ? "Revisar" : "Ver"}
                    </Link>
                  ) : (
                    <span className="text-xs text-zinc-400">en proceso</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
