-- Esquema de la BD para integrar con el backend (PostgreSQL). Referencia de tablas + tipos.
-- Espejo de prisma/schema.prisma. El front NO usa esta BD (consume el backend vía proxy);
-- se conserva como contrato para el equipo de backend.

CREATE TABLE IF NOT EXISTS roles (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE CHECK (codigo IN ('medico', 'calidad', 'admin')),
  nombre TEXT NOT NULL
);

-- En este MVP hay una sola región: `region` es un atributo TEXT, no una tabla.
CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT    NOT NULL,
  correo        TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  rol_id        INTEGER NOT NULL REFERENCES roles(id),
  rut            TEXT,                             -- RUT del profesional
  sis            TEXT    UNIQUE,                   -- código de médico de la Superintendencia de Salud
  region         TEXT,                             -- NULL = alcance nacional (admin)
  firma          TEXT,                             -- TSI-303: data URL PNG/JPG de la firma
  limite_semanal INTEGER NOT NULL DEFAULT 10,      -- máximo de casos que se le pueden asignar por semana
  activo         INTEGER NOT NULL DEFAULT 1,
  creado_en     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- núcleo nacional + configuración institucional (TSI-112)
CREATE TABLE IF NOT EXISTS institution_profile (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  region          TEXT,
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
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  numero              INTEGER NOT NULL UNIQUE,   -- 1..11
  codigo              TEXT    NOT NULL UNIQUE,   -- "Semana 1"
  desde               TEXT    NOT NULL,
  hasta               TEXT    NOT NULL,
  habilitada          INTEGER NOT NULL DEFAULT 0,
  limite_asignaciones INTEGER NOT NULL DEFAULT 40, -- tope de asignaciones disponibles esa semana
  cargada_en          TEXT
);

-- casos.estado (pipeline):   DESCARGADO -> ENVIADO_BOT -> INFORME_RECIBIDO
-- casos.estado_documento:    BORRADOR -> RATIFICADO | MODIFICADO
-- casos.estado_flujo:        EN_REVISION -> COMPLETADO   (coexisten borrador + en_revision)
-- id (Nº de caso interno) + id_tramite (Nº de búsqueda de 8 dígitos que usan los médicos)
CREATE TABLE IF NOT EXISTS casos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  id_tramite       TEXT    NOT NULL UNIQUE,
  semana_id        INTEGER NOT NULL REFERENCES semanas(id),
  region           TEXT,
  medico_id        INTEGER REFERENCES usuarios(id),   -- médico asignado / que resolvió
  solicitante      TEXT    NOT NULL DEFAULT '',
  anio             INTEGER,                           -- año del proceso (feedback: "fecha por año")
  documento_url    TEXT,                              -- único documento de antecedentes del caso (lo trae el backend)
  documento_nombre TEXT,
  estado           TEXT    NOT NULL DEFAULT 'DESCARGADO',
  informe_json     TEXT,
  estado_documento TEXT,
  estado_flujo     TEXT,
  creado_en        TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- casos.medico_id = NULL cuando el caso llega sin asignar; el admin lo asigna a mano.

-- historial de asignaciones (primera asignación de un caso sin médico) — admin
CREATE TABLE IF NOT EXISTS asignaciones (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  caso_id       INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
  medico_id     INTEGER NOT NULL REFERENCES usuarios(id),
  realizada_por INTEGER REFERENCES usuarios(id),
  creado_en     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- historial de reasignaciones de casos entre médicos (admin)
CREATE TABLE IF NOT EXISTS reasignaciones (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  caso_id        INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
  medico_origen  INTEGER REFERENCES usuarios(id),
  medico_destino INTEGER NOT NULL REFERENCES usuarios(id),
  realizada_por  INTEGER REFERENCES usuarios(id),
  creado_en      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- TSI-208: historial de corridas del bot (una fila por envío del admin)
CREATE TABLE IF NOT EXISTS bot_runs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  run              INTEGER NOT NULL,          -- correlativo por administrador
  region           TEXT,
  semanas          TEXT    NOT NULL DEFAULT '', -- "1,2,3"
  encontrados      INTEGER NOT NULL DEFAULT 0,
  descargados      INTEGER NOT NULL DEFAULT 0,
  errores          INTEGER NOT NULL DEFAULT 0,
  duracion_seg     INTEGER NOT NULL DEFAULT 0,
  total_casos      INTEGER NOT NULL DEFAULT 0,
  total_documentos INTEGER NOT NULL DEFAULT 0,
  ok               INTEGER NOT NULL DEFAULT 1,
  detalle          TEXT    NOT NULL DEFAULT '',
  creado_por       INTEGER REFERENCES usuarios(id),
  creado_en        TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- TSI-402 / flujo médico: resolución del informe + firma (PNG/JPG)
CREATE TABLE IF NOT EXISTS resoluciones (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  caso_id            INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
  decision           TEXT    NOT NULL,   -- RATIFICA | MODIFICA
  calificacion_final TEXT,
  campos_modificados TEXT    NOT NULL DEFAULT '{}',
  firma_png          TEXT,               -- data URL de la firma que sube el médico
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
  estado      TEXT    NOT NULL DEFAULT 'ABIERTA',   -- ABIERTA | RESUELTA
  creado_en   TEXT    NOT NULL DEFAULT (datetime('now')),
  resuelta_en TEXT
);

-- TSI-105: estado de los procesos del bot (ingesta y análisis)
CREATE TABLE IF NOT EXISTS automation_procesos (
  proceso        TEXT    PRIMARY KEY,                -- INGEST | ANALYSIS
  estado         TEXT    NOT NULL DEFAULT 'DETENIDO', -- DETENIDO | CORRIENDO | COMPLETADO | ERROR
  iniciado_en    TEXT,
  detenido_en    TEXT,
  encontrados    INTEGER NOT NULL DEFAULT 0,
  procesados     INTEGER NOT NULL DEFAULT 0,          -- descargados (ingest) / analizados (analysis)
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

CREATE INDEX IF NOT EXISTS idx_casos_semana ON casos (semana_id);
CREATE INDEX IF NOT EXISTS idx_casos_flujo ON casos (estado_flujo);
CREATE INDEX IF NOT EXISTS idx_casos_medico ON casos (medico_id);
CREATE INDEX IF NOT EXISTS idx_bot_runs_admin ON bot_runs (creado_por, creado_en);
CREATE INDEX IF NOT EXISTS idx_resoluciones_caso ON resoluciones (caso_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_caso ON devoluciones (caso_id, estado);
CREATE INDEX IF NOT EXISTS idx_reasignaciones_caso ON reasignaciones (caso_id);
CREATE INDEX IF NOT EXISTS idx_asignaciones_caso ON asignaciones (caso_id);
CREATE INDEX IF NOT EXISTS idx_login_intentos_correo ON login_intentos (correo, creado_en);
