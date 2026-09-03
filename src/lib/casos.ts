import "server-only";
import { getDb } from "../../BD/db";
import { firmaValida } from "./firma";

// MODELO de casos / informes para las bandejas del médico y del administrador.
// Mock sobre SQLite; el backend expone lo mismo desde PostgreSQL.

export interface CasoLista {
  id: number;
  id_tramite: string;
  solicitante: string;
  estado: string;
  estado_documento: string | null;
  estado_flujo: string | null;
  semana: string;
  creado_en: string;
  devolucion_motivo: string | null;
  decision: string | null;
  calificacion_final: string | null;
}

const SELECT_CASOS = `
  SELECT c.id, c.id_tramite, c.solicitante, c.estado, c.estado_documento, c.estado_flujo,
         s.codigo AS semana, c.creado_en,
         (SELECT d.motivo FROM devoluciones d
          WHERE d.caso_id = c.id AND d.estado = 'ABIERTA'
          ORDER BY d.creado_en DESC LIMIT 1) AS devolucion_motivo,
         (SELECT r.decision FROM resoluciones r WHERE r.caso_id = c.id ORDER BY r.creado_en DESC LIMIT 1) AS decision,
         (SELECT r.calificacion_final FROM resoluciones r WHERE r.caso_id = c.id ORDER BY r.creado_en DESC LIMIT 1) AS calificacion_final
  FROM casos c
  JOIN semanas s ON s.id = c.semana_id
`;

export interface FiltroCasos {
  estado?: string;
  flujo?: string;
  documento?: string;
  decision?: string;
}

export function listarCasos(f: FiltroCasos = {}): CasoLista[] {
  const cond: string[] = [];
  const args: (string | number | null)[] = [];
  if (f.estado) {
    cond.push("c.estado = ?");
    args.push(f.estado);
  }
  if (f.flujo) {
    cond.push("c.estado_flujo = ?");
    args.push(f.flujo);
  }
  if (f.documento) {
    cond.push("c.estado_documento = ?");
    args.push(f.documento);
  }
  if (f.decision) {
    cond.push(
      "EXISTS (SELECT 1 FROM resoluciones r WHERE r.caso_id = c.id AND r.decision = ?)",
    );
    args.push(f.decision);
  }
  const sql =
    SELECT_CASOS +
    (cond.length ? ` WHERE ${cond.join(" AND ")}` : "") +
    " ORDER BY c.creado_en DESC";
  return getDb().prepare(sql).all(...args) as unknown as CasoLista[];
}

export interface CasoDetalle extends CasoLista {
  informe: unknown | null;
  documentos: { tipo: string; nombre: string; url: string }[];
  resolucion: {
    decision: string;
    calificacion_final: string | null;
    campos_modificados: unknown;
    tiene_firma: boolean;
    creado_en: string;
  } | null;
}

