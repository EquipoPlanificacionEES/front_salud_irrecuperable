"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ApiFallo } from "@/lib/api";
import { useDoctorInbox, usePrefetchCaseReport } from "@/lib/queries";
import { iniciarRevision } from "@/lib/inicio-revision";
import { BandejaSkeleton, Refrescando } from "@/components/Skeleton";
import {
  ORIENTATION_LABEL,
  PESTAÑA_POR_CATEGORIA,
  type OperationalCase,
  type PestañaBandeja,
  type ReportWorkflowStatus,
} from "@/lib/backend";

// GET /api/v1/inbox → los casos con asignación ACTIVA al médico que llama.
//
// TRES PESTAÑAS Y NINGÚN HUECO. Antes eran dos —pendientes e histórico— y el
// backend retiraba de la lista los expedientes retenidos: la bandeja sumaba 90
// y el panel del administrador decía 93, con tres casos que no aparecían en
// ninguna parte. Ahora vienen todos, cada uno con su categoría ya resuelta, y
// aquí sólo se reparten. La pestaña de cada categoría la decide
// `PESTAÑA_POR_CATEGORIA`, espejo de la regla del dominio: no se deduce del
// estado del informe ni de si hay retención.

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
/** Un expediente retenido lo dice él, no su informe: puede no tener ninguno. */
const RETENIDO = { texto: "Retenido", clase: "bg-amber-50 text-[var(--atm-obs)]" };

