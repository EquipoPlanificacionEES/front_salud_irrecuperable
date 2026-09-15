/**
 * ETAPA DEL TPI EN LENGUA — el mismo catálogo que imprime el informe.
 *
 * Espejo EXACTO de `describeTpiStage` en el backend
 * (`packages/domain/src/report/client-format.ts`): el preinforme dice «No» y el
 * editor tiene que decir «No», no `NO_TPI`. Lo que se guarda sigue siendo el
 * código; esto es sólo presentación.
 *
 * Son los cuatro valores de `TpiStage`, y los cuatro existen en producción
 * (NO_TPI, UNKNOWN, IN_PROGRESS, FINAL_EXECUTED). Si el backend añade uno, la
 * prueba de este archivo es la que tiene que cambiar primero.
 */
export const ETAPAS_TPI = {
  NO_TPI: "No",
  IN_PROGRESS: "En trámite",
  FINAL_EXECUTED: "Ejecutoriado",
  UNKNOWN: "No consta en el expediente",
} as const;

export type EtapaTpi = keyof typeof ETAPAS_TPI;

export function esEtapaTpi(valor: string): valor is EtapaTpi {
  return Object.prototype.hasOwnProperty.call(ETAPAS_TPI, valor);
}

/**
 * La etiqueta humana de una etapa. Un valor que no es un código conocido se
 * muestra tal cual —nunca vacío ni inventado—; vacío sigue vacío.
 */
export function describirEtapaTpi(valor: string | null | undefined): string {
  const v = (valor ?? "").trim();
  if (v === "") return "";
  return esEtapaTpi(v) ? ETAPAS_TPI[v] : v;
}