export function obtenerCaso(id: number): CasoDetalle | null {
  const db = getDb();
  const base = db.prepare(`${SELECT_CASOS} WHERE c.id = ?`).get(id) as CasoLista | undefined;
  if (!base) return null;

  const raw = db.prepare("SELECT informe_json FROM casos WHERE id = ?").get(id) as {
    informe_json: string | null;
  };
  const documentos = db
    .prepare("SELECT tipo, nombre, url FROM caso_documentos WHERE caso_id = ? ORDER BY tipo")
    .all(id) as unknown as { tipo: string; nombre: string; url: string }[];
  const r = db
    .prepare(
      "SELECT decision, calificacion_final, campos_modificados, firma_png, creado_en FROM resoluciones WHERE caso_id = ? ORDER BY creado_en DESC LIMIT 1",
    )
    .get(id) as
    | {
        decision: string;
        calificacion_final: string | null;
        campos_modificados: string;
        firma_png: string | null;
        creado_en: string;
      }
    | undefined;

  return {
    ...base,
    informe: raw.informe_json ? safeParse(raw.informe_json) : null,
    documentos,
    resolucion: r
      ? {
          decision: r.decision,
          calificacion_final: r.calificacion_final,
          campos_modificados: safeParse(r.campos_modificados) ?? {},
          tiene_firma: !!r.firma_png,
          creado_en: r.creado_en,
        }
      : null,
  };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export interface ResultadoResolucion {
  ok: boolean;
  error?: string;
  idTramite?: string;
  estadoDocumento?: string;
}

/**
 * El médico ratifica o modifica el informe y sube su firma PNG.
 * Deja el caso con estado_documento = RATIFICADO|MODIFICADO y estado_flujo = COMPLETADO.
 * (En producción, ratificación + firma se envían al backend, que fusiona la firma al archivo.)
 */
export function resolverCaso(params: {
  casoId: number;
  medicoId: number;
  decision: "RATIFICA" | "MODIFICA";
  calificacionFinal: string | null;
  campos: Record<string, unknown>;
  firmaPng: string | null;
}): ResultadoResolucion {
  const { casoId, medicoId, decision, calificacionFinal, campos, firmaPng } = params;
  const db = getDb();

  const caso = db
    .prepare("SELECT id, id_tramite, estado_flujo FROM casos WHERE id = ?")
    .get(casoId) as { id: number; id_tramite: string; estado_flujo: string | null } | undefined;
  if (!caso) return { ok: false, error: "Caso inexistente." };
  if (caso.estado_flujo !== "EN_REVISION") {
    return { ok: false, error: "El caso no está en revisión." };
  }
  if (!firmaPng || !firmaValida(firmaPng)) {
    return { ok: false, error: "Debes adjuntar tu firma (PNG o JPG, máx. ~370 KB)." };
  }
  if (decision === "MODIFICA" && (!calificacionFinal || Object.keys(campos).length === 0)) {
    return { ok: false, error: "Indica la calificación final y al menos un campo modificado." };
  }

  const estadoDocumento = decision === "RATIFICA" ? "RATIFICADO" : "MODIFICADO";

  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO resoluciones
        (caso_id, decision, calificacion_final, campos_modificados, firma_png, medico_id, enviado_backend)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    ).run(
      casoId,
      decision,
      calificacionFinal,
      JSON.stringify(decision === "MODIFICA" ? campos : {}),
      firmaPng,
      medicoId,
    );
    db.prepare(
      "UPDATE casos SET estado_documento = ?, estado_flujo = 'COMPLETADO' WHERE id = ?",
    ).run(estadoDocumento, casoId);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    return { ok: false, error: e instanceof Error ? e.message : "Error al resolver." };
  }

  return { ok: true, idTramite: caso.id_tramite, estadoDocumento };
}

// ---- Devolución de Control de calidad (calidad en pausa, se mantiene el flujo) ----

export interface ResultadoDevolucion {
  ok: boolean;
  error?: string;
  idTramite?: string;
}

export function devolverCaso(
  casoId: number,
  motivo: string,
  usuarioId: number,
): ResultadoDevolucion {
  const db = getDb();
  const caso = db.prepare("SELECT id, id_tramite, estado FROM casos WHERE id = ?").get(casoId) as
    | { id: number; id_tramite: string; estado: string }
    | undefined;
  if (!caso) return { ok: false, error: "Caso inexistente." };
  if (caso.estado === "DEVUELTO_MEDICO") {
    return { ok: false, error: "El caso ya está devuelto al médico." };
  }
  const texto = motivo.trim();
  if (texto.length < 10) return { ok: false, error: "El motivo debe tener al menos 10 caracteres." };

  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO devoluciones (caso_id, motivo, creado_por) VALUES (?, ?, ?)").run(
      casoId,
      texto,
      usuarioId,
    );
    db.prepare("UPDATE casos SET estado = 'DEVUELTO_MEDICO' WHERE id = ?").run(casoId);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    return { ok: false, error: e instanceof Error ? e.message : "Error al devolver." };
  }
  return { ok: true, idTramite: caso.id_tramite };
}
