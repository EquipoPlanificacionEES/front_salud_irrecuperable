import "server-only";
import { getDb } from "../../BD/db";

// MODELO de la carga del administrador (TSI-206).
// Mock: simula la descarga del BOT registrando Case (`casos`) + CaseDocument (`caso_documentos`).
// Con backend real, esto lo hará el bot y quedará en PostgreSQL.

export interface Semana {
  id: number;
  codigo: string;
  desde: string;
  hasta: string;
  habilitada: number;
  cargada_en: string | null;
  casos: number;
}

export function regionIdPorCodigo(codigo: string | null): number | null {
  if (!codigo) return null;
  const row = getDb().prepare("SELECT id FROM regiones WHERE codigo = ?").get(codigo) as
    | { id: number }
    | undefined;
  return row?.id ?? null;
}

export function listarSemanas(): Semana[] {
  return getDb()
    .prepare(
      `SELECT s.id, s.codigo, s.desde, s.hasta, s.habilitada, s.cargada_en,
              (SELECT COUNT(*) FROM casos c WHERE c.semana_id = s.id) AS casos
       FROM semanas s
       ORDER BY s.desde DESC`,
    )
    .all() as unknown as Semana[];
}

const TIPOS_DOC = ["CEDULA", "IBF", "ISRA", "IVADEC"];
const NOMBRES = ["Rojas", "Muñoz", "Díaz", "Contreras", "Silva", "Torres", "Flores", "Vega"];

export interface ResultadoCarga {
  ok: boolean;
  error?: string;
  semana?: string;
  casosCreados?: number;
  documentosCreados?: number;
}

/** Registra los expedientes de una semana habilitada. Idempotente por `id_tramite`. */
export function registrarCarga(semanaId: number, regionId: number | null): ResultadoCarga {
  const db = getDb();
  const semana = db.prepare("SELECT * FROM semanas WHERE id = ?").get(semanaId) as
    | (Semana & { cargada_en: string | null })
    | undefined;
  if (!semana) return { ok: false, error: "Semana inexistente." };
  if (!semana.habilitada) return { ok: false, error: "La semana no está habilitada para carga." };

  const insCaso = db.prepare(
    `INSERT INTO casos (id_tramite, semana_id, region_id, solicitante, estado)
     VALUES (?, ?, ?, ?, 'DESCARGADO')
     ON CONFLICT(id_tramite) DO NOTHING`,
  );
  const insDoc = db.prepare(
    "INSERT INTO caso_documentos (caso_id, tipo, nombre, url) VALUES (?, ?, ?, ?)",
  );

  let casos = 0;
  let docs = 0;
  db.exec("BEGIN");
  try {
    for (let n = 0; n < 8; n++) {
      const idTramite = `${semana.codigo.replace(/\W/g, "")}-${String(1000 + n)}`;
      const info = insCaso.run(
        idTramite,
        semanaId,
        regionId,
        `Solicitante ${NOMBRES[n % NOMBRES.length]}`,
      );
      if (info.changes === 0) continue; // ya existía
      casos++;
      const casoId = Number(info.lastInsertRowid);
      for (const tipo of TIPOS_DOC) {
        insDoc.run(casoId, tipo, `${tipo}_${idTramite}.pdf`, `mock://drive/${idTramite}/${tipo}`);
        docs++;
      }
    }
    db.prepare("UPDATE semanas SET cargada_en = datetime('now') WHERE id = ?").run(semanaId);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    return { ok: false, error: e instanceof Error ? e.message : "Error en la carga." };
  }

  return {
    ok: true,
    semana: semana.codigo,
    casosCreados: casos,
    documentosCreados: docs,
  };
}