export function Bandeja() {
  // La MISMA consulta que alimenta el resumen y el respaldo de la ficha. Quien
  // llegue segundo dentro de la ventana de frescura no vuelve a pedir 82,5 KB.
  const { data, error: fallo, isPending, isFetching } = useDoctorInbox();
  const prefetchInforme = usePrefetchCaseReport();

  // Estado de INTERFAZ, que no es estado de servidor y por eso sigue aquí.
  const [tab, setTab] = useState<PestañaBandeja>("pendientes");
  const [buscar, setBuscar] = useState("");
  /**
   * EL ÁMBITO ELEGIDO. `null` = todos.
   *
   * Un profesional puede llevar dos contratos con un solo perfil, y su bandeja
   * los trae juntos: lo que autoriza a ver un expediente es que se le haya
   * asignado, no dónde esté mirando. Esto separa la lista sin pedirle nada al
   * servidor.
   */
  const [region, setRegion] = useState<string | null>(null);

  const casos = useMemo(() => data ?? [], [data]);
  const error = fallo
    ? fallo instanceof ApiFallo
      ? fallo.message
      : "No se pudo cargar la bandeja."
    : null;

  const pestañaDe = (c: OperationalCase) => PESTAÑA_POR_CATEGORIA[c.classification];

  // Las tres pestañas salen de esta misma lista: cambiar de pestaña no pide
  // nada al servidor, y no debe empezar a hacerlo.
  /** Etiqueta del ámbito: la región cuando consta, el contrato si no. */
  const ambitoDe = (c: OperationalCase) => c.scope?.regionName ?? c.scope?.contractCode ?? "Sin ámbito";

  /**
   * Los ámbitos que aparecen SALEN DE SUS CASOS, no de una lista fija: un
   * médico no tiene por qué ver el nombre de una región en la que no trabaja.
   */
  const ambitos = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const c of casos) cuenta.set(ambitoDe(c), (cuenta.get(ambitoDe(c)) ?? 0) + 1);
    return [...cuenta.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [casos]);

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return casos
      .filter((c) => pestañaDe(c) === tab)
      .filter((c) => region === null || ambitoDe(c) === region)
      .filter((c) => !q || c.externalCaseId.toLowerCase().includes(q));
  }, [casos, tab, buscar, region]);

  const cuantos = (p: PestañaBandeja) =>
    casos.filter((c) => pestañaDe(c) === p).filter((c) => region === null || ambitoDe(c) === region).length;
  const nPend = cuantos("pendientes");
  const nRet = cuantos("retenidos");
  const nHist = cuantos("historico");
  // Los que ESPERAN SU PRONUNCIAMIENTO, que no es lo mismo que «pendientes»:
  // ahí van también los que está firmando y los que fallaron al emitirse.
  const porRevisar = casos.filter((c) => c.classification === "PENDING_REVIEW").length;

  // Sólo la PRIMERA carga enseña esqueleto. Un refresco posterior mantiene la
  // tabla en pantalla y lo dice con `Refrescando`.
  if (isPending) return <BandejaSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-[var(--atm-linea)] bg-white p-0.5">
          {(
            [
              ["pendientes", `Pendientes (${nPend})`],
              // La pestaña sólo aparece cuando hay algo retenido: una pestaña
              // vacía y permanente enseña a ignorarla.
              ...(nRet > 0 ? ([["retenidos", `Retenidos (${nRet})`]] as const) : []),
              ["historico", `Histórico (${nHist})`],
            ] as const
          ).map(([p, etiqueta]) => (
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
        {/* SÓLO CON MÁS DE UN ÁMBITO. Un único botón «Valparaíso» junto a
            «Todas» no separa nada y ocupa la fila de las pestañas que sí. */}
        {ambitos.length > 1 && (
          <div className="flex rounded-lg border border-[var(--atm-linea)] bg-white p-0.5">
            {([[null, `Todas (${casos.length})`] as const] as readonly (readonly [string | null, string])[])
              .concat(ambitos.map(([nombre, n]) => [nombre, `${nombre} (${n})`] as const))
              .map(([valor, etiqueta]) => (
                <button
                  key={valor ?? "todas"}
                  onClick={() => setRegion(valor)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    region === valor ? "bg-[var(--atm-azul)] text-white" : "text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
          </div>
        )}
        <Refrescando visible={isFetching} />
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
              {/* El ámbito del expediente. Ver `scope` en `OperationalCase`:
                  un mismo médico puede llevar dos contratos con un solo perfil,
                  y la fila tiene que decir de cuál es. */}
              <th className="px-4 py-2.5 font-medium">Ámbito</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
              <th className="px-4 py-2.5 font-medium">Orientación</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-zinc-400">
                  {buscar
                    ? "Ningún caso de esta lista coincide con la búsqueda."
                    : tab === "pendientes"
                      ? "No tienes casos pendientes."
                      : tab === "retenidos"
                        ? "No tienes casos retenidos."
                        : "Todavía no has cerrado ningún caso."}
                </td>
              </tr>
            )}
            {filtrados.map((c) => {
              // La retención manda sobre el estado del informe: es la razón por
              // la que el expediente está parado, y es lo que hay que leer.
              const chip =
                c.classification === "HOLD" ? RETENIDO : c.report ? CHIP[c.report.workflowStatus] : SIN_INFORME;
              return (
                <tr key={c.caseId} className="border-t border-[var(--atm-linea)] hover:bg-[var(--atm-fondo)]">
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-800">{c.externalCaseId}</td>
                  {/* La región cuando consta; si no, el contrato. Nunca un
                      nombre inventado para rellenar la columna. */}
                  <td className="px-4 py-2.5 text-xs text-zinc-600">
                    {c.scope?.regionName ?? c.scope?.contractCode ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${chip.clase}`}>{chip.texto}</span>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600">
                    {c.report?.orientationAssessment ? ORIENTATION_LABEL[c.report.orientationAssessment] : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {/* SIEMPRE se puede abrir. Un retenido sin informe también:
                        la ficha muestra entonces la vista mínima con el motivo
                        y los antecedentes, que es justamente lo que el médico
                        necesita para entender por qué no puede hacer nada. */}
                    {c.report || c.classification === "HOLD" ? (
                      <Link
                        href={`/mis-tramites/${c.caseId}`}
                        // Sólo el expediente sobre el que ya hay intención. Traer
                        // los 93 informes por si acaso serían 93 peticiones para
                        // abrir uno.
                        onMouseEnter={() => prefetchInforme(c.caseId)}
                        onFocus={() => prefetchInforme(c.caseId)}
                        // «Revisar» declara el inicio de la revisión médica (una
                        // vez por asignación, en el servidor). No bloquea: la
                        // navegación sigue aunque la medición falle. «Ver» —el
                        // histórico— no inicia nada.
                        onClick={tab === "pendientes" ? () => void iniciarRevision(c.caseId) : undefined}
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
