// INVENTARIO de las licencias que el backend publica en `report.licenses`.
//
// AQUÍ NO SE COMPUTA NADA. Los totales oficiales —licencias autorizadas, días
// autorizados, FULME, etapa TPI— salen de `report.document`, que es la
// proyección que el backend compone y la que se imprime. Este módulo sólo
// AGRUPA CADA LICENCIA POR EL ESTADO QUE YA TRAE, para que el médico vea el
// universo hallado y no sólo la parte que computa.
//
// EL DEFECTO QUE LO MOTIVA. La versión anterior clasificaba en dos cubos
// —AUTORIZADA y RECHAZADA— y descartaba en silencio todo lo demás:
//
//   · un expediente con 77 licencias en INDETERMINADO se veía como
//     «Total licencias evaluadas (autorizadas): 0 · Total días: 0», sin rastro
//     de las 77;
//   · en otro con 8 licencias REDUCIDA, esas 8 desaparecían de la pantalla
//     aunque el dominio SÍ suma sus días.
//
// Cero licencias computables no es cero licencias encontradas, y un médico que
// lee «0» donde hay 77 antecedentes está decidiendo sobre un expediente que no
// ha visto. Por eso el censo agrupa por el estado real y no conoce ninguna
// lista blanca de estados: un estado nuevo del dominio aparece con su nombre,
// nunca se cae.

export interface LicenciaBackend {
  folio: string;
  cie10: string;
  startsOn: string | null;
  endsOn: string | null;
  authorizedDays: number | null;
  authorizedDaysKnown: boolean;
  effectiveState: string;
  includedInPeriod: boolean;
  countsForThreshold: boolean;
}

export interface GrupoEstado {
  estado: string;
  etiqueta: string;
  cantidad: number;
}

export interface CensoLicencias {
  /** Cuántas licencias trae el expediente. El universo, computen o no. */
  encontradas: number;
  /** Reparto por `effectiveState`, de mayor a menor. Ningún estado se omite. */
  porEstado: GrupoEstado[];
  /** Las que el backend marcó como computables para el umbral. */
  computables: number;
}

/**
 * Nombre en pantalla de cada estado administrativo. Son términos del dominio
 * —ya en castellano—, no códigos internos: un estado que no esté aquí se
 * muestra tal cual en vez de desaparecer.
 */
export const ESTADO_LICENCIA_LABEL: Record<string, string> = {
  AUTORIZADA: "Autorizadas",
  AUTHORIZED: "Autorizadas",
  REDUCIDA: "Reducidas",
  RECHAZADA: "Rechazadas",
  REJECTED: "Rechazadas",
  PENDIENTE: "Pendientes de resolución",
  INDETERMINADO: "Estado no determinable",
};

export function etiquetaEstado(estado: string): string {
  return ESTADO_LICENCIA_LABEL[estado] ?? estado;
}

/** Igual que `etiquetaEstado` pero en singular, para la fila de una licencia. */
const SINGULAR: Record<string, string> = {
  AUTORIZADA: "Autorizada",
  AUTHORIZED: "Autorizada",
  REDUCIDA: "Reducida",
  RECHAZADA: "Rechazada",
  REJECTED: "Rechazada",
  PENDIENTE: "Pendiente de resolución",
  INDETERMINADO: "No determinable",
};

export function etiquetaEstadoSingular(estado: string): string {
  return SINGULAR[estado] ?? estado;
}

export function censarLicencias(licencias: readonly LicenciaBackend[]): CensoLicencias | null {
  if (!licencias || licencias.length === 0) return null;

  const conteo = new Map<string, number>();
  for (const l of licencias) conteo.set(l.effectiveState, (conteo.get(l.effectiveState) ?? 0) + 1);

  const porEstado = [...conteo.entries()]
    .map(([estado, cantidad]) => ({ estado, etiqueta: etiquetaEstado(estado), cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta));

  return {
    encontradas: licencias.length,
    porEstado,
    computables: licencias.filter((l) => l.countsForThreshold).length,
  };
}

/** Período de una licencia, tal como lo entrega el backend. Sin inventar fechas. */
export function periodoLicencia(l: LicenciaBackend): string {
  if (l.startsOn && l.endsOn) return `${l.startsOn} a ${l.endsOn}`;
  return l.startsOn ?? l.endsOn ?? "sin fecha";
}

/**
 * Días autorizados de UNA licencia, verbatim. Cuando el backend dice que no los
 * conoce, se dice; no se imprime un cero que pueda leerse como «ningún día».
 */
export function diasLicencia(l: LicenciaBackend): string {
  if (!l.authorizedDaysKnown || l.authorizedDays === null) return "no consta";
  return `${l.authorizedDays}`;
}
