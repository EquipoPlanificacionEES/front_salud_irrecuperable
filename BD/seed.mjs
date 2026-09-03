// Crea BD/app.db (SQLite) desde BD/schema.sql y siembra los usuarios base.
// Utilidad de referencia para el equipo de backend — el front NO usa esta BD.
// Uso:  npm run db:init
import { DatabaseSync } from "node:sqlite";
import { rmSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

const root = process.cwd();
const DB_PATH = path.join(root, process.env.DB_PATH ?? "BD/app.db");
const SCHEMA = readFileSync(path.join(root, "BD", "schema.sql"), "utf8");

// Semana actual del proceso (van 5 de 11).
const SEMANA_ACTUAL = 5;
const TOTAL_SEMANAS = 11;

for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`, `${DB_PATH}-journal`]) {
  if (existsSync(f)) rmSync(f);
}

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");
db.exec(SCHEMA);

const roles = [
  { codigo: "medico", nombre: "Médico" },
  { codigo: "calidad", nombre: "Control de calidad" },
  { codigo: "admin", nombre: "Administrador" },
];
const insRol = db.prepare("INSERT INTO roles (codigo, nombre) VALUES (?, ?)");
for (const r of roles) insRol.run(r.codigo, r.nombre);

// Una sola región en este MVP: atributo TEXT, no tabla.
const REGION = "RM";

const idRol = (c) => db.prepare("SELECT id FROM roles WHERE codigo = ?").get(c).id;

const insProf = db.prepare(
  "INSERT INTO institution_profile (region, nombre, nucleo_nacional) VALUES (?, ?, ?)",
);
insProf.run(null, "Núcleo Nacional", 1);
insProf.run(REGION, `Perfil ${REGION}`, 0);

const usuarios = [
  { nombre: "Dra. Médico Demo", correo: "medico@salud.local", rol: "medico", region: REGION, pass: "Medico2026#" },
  { nombre: "Analista Calidad Demo", correo: "calidad@salud.local", rol: "calidad", region: REGION, pass: "Calidad2026#" },
  { nombre: "Administrador Demo", correo: "admin@salud.local", rol: "admin", region: null, pass: "Admin2026#" },
];
const insUser = db.prepare(
  "INSERT INTO usuarios (nombre, correo, password_hash, rol_id, region) VALUES (?, ?, ?, ?, ?)",
);
for (const u of usuarios) {
  insUser.run(u.nombre, u.correo, bcrypt.hashSync(u.pass, 12), idRol(u.rol), u.region);
  console.log(`  ✓ ${u.rol.padEnd(8)} ${u.correo.padEnd(22)} region=${u.region ?? "—"}  (pass: ${u.pass})`);
}

// Semanas 1..11. Habilitadas las que ya llegaron (<= SEMANA_ACTUAL).
const insSem = db.prepare(
  "INSERT INTO semanas (numero, codigo, desde, hasta, habilitada) VALUES (?, ?, ?, ?, ?)",
);
const base = new Date(Date.UTC(2026, 0, 5)); // lunes 5-ene-2026 = Semana 1
for (let n = 1; n <= TOTAL_SEMANAS; n++) {
  const desde = new Date(base);
  desde.setUTCDate(base.getUTCDate() + (n - 1) * 7);
  const hasta = new Date(desde);
  hasta.setUTCDate(desde.getUTCDate() + 6);
  insSem.run(
    n,
    `Semana ${n}`,
    desde.toISOString().slice(0, 10),
    hasta.toISOString().slice(0, 10),
    n <= SEMANA_ACTUAL ? 1 : 0,
  );
}

// Procesos del bot (TSI-105) en estado detenido.
const insProc = db.prepare("INSERT INTO automation_procesos (proceso) VALUES (?)");
insProc.run("INGEST");
insProc.run("ANALYSIS");

console.log(
  `\n  roles: ${roles.length} · región: ${REGION} · semanas: ${TOTAL_SEMANAS} (1..${SEMANA_ACTUAL} habilitadas)`,
);
console.log("BD lista en", DB_PATH);
db.close();
