"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { BatchListItem, DoctorWorkload, OperationalCase } from "@/lib/backend";
import type { Rol } from "@/lib/roles";

// Resumen. admin/calidad: /admin/batches + /admin/doctor-workload.
// medico: /inbox — sus casos asignados, contados por estado.

const PENDIENTE_REVISION = new Set(["READY_FOR_REVIEW", "CHANGES_REQUESTED"]);
const CERRADO = new Set(["APPROVED", "SIGNING", "SIGNED", "SIGNING_FAILED"]);

export function KpiPanel({ rol, nombre }: { rol: Rol; nombre: string; contrato: string }) {
  const [batches, setBatches] = useState<BatchListItem[] | null>(null);
  const [medicos, setMedicos] = useState<DoctorWorkload[]>([]);
  const [inbox, setInbox] = useState<OperationalCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rol === "medico") {
      api<{ cases: OperationalCase[] }>("/inbox")
        .then((d) => setInbox(d.cases))
        .catch(() => setError("No se pudo cargar tu resumen. ¿Backend arriba en :3000?"));
      return;
    }
    Promise.all([
      api<{ batches: BatchListItem[] }>("/admin/batches?limit=200"),
      api<{ doctors: DoctorWorkload[] }>("/admin/doctor-workload?includeInactive=true"),
    ])
      .then(([b, d]) => {
        setBatches([...b.batches].sort((x, y) => (y.batch.sequence ?? 0) - (x.batch.sequence ?? 0)));
        setMedicos(d.doctors);
      })
      .catch(() => setError("No se pudo cargar el resumen. ¿Backend arriba en :3000?"));
  }, [rol]);

  if (error) return <p className="text-sm text-[var(--atm-mal)]">{error}</p>;

  // ---- Médico -------------------------------------------------------------
  if (rol === "medico") {
    if (!inbox) return <p className="text-sm text-zinc-400">Cargando…</p>;

    const asignados = inbox.length;
    const porRevisar = inbox.filter((c) => c.report && PENDIENTE_REVISION.has(c.report.workflowStatus)).length;
    const enProceso = inbox.filter((c) => !c.report).length;
    const ratificados = inbox.filter((c) => c.report && CERRADO.has(c.report.workflowStatus)).length;

    return (
      <div className="space-y-6">
        <p className="text-sm text-zinc-500">Hola, {nombre}. Este es el estado de tus casos.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Asignados a ti" valor={asignados} />
          <Kpi label="Por revisar" valor={porRevisar} />
          <Kpi label="En proceso" valor={enProceso} />
          <Kpi label="Ratificados" valor={ratificados} />
        </div>
        <Link
          href="/mis-tramites"
          className="inline-block rounded-lg border border-[var(--atm-azul2)] px-4 py-2 text-sm font-semibold text-[var(--atm-azul)] hover:bg-blue-50"
        >
          Ir a mis casos
        </Link>
      </div>
    );
  }

  // ---- Admin / Calidad --------------------------------------------------
  if (!batches) return <p className="text-sm text-zinc-400">Cargando…</p>;

  /**
   * LAS CIFRAS SALEN DE LA CLASIFICACIÓN, y por eso cuadran entre sí: las ocho
   * categorías son excluyentes y su suma es el total. Antes «en revisión» sumaba
   * dos estados del informe sin mirar la retención, y contaba un expediente que
   * el médico no veía en su bandeja.
   */
  const tot = batches.reduce(
    (a, { summary }) => ({
      casos: a.casos + summary.totalCases,
      sinAsignar: a.sinAsignar + summary.classification.UNASSIGNED,
      porRevisar: a.porRevisar + summary.classification.PENDING_REVIEW,
      retenidos: a.retenidos + summary.classification.HOLD,
      firmados: a.firmados + summary.classification.SIGNED,
      // Categorías que normalmente valen cero. Se muestran SÓLO si no lo valen:
      // esconderlas fue lo que dejó expedientes fuera de todas las cuentas.
      enFirma: a.enFirma + summary.classification.SIGNING,
      falloFirma: a.falloFirma + summary.classification.SIGNING_FAILED,
      sinInforme: a.sinInforme + summary.classification.NO_REPORT,
      sinClasificar: a.sinClasificar + summary.classification.UNCLASSIFIED,
    }),
    {
      casos: 0, sinAsignar: 0, porRevisar: 0, retenidos: 0, firmados: 0,
      enFirma: 0, falloFirma: 0, sinInforme: 0, sinClasificar: 0,
    },
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="Casos" valor={tot.casos} />
        <Kpi label="Sin asignar" valor={tot.sinAsignar} />
        <Kpi label="Por revisar" valor={tot.porRevisar} />
        <Kpi label="Retenidos" valor={tot.retenidos} />
        <Kpi label="Firmados" valor={tot.firmados} />
      </div>
      {(tot.enFirma > 0 || tot.falloFirma > 0 || tot.sinInforme > 0 || tot.sinClasificar > 0) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tot.enFirma > 0 && <Kpi label="En firma" valor={tot.enFirma} />}
          {tot.falloFirma > 0 && <Kpi label="Error de firma" valor={tot.falloFirma} />}
          {tot.sinInforme > 0 && <Kpi label="Sin informe" valor={tot.sinInforme} />}
          {tot.sinClasificar > 0 && <Kpi label="Sin clasificar" valor={tot.sinClasificar} />}
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-700">Semanas</h3>
        <div className="overflow-x-auto rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--atm-th)] text-left text-white">
                <th className="px-4 py-2 font-medium">Semana</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Casos</th>
                <th className="px-4 py-2 font-medium">Sin asignar</th>
                <th className="px-4 py-2 font-medium">Firmados</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-zinc-400">Sin semanas todavía.</td></tr>
              )}
              {batches.map(({ batch, summary }) => (
                <tr key={batch.id} className="border-t border-[var(--atm-linea)]">
                  <td className="px-4 py-2 font-medium">{batch.name}</td>
                  <td className="px-4 py-2 text-zinc-500">{batch.status === "OPEN" ? "abierta" : "cerrada"}</td>
                  <td className="px-4 py-2 text-zinc-600">{summary.totalCases}</td>
                  <td className="px-4 py-2 text-zinc-600">{summary.unassignedCases}</td>
                  <td className="px-4 py-2 text-zinc-600">{summary.classification.SIGNED}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-700">Carga de los médicos</h3>
        <div className="overflow-x-auto rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--atm-th)] text-left text-white">
                <th className="px-4 py-2 font-medium">Médico</th>
                <th className="px-4 py-2 font-medium">SIS</th>
                <th className="px-4 py-2 font-medium">Asignados</th>
                <th className="px-4 py-2 font-medium">Por revisar</th>
                <th className="px-4 py-2 font-medium">Retenidos</th>
                <th className="px-4 py-2 font-medium">Firmados</th>
              </tr>
            </thead>
            <tbody>
              {medicos.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-zinc-400">Sin médicos.</td></tr>
              )}
              {medicos.map((m) => (
                <tr key={m.doctorProfileId} className="border-t border-[var(--atm-linea)]">
                  <td className="px-4 py-2">{m.fullName}{!m.assignable && " (inactivo)"}</td>
                  <td className="px-4 py-2 text-zinc-500">{m.professionalCode ?? "—"}</td>
                  <td className="px-4 py-2 text-zinc-600">{m.assignedCases}</td>
                  <td className="px-4 py-2 text-zinc-600">{m.classification.PENDING_REVIEW}</td>
                  <td className="px-4 py-2 text-zinc-600">{m.classification.HOLD || "—"}</td>
                  <td className="px-4 py-2 text-zinc-600">{m.classification.SIGNED}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-4 shadow-sm">
      <p className="text-2xl font-semibold text-zinc-900">{valor}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}
