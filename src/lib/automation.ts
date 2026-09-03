import "server-only";
import { getDb } from "../../BD/db";

// TSI-105 — Módulo Automation (mock del backend `modules/automation/`).
// Dos procesos del bot: INGEST (descarga expedientes) y ANALYSIS (análisis con IA).
// El progreso se simula a partir del tiempo transcurrido desde el inicio.

export type Proceso = "INGEST" | "ANALYSIS";
export const PROCESOS: Proceso[] = ["INGEST", "ANALYSIS"];

const DURACION_SIMULADA_SEG = 40;

export interface EstadoProceso {
  proceso: Proceso;
  estado: "DETENIDO" | "CORRIENDO" | "COMPLETADO" | "ERROR";
  progreso: number; // 0..100
  encontrados: number;
  procesados: number; // descargados (ingest) / analizados (analysis)
  errores: number;
  iniciado_en: string | null;
}

interface Fila {
  proceso: Proceso;
  estado: EstadoProceso["estado"];
  iniciado_en: string | null;
  encontrados: number;
  procesados: number;
  errores: number;
}

function fila(proceso: Proceso): Fila {
  const db = getDb();
  let row = db.prepare("SELECT * FROM automation_procesos WHERE proceso = ?").get(proceso) as unknown as
    | Fila
    | undefined;
  if (!row) {
    db.prepare("INSERT INTO automation_procesos (proceso) VALUES (?)").run(proceso);
    row = db
      .prepare("SELECT * FROM automation_procesos WHERE proceso = ?")
      .get(proceso) as unknown as Fila;
  }
  return row;
}

/** GET status — avanza el progreso simulado y persiste. */
export function estadoProceso(proceso: Proceso): EstadoProceso {
  const db = getDb();
  const row = fila(proceso);

  if (row.estado === "CORRIENDO" && row.iniciado_en) {
    const elapsed = (Date.now() - Date.parse(row.iniciado_en.replace(" ", "T") + "Z")) / 1000;
    const frac = Math.max(0, Math.min(1, elapsed / DURACION_SIMULADA_SEG));
    const procesados = Math.round(row.encontrados * frac);
    const estado = frac >= 1 ? "COMPLETADO" : "CORRIENDO";
    db.prepare(
      "UPDATE automation_procesos SET procesados = ?, estado = ?, actualizado_en = datetime('now') WHERE proceso = ?",
    ).run(procesados, estado, proceso);
    row.procesados = procesados;
    row.estado = estado;
  }

  const progreso = row.encontrados ? Math.round((row.procesados / row.encontrados) * 100) : 0;
  return {
    proceso,
    estado: row.estado,
    progreso,
    encontrados: row.encontrados,
    procesados: row.procesados,
    errores: row.errores,
    iniciado_en: row.iniciado_en,
  };
}

export function iniciarProceso(proceso: Proceso): EstadoProceso {
  const db = getDb();
  const actual = fila(proceso);
  if (actual.estado === "CORRIENDO") return estadoProceso(proceso);

  const encontrados = 30 + Math.floor(Math.random() * 20);
  db.prepare(
    `UPDATE automation_procesos
     SET estado = 'CORRIENDO', iniciado_en = datetime('now'), detenido_en = NULL,
         encontrados = ?, procesados = 0, errores = 0, actualizado_en = datetime('now')
     WHERE proceso = ?`,
  ).run(encontrados, proceso);
  return estadoProceso(proceso);
}

export function detenerProceso(proceso: Proceso): EstadoProceso {
  estadoProceso(proceso); // refresca procesados antes de congelar
  getDb()
    .prepare(
      "UPDATE automation_procesos SET estado = 'DETENIDO', detenido_en = datetime('now'), actualizado_en = datetime('now') WHERE proceso = ?",
    )
    .run(proceso);
  return estadoProceso(proceso);
}
