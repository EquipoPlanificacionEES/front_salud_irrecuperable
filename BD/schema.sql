-- BD mock del front (SQLite). Contrato de tablas para el backend (PostgreSQL + Prisma, TSI-102).
-- Mantener en sync con prisma/schema.prisma y BD/db.ts.

CREATE TABLE IF NOT EXISTS roles (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE CHECK (codigo IN ('medico', 'calidad', 'admin')),
  nombre TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS regiones (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,   -- RM, OHIGGINS, BIOBIO, ANTOFAGASTA
  nombre TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT    NOT NULL,
  correo        TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  rol_id        INTEGER NOT NULL REFERENCES roles(id),
  region_id     INTEGER REFERENCES regiones(id),   -- NULL = alcance nacional (admin)
  firma         TEXT,                              -- TSI-303: data URL PNG/JPG de la firma
  activo        INTEGER NOT NULL DEFAULT 1,
  creado_en     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- núcleo nacional + configuración institucional (TSI-112)
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

-- Semanas 1..11 del proceso
CREATE TABLE IF NOT EXISTS semanas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  numero     INTEGER NOT NULL UNIQUE,
  codigo     TEXT    NOT NULL UNIQUE,
  desde      TEXT    NOT NULL,
  hasta      TEXT    NOT NULL,
  habilitada INTEGER NOT NULL DEFAULT 0,
  cargada_en TEXT
);

-- casos.estado (pipeline):   DESCARGADO -> ENVIADO_BOT -> INFORME_RECIBIDO
-- casos.estado_documento:    BORRADOR -> RATIFICADO | MODIFICADO
-- casos.estado_flujo:        EN_REVISION -> COMPLETADO
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
  tipo      TEXT    NOT NULL,   -- CEDULA | IBF | ISRA | IVADEC
  nombre    TEXT    NOT NULL DEFAULT '',
  url       TEXT    NOT NULL DEFAULT '',
  creado_en TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- TSI-208: historial de corridas del bot
CREATE TABLE IF NOT EXISTS bot_runs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  run              INTEGER NOT NULL,
  region_id        INTEGER REFERENCES regiones(id),
  semanas          TEXT    NOT NULL DEFAULT '',
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

-- TSI-402 / flujo médico: resolución del informe + firma PNG
CREATE TABLE IF NOT EXISTS resoluciones (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  caso_id            INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
  decision           TEXT    NOT NULL,   -- RATIFICA | MODIFICA
  calificacion_final TEXT,
  campos_modificados TEXT    NOT NULL DEFAULT '{}',
  firma_png          TEXT,
  medico_id          INTEGER REFERENCES usuarios(id),
  enviado_backend    INTEGER NOT NULL DEFAULT 0,
  creado_en          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Devoluciones de Control de calidad hacia el médico (calidad en pausa por ahora)
CREATE TABLE IF NOT EXISTS devoluciones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  caso_id     INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
  motivo      TEXT    NOT NULL,
  creado_por  INTEGER REFERENCES usuarios(id),
  estado      TEXT    NOT NULL DEFAULT 'ABIERTA',
  creado_en   TEXT    NOT NULL DEFAULT (datetime('now')),
  resuelta_en TEXT
);

-- TSI-105: estado de los procesos del bot (ingesta y análisis). Mock del módulo modules/automation/.
CREATE TABLE IF NOT EXISTS automation_procesos (
  proceso       TEXT    PRIMARY KEY,               -- INGEST | ANALYSIS
  estado        TEXT    NOT NULL DEFAULT 'DETENIDO', -- DETENIDO | CORRIENDO | COMPLETADO | ERROR
  iniciado_en   TEXT,
  detenido_en   TEXT,
  encontrados   INTEGER NOT NULL DEFAULT 0,
  procesados    INTEGER NOT NULL DEFAULT 0,          -- descargados (ingest) / analizados (analysis)
  errores       INTEGER NOT NULL DEFAULT 0,
  actualizado_en TEXT
);

CREATE TABLE IF NOT EXISTS login_intentos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  correo    TEXT    NOT NULL,
  exito     INTEGER NOT NULL,
  ip        TEXT,
  creado_en TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_casos_semana ON casos (semana_id);
CREATE INDEX IF NOT EXISTS idx_casos_flujo ON casos (estado_flujo);
CREATE INDEX IF NOT EXISTS idx_docs_caso ON caso_documentos (caso_id);
CREATE INDEX IF NOT EXISTS idx_bot_runs_admin ON bot_runs (creado_por, creado_en);
CREATE INDEX IF NOT EXISTS idx_resoluciones_caso ON resoluciones (caso_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_caso ON devoluciones (caso_id, estado);
CREATE INDEX IF NOT EXISTS idx_login_intentos_correo ON login_intentos (correo, creado_en);
CREATE INDEX IF NOT EXISTS idx_usuarios_region ON usuarios (region_id);
