import "server-only";
import { getDb } from "../../BD/db";

// TSI-206 / TSI-208 — El admin selecciona semanas (1..11, solo las que ya llegaron),
// empaqueta los expedientes descargados y los envía al bot del backend.
// El bot procesa y devuelve un informe por caso (mock: se genera acá).

export interface SemanaProcesable {
  id: number;
  numero: number;
  codigo: string;
  habilitada: number;
  listos: number; // casos DESCARGADO en esa semana
}

export function semanasProcesables(): SemanaProcesable[] {
  return getDb()
    .prepare(
      `SELECT s.id, s.numero, s.codigo, s.habilitada,
              (SELECT COUNT(*) FROM casos c WHERE c.semana_id = s.id AND c.estado = 'DESCARGADO') AS listos
       FROM semanas s
       ORDER BY s.numero`,
    )
    .all() as unknown as SemanaProcesable[];
}

export interface DocumentoPaquete {
  tipo: string;
  nombre: string;
  url: string;
}
export interface CasoPaquete {
  id_tramite: string;
  solicitante: string;
  semana: string;
  region: string | null;
  documentos: DocumentoPaquete[];
}
export interface Paquete {
  generado_en: string;
  semanas: number[];
  total_casos: number;
  total_documentos: number;
  casos: CasoPaquete[];
}

interface FilaCaso {
  id: number;
  id_tramite: string;
  solicitante: string;
  semana: string;
  semana_numero: number;
  region: string | null;
}

function filasListas(semanaNumeros?: number[]): FilaCaso[] {
  const db = getDb();
  let filas = db
    .prepare(
      `SELECT c.id, c.id_tramite, c.solicitante, s.codigo AS semana, s.numero AS semana_numero,
              g.codigo AS region
       FROM casos c
       JOIN semanas s ON s.id = c.semana_id
       LEFT JOIN regiones g ON g.id = c.region_id
       WHERE c.estado = 'DESCARGADO' AND s.habilitada = 1
       ORDER BY s.numero, c.creado_en`,
    )
    .all() as unknown as FilaCaso[];
  if (semanaNumeros && semanaNumeros.length) {
    const set = new Set(semanaNumeros);
    filas = filas.filter((f) => set.has(f.semana_numero));
  }
  return filas;
}

/** GET: arma el paquete con los expedientes listos de las semanas indicadas. */
export function armarPaquete(semanaNumeros?: number[]): Paquete {
  const db = getDb();
  const filas = filasListas(semanaNumeros);
  const docStmt = db.prepare(
    "SELECT tipo, nombre, url FROM caso_documentos WHERE caso_id = ? ORDER BY tipo",
  );
  let totalDocs = 0;
  const casos: CasoPaquete[] = filas.map((f) => {
    const documentos = docStmt.all(f.id) as unknown as DocumentoPaquete[];
    totalDocs += documentos.length;
    return {
      id_tramite: f.id_tramite,
      solicitante: f.solicitante,
      semana: f.semana,
      region: f.region,
      documentos,
    };
  });
  return {
    generado_en: new Date().toISOString(),
    semanas: [...new Set(filas.map((f) => f.semana_numero))].sort((a, b) => a - b),
    total_casos: casos.length,
    total_documentos: totalDocs,
    casos,
  };
}

// Informe mock que "devuelve" el bot para cada caso (TSI-302 — secciones de la ficha).
function informeMock(f: FilaCaso) {
  const pct = 25 + ((f.id * 7) % 60);
  const grado = pct >= 50 ? "GRAVE" : pct >= 30 ? "MODERADO" : "LEVE";
  const rut = `${10 + (f.id % 15)}.${100 + (f.id % 900)}.${(f.id * 3) % 999}-${f.id % 10}`;
  return {
    generado_en: new Date().toISOString(),
    identificacion: {
      rut,
      nombre: f.solicitante,
      edad: 30 + (f.id % 40),
      sexo: f.id % 2 ? "F" : "M",
      prevision: f.id % 3 ? "FONASA" : "ISAPRE",
      comuna: f.region ?? "—",
    },
    documentos: [
      { tipo: "CEDULA", estado: "OK" },
      { tipo: "IBF", estado: "OK" },
      { tipo: "ISRA", estado: "OK" },
      { tipo: "IVADEC", estado: f.id % 4 ? "OK" : "ILEGIBLE" },
    ],
    antecedentes: {
      morbidos: "Lumbago crónico, HTA en tratamiento",
      quirurgicos: "Apendicectomía (2015)",
      familiares: "Madre diabética",
      habitos: "No fumador",
    },
    licencias: [
      { folio: `${20000 + f.id}`, desde: "2026-06-01", hasta: "2026-06-30", dias: 30, diagnostico: "M54.5" },
      { folio: `${20001 + f.id}`, desde: "2026-07-01", hasta: "2026-07-20", dias: 20, diagnostico: "M54.5" },
    ],
    fulme: { puntaje: 40 + (f.id % 30), categoria: grado, fecha: "2026-07-25" },
    tpi: { dias_estimados: 180 + (f.id % 120), observacion: "Rehabilitación kinésica en curso" },
    examenes: [
      { nombre: "RM columna lumbar", fecha: "2026-05-10", resultado: "Protrusión L4-L5" },
      { nombre: "EMG", fecha: "2026-06-02", resultado: "Radiculopatía L5 leve" },
    ],
    alertas:
      f.id % 4
        ? [{ tipo: "COHERENCIA", detalle: "Edad IVADEC desactualizada", severidad: "BAJA" }]
        : [
            { tipo: "DOCUMENTO", detalle: "IVADEC ilegible", severidad: "ALTA" },
            { tipo: "DIAGNOSTICO", detalle: "Discrepancia origen visual vs músculoesquelético", severidad: "MEDIA" },
          ],
    cruces: [
      { fuente: "Registro Civil", resultado: "RUT válido, sin defunción" },
      { fuente: "SUSESO licencias", resultado: `${2 + (f.id % 4)} licencias en 12 meses` },
      { fuente: "AFC (cesantía)", resultado: "Sin cobros activos" },
    ],
    propuesta: {
      diagnostico_principal: "Trastorno musculoesquelético crónico",
      diagnosticos_secundarios: ["Hipertensión arterial"],
      origen: "ENFERMEDAD_COMUN",
      porcentaje_sugerido: pct,
      grado,
    },
    informe: {
      resumen:
        "Informe sugerido por el motor a partir de IBF/ISRA/IVADEC. El médico debe ratificar o modificar.",
    },
  };
}

