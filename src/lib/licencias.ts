// Agrupa el detalle de licencias que manda el backend (datos duros) en el
// desglose por año que va en el informe. La misma lógica la usan la ficha del
// médico y el PDF que genera el navegador.

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

const AUTORIZA = new Set(["AUTORIZADA", "AUTHORIZED", "AUTORIZADA_POR_SUSESO", "AUTORIZADA_SUSESO"]);
const RECHAZA = new Set(["RECHAZADA", "REJECTED"]);

export interface GrupoDiagnostico {
  cie10: string;
  cantidad: number;
  dias: number;
  diasCompletos: boolean;
}
export interface AnioLicencias {
  anio: string;
  total: number;
  dias: number;
  diasCompletos: boolean;
  porDiagnostico: GrupoDiagnostico[];
}
export interface DesgloseLicencias {
  periodo: string | null;
  porAnio: AnioLicencias[];
  totalAutorizadas: number;
  totalDiasAutorizados: number;
  totalDiasCompletos: boolean;
  rechazadas: { folio: string; cie10: string; dias: number; periodo: string }[];
}

export const CIE10_DESC: Record<string, string> = {
  "F43.1": "Trastorno de estrés postraumático", "F43": "Reacción al estrés grave",
  "F32.1": "Episodio depresivo moderado", "F32.9": "Episodio depresivo no especificado",
  "F41.9": "Trastorno de ansiedad no especificado",
  "M54.4": "Lumbago con ciática", "J20": "Bronquitis aguda", "J00": "Rinofaringitis aguda",
  "J01.4": "Pansinusitis aguda", "J11.8": "Influenza", "B34.1": "Infección por enterovirus",
  "K29.9": "Gastroduodenitis", "A09": "Diarrea y gastroenteritis", "G50.0": "Neuralgia del trigémino",
  "I87.2": "Insuficiencia venosa crónica periférica",
};
export const descDx = (cie10: string): string => CIE10_DESC[cie10] ?? "";

const anioDe = (f: string | null) => (f && /^\d{4}/.test(f) ? f.slice(0, 4) : "Sin fecha");

export function desglosarLicencias(licencias: LicenciaBackend[]): DesgloseLicencias | null {
  if (!licencias || licencias.length === 0) return null;

  const autorizadas = licencias.filter((l) => AUTORIZA.has(l.effectiveState));
  const rechazadas = licencias
    .filter((l) => RECHAZA.has(l.effectiveState))
    .map((l) => ({
      folio: l.folio,
      cie10: l.cie10,
      dias: l.authorizedDays ?? 0,
      periodo: l.startsOn && l.endsOn ? `${l.startsOn} a ${l.endsOn}` : (l.startsOn ?? "—"),
    }));

  const mapa = new Map<string, AnioLicencias>();
  for (const l of autorizadas) {
    const anio = anioDe(l.startsOn);
    const grupo = mapa.get(anio) ?? { anio, total: 0, dias: 0, diasCompletos: true, porDiagnostico: [] };
    grupo.total += 1;
    grupo.dias += l.authorizedDays ?? 0;
    if (!l.authorizedDaysKnown) grupo.diasCompletos = false;

    const dx = grupo.porDiagnostico.find((d) => d.cie10 === l.cie10);
    if (dx) {
      dx.cantidad += 1;
      dx.dias += l.authorizedDays ?? 0;
      if (!l.authorizedDaysKnown) dx.diasCompletos = false;
    } else {
      grupo.porDiagnostico.push({ cie10: l.cie10, cantidad: 1, dias: l.authorizedDays ?? 0, diasCompletos: l.authorizedDaysKnown });
    }
    mapa.set(anio, grupo);
  }

  const porAnio = [...mapa.values()].sort((a, b) => a.anio.localeCompare(b.anio));
  for (const a of porAnio) a.porDiagnostico.sort((x, y) => y.cantidad - x.cantidad || x.cie10.localeCompare(y.cie10));

  const anios = porAnio.map((a) => a.anio).filter((a) => a !== "Sin fecha");
  const periodo = anios.length ? `${anios[0]}–${anios[anios.length - 1]}` : null;

  const totalDiasAutorizados = porAnio.reduce((s, a) => s + a.dias, 0);
  const totalDiasCompletos = autorizadas.every((l) => l.authorizedDaysKnown);

  return {
    periodo,
    porAnio,
    totalAutorizadas: autorizadas.length,
    totalDiasAutorizados,
    totalDiasCompletos,
    rechazadas,
  };
}

/** Frase por año: "Durante 2024: 5 licencias autorizadas — F32.1 Episodio depresivo (×3)… Total 42 días." */
export function fraseAnio(a: AnioLicencias, diag: (cie10: string) => string): string {
  const partes = a.porDiagnostico.map((d) => `${d.cie10} ${diag(d.cie10)}${d.cantidad > 1 ? ` (×${d.cantidad})` : ""}`);
  const dias = a.diasCompletos ? `${a.dias} día(s)` : `≥ ${a.dias} día(s)`;
  return `Durante ${a.anio}: ${a.total} licencia(s) autorizada(s) — ${partes.join("; ")}. Total ${dias}.`;
}
