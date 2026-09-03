import { DatabaseSync } from "node:sqlite";
import path from "node:path";

// Conexión a la BD SQLite. Singleton perezoso: NO se abre al importar el módulo
// (evita choques entre los workers de `next build` que importan las rutas).
// Es un MOCK temporal de la BD del backend (el compañero migra esto a PostgreSQL).

const DB_PATH = path.join(process.cwd(), "BD", "app.db");

// TSI-112 — estructura mínima para poder enviar región / usuario / rol al backend.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS roles (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE CHECK (codigo IN ('medico', 'calidad', 'admin')),
  nombre TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS regiones (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT    NOT NULL,
  correo        TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  rol_id        INTEGER NOT NULL REFERENCES roles(id),
  region_id     INTEGER REFERENCES regiones(id),
  firma         TEXT,
  activo        INTEGER NOT NULL DEFAULT 1,
  creado_en     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS institution_profile (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  region_id       INTEGER REFERENCES regiones(id),
  nombre          TEXT    NOT NULL,
  nucleo_nacional INTEGER NOT NULL DEFAULT 0,
  config_json     TEXT    NOT NULL DEFAULT '{}',
  creado_en       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS institution_rule (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id  INTEGER NOT NULL REFERENCES institution_profile(id),
  codigo      TEXT    NOT NULL,
  descripcion TEXT    NOT NULL DEFAULT '',
  protegida   INTEGER NOT NULL DEFAULT 1,
  valor_json  TEXT    NOT NULL DEFAULT '{}'
);

-- Semanas 1..11 del proceso. habilitada = ya llego su turno (el admin puede procesarla).
CREATE TABLE IF NOT EXISTS semanas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  numero     INTEGER NOT NULL UNIQUE,          -- 1..11
  codigo     TEXT    NOT NULL UNIQUE,          -- "Semana 1"
  desde      TEXT    NOT NULL,
  hasta      TEXT    NOT NULL,
  habilitada INTEGER NOT NULL DEFAULT 0,
  cargada_en TEXT
);

-- casos.estado (pipeline):   DESCARGADO -> ENVIADO_BOT -> INFORME_RECIBIDO
-- casos.estado_documento:    BORRADOR -> RATIFICADO | MODIFICADO
-- casos.estado_flujo:        EN_REVISION -> COMPLETADO
-- (el informe llega con estado_documento='BORRADOR' y estado_flujo='EN_REVISION' a la vez)
CREATE TABLE IF NOT EXISTS casos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  id_tramite       TEXT    NOT NULL UNIQUE,
  semana_id        INTEGER NOT NULL REFERENCES semanas(id),
  region_id        INTEGER REFERENCES regiones(id),
  solicitante      TEXT    NOT NULL DEFAULT '',
  estado           TEXT    NOT NULL DEFAULT 'DESCARGADO',
  informe_json     TEXT,
  estado_documento TEXT,
  estado_flujo     TEXT,
  creado_en        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS caso_documentos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  caso_id   INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
  tipo      TEXT    NOT NULL,
  nombre    TEXT    NOT NULL DEFAULT '',
  url       TEXT    NOT NULL DEFAULT '',
  creado_en TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- TSI-208: historial de corridas del bot (una fila por envío que hace el admin).
CREATE TABLE IF NOT EXISTS bot_runs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  run              INTEGER NOT NULL,           -- correlativo por administrador
  region_id        INTEGER REFERENCES regiones(id),
  semanas          TEXT    NOT NULL DEFAULT '', -- "1,2,3"
  encontrados      INTEGER NOT NULL DEFAULT 0,
  descargados      INTEGER NOT NULL DEFAULT 0,
  errores          INTEGER NOT NULL DEFAULT 0,
  duracion_seg     INTEGER NOT NULL DEFAULT 0,
  total_casos      INTEGER NOT NULL DEFAULT 0,
  total_documentos INTEGER NOT NULL DEFAULT 0,
  destino          TEXT    NOT NULL DEFAULT 'MOCK',
  ok               INTEGER NOT NULL DEFAULT 1,
  detalle          TEXT    NOT NULL DEFAULT '',
  creado_por       INTEGER REFERENCES usuarios(id),
  creado_en        TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- TSI-402 / flujo médico: resolución del informe (ratifica o modifica) + firma PNG.
CREATE TABLE IF NOT EXISTS resoluciones (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  caso_id            INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
  decision           TEXT    NOT NULL,          -- RATIFICA | MODIFICA
  calificacion_final TEXT,
  campos_modificados TEXT    NOT NULL DEFAULT '{}',
  firma_png          TEXT,                      -- data URL base64 (mock; el backend la fusiona al archivo)
  medico_id          INTEGER REFERENCES usuarios(id),
  enviado_backend    INTEGER NOT NULL DEFAULT 0,
  creado_en          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Devoluciones de Control de calidad hacia el médico (calidad en pausa por ahora).
CREATE TABLE IF NOT EXISTS devoluciones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  caso_id     INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
  motivo      TEXT    NOT NULL,
  creado_por  INTEGER REFERENCES usuarios(id),
  estado      TEXT    NOT NULL DEFAULT 'ABIERTA',   -- ABIERTA | RESUELTA
  creado_en   TEXT    NOT NULL DEFAULT (datetime('now')),
  resuelta_en TEXT
);

CREATE INDEX IF NOT EXISTS idx_casos_semana ON casos (semana_id);
CREATE INDEX IF NOT EXISTS idx_casos_flujo ON casos (estado_flujo);
CREATE INDEX IF NOT EXISTS idx_docs_caso ON caso_documentos (caso_id);
CREATE INDEX IF NOT EXISTS idx_bot_runs_admin ON bot_runs (creado_por, creado_en);
CREATE INDEX IF NOT EXISTS idx_resoluciones_caso ON resoluciones (caso_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_caso ON devoluciones (caso_id, estado);

-- TSI-105: estado de los procesos del bot (ingesta y análisis).
CREATE TABLE IF NOT EXISTS automation_procesos (
  proceso        TEXT    PRIMARY KEY,
  estado         TEXT    NOT NULL DEFAULT 'DETENIDO',
  iniciado_en    TEXT,
  detenido_en    TEXT,
  encontrados    INTEGER NOT NULL DEFAULT 0,
  procesados     INTEGER NOT NULL DEFAULT 0,
  errores        INTEGER NOT NULL DEFAULT 0,
  actualizado_en TEXT
);

CREATE TABLE IF NOT EXISTS login_intentos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  correo    TEXT    NOT NULL,
  exito     INTEGER NOT NULL,
  ip        TEXT,
  creado_en TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_intentos_correo ON login_intentos (correo, creado_en);
CREATE INDEX IF NOT EXISTS idx_usuarios_region ON usuarios (region_id);
`;

declare global {
  // eslint-disable-next-line no-var
  var __salud_db: DatabaseSync | undefined;
}

function abrir(): DatabaseSync {
  const database = new DatabaseSync(DB_PATH);
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(SCHEMA);
  return database;
}

/** Devuelve la conexión, abriéndola la primera vez que se usa. */
export function getDb(): DatabaseSync {
  return globalThis.__salud_db ?? (globalThis.__salud_db = abrir());
}