export interface ResultadoEnvio {
  ok: boolean;
  error?: string;
  destino?: string;
  run?: number;
  casosEnviados?: number;
  documentosEnviados?: number;
}

/** POST: envía el paquete al bot, registra la corrida (TSI-208) y simula la llegada del informe. */
export async function enviarAlBot(
  semanaNumeros: number[] | undefined,
  usuarioId: number,
  regionId: number | null,
): Promise<ResultadoEnvio> {
  const db = getDb();
  const filas = filasListas(semanaNumeros);
  if (filas.length === 0) {
    return { ok: false, error: "No hay expedientes listos en las semanas seleccionadas." };
  }
  const paquete = armarPaquete(semanaNumeros);

  const botUrl = process.env.BOT_URL?.trim();
  const destino = botUrl || "MOCK";
  let ok = true;
  let detalle = "Simulado: sin BOT_URL configurado.";
  if (botUrl) {
    try {
      const res = await fetch(botUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paquete),
      });
      ok = res.ok;
      detalle = `HTTP ${res.status}`;
    } catch (e) {
      ok = false;
      detalle = e instanceof Error ? e.message : "Error de red al contactar el bot.";
    }
  }

  const prevRun = db
    .prepare("SELECT COALESCE(MAX(run), 0) AS r FROM bot_runs WHERE creado_por = ?")
    .get(usuarioId) as { r: number };
  const run = prevRun.r + 1;
  const errores = ok ? 0 : filas.length;
  const descargados = ok ? filas.length : 0;
  const duracion = 20 + filas.length * 3;

  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO bot_runs
        (run, region_id, semanas, encontrados, descargados, errores, duracion_seg,
         total_casos, total_documentos, destino, ok, detalle, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      run,
      regionId,
      paquete.semanas.join(","),
      filas.length,
      descargados,
      errores,
      duracion,
      paquete.total_casos,
      paquete.total_documentos,
      destino,
      ok ? 1 : 0,
      detalle,
      usuarioId,
    );

    if (ok) {
      const marcar = db.prepare(
        `UPDATE casos
         SET estado = 'INFORME_RECIBIDO', informe_json = ?,
             estado_documento = 'BORRADOR', estado_flujo = 'EN_REVISION'
         WHERE id = ?`,
      );
      for (const f of filas) marcar.run(JSON.stringify(informeMock(f)), f.id);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    return { ok: false, error: e instanceof Error ? e.message : "Error al registrar el envío." };
  }

  if (!ok) return { ok: false, error: `El bot rechazó el paquete (${detalle}).`, destino, run };
  return {
    ok: true,
    destino,
    run,
    casosEnviados: paquete.total_casos,
    documentosEnviados: paquete.total_documentos,
  };
}

export interface CorridaBot {
  id: number;
  run: number;
  region: string | null;
  encontrados: number;
  descargados: number;
  errores: number;
  duracion_seg: number;
  usuario: string;
  creado_en: string;
  semanas: string;
}

/** TSI-208 — historial de corridas del bot del propio administrador. */
export function historialBot(usuarioId: number): CorridaBot[] {
  return getDb()
    .prepare(
      `SELECT b.id, b.run, g.codigo AS region, b.encontrados, b.descargados, b.errores,
              b.duracion_seg, u.nombre AS usuario, b.creado_en, b.semanas
       FROM bot_runs b
       LEFT JOIN regiones g ON g.id = b.region_id
       LEFT JOIN usuarios u ON u.id = b.creado_por
       WHERE b.creado_por = ?
       ORDER BY b.creado_en DESC`,
    )
    .all(usuarioId) as unknown as CorridaBot[];
}
