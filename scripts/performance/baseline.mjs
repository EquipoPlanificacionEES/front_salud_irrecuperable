#!/usr/bin/env node
/**
 * BASELINE DE PERFORMANCE FRONTEND — Salud Irrecuperable.
 *
 * Mide el tráfico que produce el frontend ANTES de TanStack Query, para poder
 * repetir exactamente las mismas pruebas DESPUÉS del refactor.
 *
 * SEGURIDAD, POR CONSTRUCCIÓN:
 *   · Sólo se permiten GET. Cualquier POST/PUT/PATCH/DELETE se ABORTA salvo
 *     /auth/login y /auth/logout, que son la sesión y nada más.
 *   · No hay credenciales en este archivo. Vienen del entorno o de un
 *     storageState que el propio usuario generó.
 *   · No escribe nada en el repositorio ni en la base de datos.
 *
 * USO
 *   BASE_URL=https://front-salud-irrecuperable.vercel.app \
 *   SIR_EMAIL=... SIR_PASSWORD=... \
 *   node baseline.mjs --runs 5 --out ./resultados
 *
 *   # o, sin poner nunca la contraseña en una variable:
 *   node baseline.mjs --login-manual        # abre el navegador, entras tú
 *   node baseline.mjs --state estado.json   # reutiliza esa sesión
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? (process.argv[i + 1]?.startsWith("--") ? true : process.argv[i + 1]) : d;
};
const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const RUNS = Number(arg("runs", 5));
const OUT = resolve(String(arg("out", "./resultados")));
const STATE = arg("state", null);
const MANUAL = arg("login-manual", false) === true;
const ROL = String(arg("rol", "medico"));

const MUTACIONES_PERMITIDAS = [/\/api\/v1\/auth\/login$/, /\/api\/v1\/auth\/logout$/];
let ABORTADAS = 0;

/** Corta cualquier mutación que no sea la sesión. La auditoría es read-only. */
async function blindar(ctx) {
  await ctx.route("**/*", (route) => {
    const req = route.request();
    const m = req.method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
    if (MUTACIONES_PERMITIDAS.some((r) => r.test(req.url()))) return route.continue();
    ABORTADAS++;
    console.error(`  ⛔ ABORTADA mutación no autorizada: ${m} ${req.url()}`);
    return route.abort();
  });
}

const esApi = (u) => u.includes("/api/v1/");
const rutaApi = (u) => {
  const p = new URL(u).pathname.replace(/^\/api\/v1/, "");
  return p
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/{id}")
    .replace(/\/\d{6,}/g, "/{n}");
};

/** Observa TODO el tráfico de una navegación y lo devuelve medido. */
function observador(page) {
  const reqs = new Map();
  const hechos = [];
  const onReq = (r) => reqs.set(r, Date.now());
  const onFin = async (r) => {
    const t0 = reqs.get(r);
    if (t0 == null) return;
    const resp = await r.response().catch(() => null);
    let bytes = 0;
    try {
      const s = await resp?.headerValue("content-length");
      bytes = s ? Number(s) : (await resp?.body().catch(() => null))?.length ?? 0;
    } catch { /* respuesta ya descartada */ }
    hechos.push({
      url: r.url(),
      endpoint: esApi(r.url()) ? rutaApi(r.url()) : null,
      method: r.method(),
      status: resp?.status() ?? 0,
      startedAt: t0,
      durationMs: Date.now() - t0,
      bytes,
      esApi: esApi(r.url()),
    });
  };
  page.on("request", onReq);
  page.on("requestfinished", onFin);
  page.on("requestfailed", onFin);
  return {
    reset: () => (hechos.length = 0),
    cosecha: () => hechos.slice(),
    stop: () => {
      page.off("request", onReq);
      page.off("requestfinished", onFin);
      page.off("requestfailed", onFin);
    },
  };
}

/** Qué selector significa «esta vista ya tiene datos útiles en pantalla». */
const CONTENIDO_UTIL = {
  "/kpi": "text=/Asignados a ti|Semanas|Casos del contrato/",
  "/mis-tramites": "table tbody tr, text=/No hay|sin casos/i",
  "/mi-firma": "text=/firma/i",
  "/admin/semanas": "table tbody tr, text=/No hay/i",
  "/admin/casos": "table tbody tr, text=/No hay/i",
  "/admin/retenidos": "table tbody tr:not(:has-text('Cargando')), text=/No hay expedientes retenidos/",
  "/admin/informes": "table tbody tr, text=/No hay/i",
  "/admin/asignaciones": "select, text=/No hay/i",
  "/admin/reasignacion": "select, text=/No hay/i",
  "/admin/usuarios": "table tbody tr, text=/No hay/i",
  "/quality": "table tbody tr, text=/No hay/i",
};

async function medirNavegacion(page, obs, destino, { via } = {}) {
  obs.reset();
  const t0 = Date.now();
  let tRuta = null;
  if (via === "link") {
    await page.click(via).catch(() => {});
  } else {
    await page.goto(BASE + destino, { waitUntil: "commit" });
  }
  tRuta = Date.now() - t0;

  // Primer feedback visual: el shell (cabecera) ya pintado.
  let tFeedback = null;
  await page.waitForSelector("header", { timeout: 20000 }).then(() => (tFeedback = Date.now() - t0)).catch(() => {});

  // Contenido útil: datos del backend en pantalla.
  const sel = CONTENIDO_UTIL[destino.split("?")[0]] ?? "main";
  let tUtil = null;
  await page.waitForSelector(sel, { timeout: 30000 }).then(() => (tUtil = Date.now() - t0)).catch(() => {});

  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  const tTodo = Date.now() - t0;

  const hechos = obs.cosecha();
  const api = hechos.filter((h) => h.esApi);
  const porEndpoint = {};
  for (const h of api) porEndpoint[h.endpoint] = (porEndpoint[h.endpoint] ?? 0) + 1;
  const duplicados = Object.entries(porEndpoint).filter(([, n]) => n > 1);

  return {
    destino,
    timeToRouteChangeMs: tRuta,
    timeToFirstFeedbackMs: tFeedback,
    timeToUsefulContentMs: tUtil,
    timeToNetworkIdleMs: tTodo,
    totalRequests: hechos.length,
    apiRequests: api.length,
    apiUnicos: Object.keys(porEndpoint).length,
    apiDuplicados: duplicados.map(([e, n]) => ({ endpoint: e, veces: n })),
    transferredBytes: hechos.reduce((a, h) => a + h.bytes, 0),
    apiBytes: api.reduce((a, h) => a + h.bytes, 0),
    llamadas: api.map((h) => ({
      endpoint: h.endpoint, method: h.method, status: h.status,
      durationMs: h.durationMs, bytes: h.bytes, offsetMs: h.startedAt - t0,
    })),
  };
}

const pct = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const resumen = (xs) => ({
  n: xs.length, min: Math.min(...xs), p50: pct(xs, 50), p75: pct(xs, 75),
  p95: pct(xs, 95), max: Math.max(...xs),
});

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: !MANUAL });
  const estado = STATE && existsSync(String(STATE)) ? String(STATE) : undefined;
  const ctx = await browser.newContext({ storageState: estado, viewport: { width: 1440, height: 900 } });
  await blindar(ctx);
  const page = await ctx.newPage();
  const obs = observador(page);

  const salida = { meta: {}, escenarios: {}, endpoints: {} };
  salida.meta = {
    fecha: new Date().toISOString(), baseUrl: BASE, runs: RUNS, rol: ROL,
    userAgent: await page.evaluate(() => navigator.userAgent).catch(() => null),
  };

  // ---- A. LOGIN COLD ------------------------------------------------------
  if (!estado) {
    if (MANUAL) {
      await page.goto(BASE + "/login");
      console.log("\n👉 Inicia sesión TÚ en la ventana abierta. Cuando veas la app, vuelve aquí y pulsa Enter.");
      await new Promise((r) => process.stdin.once("data", r));
    } else {
      const email = process.env.SIR_EMAIL, pass = process.env.SIR_PASSWORD;
      if (!email || !pass) { console.error("Falta SIR_EMAIL/SIR_PASSWORD, o usa --login-manual."); process.exit(2); }
      obs.reset();
      const t0 = Date.now();
      await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
      await page.fill("#email", email);
      await page.fill("#password", pass);
      await page.click('button[type=submit]');
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
      await page.waitForSelector("header").catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      const h = obs.cosecha().filter((x) => x.esApi);
      const cuenta = {};
      for (const x of h) cuenta[x.endpoint] = (cuenta[x.endpoint] ?? 0) + 1;
      salida.escenarios.A_login_cold = {
        totalLoginToReadyMs: Date.now() - t0,
        loginApiDurationMs: h.find((x) => x.endpoint === "/auth/login")?.durationMs ?? null,
        postLoginRequests: h.length,
        porEndpoint: cuenta,
        meFetchCount: cuenta["/auth/me"] ?? 0,
        llamadas: h.map((x) => ({ endpoint: x.endpoint, method: x.method, status: x.status, durationMs: x.durationMs, bytes: x.bytes })),
      };
    }
    await ctx.storageState({ path: resolve(OUT, "estado-sesion.json") });
  }

  // ---- B..F. VISTAS: COLD / REVISIT<10s / REVISIT~30s ----------------------
  const VISTAS = ROL === "admin"
    ? ["/kpi", "/admin/semanas", "/admin/casos", "/admin/retenidos", "/admin/informes", "/admin/asignaciones", "/admin/usuarios"]
    : ["/kpi", "/mis-tramites", "/mi-firma"];

  for (const vista of VISTAS) {
    const cold = [], revisit = [], revisit30 = [];
    for (let i = 0; i < RUNS; i++) {
      // COLD: contexto nuevo por iteración = sin nada previo en cliente.
      const c2 = await browser.newContext({ storageState: resolve(OUT, "estado-sesion.json"), viewport: { width: 1440, height: 900 } });
      await blindar(c2);
      const p2 = await c2.newPage();
      const o2 = observador(p2);
      cold.push(await medirNavegacion(p2, o2, vista));
      // REVISIT rápido: salir a otra vista y volver, <10s.
      await medirNavegacion(p2, o2, VISTAS[(VISTAS.indexOf(vista) + 1) % VISTAS.length]);
      revisit.push(await medirNavegacion(p2, o2, vista));
      // REVISIT ~30s.
      await medirNavegacion(p2, o2, VISTAS[(VISTAS.indexOf(vista) + 1) % VISTAS.length]);
      await p2.waitForTimeout(30000);
      revisit30.push(await medirNavegacion(p2, o2, vista));
      o2.stop(); await c2.close();
    }
    salida.escenarios[vista] = {
      cold: { ...resumen(cold.map((x) => x.timeToUsefulContentMs ?? x.timeToNetworkIdleMs)), muestras: cold },
      revisit10s: { ...resumen(revisit.map((x) => x.timeToUsefulContentMs ?? x.timeToNetworkIdleMs)), muestras: revisit },
      revisit30s: { ...resumen(revisit30.map((x) => x.timeToUsefulContentMs ?? x.timeToNetworkIdleMs)), muestras: revisit30 },
    };
    console.log(`  ✔ ${vista}: cold p50=${salida.escenarios[vista].cold.p50}ms  revisit p50=${salida.escenarios[vista].revisit10s.p50}ms  apiCold=${cold[0]?.apiRequests}`);
  }

  // ---- ENDPOINTS AISLADOS -------------------------------------------------
  const GETS = ROL === "admin"
    ? ["/auth/me", "/admin/holds", "/admin/batches?limit=200", "/admin/doctor-workload?includeInactive=true",
       "/admin/cases?limit=100", "/reports?limit=100", "/admin/users?limit=200", "/admin/doctors?limit=200"]
    : ["/auth/me", "/inbox", "/doctors/me/signature"];
  for (const ep of GETS) {
    const ms = [], bytes = [], items = [];
    for (let i = 0; i < Math.max(RUNS, 10); i++) {
      const t = Date.now();
      const r = await page.request.get(`${BASE}/api/v1${ep}`);
      const b = await r.body();
      ms.push(Date.now() - t); bytes.push(b.length);
      try {
        const j = JSON.parse(b.toString());
        const arr = Object.values(j).find(Array.isArray);
        items.push(arr ? arr.length : 1);
      } catch { items.push(null); }
    }
    salida.endpoints[ep] = { ...resumen(ms), payloadBytes: pct(bytes, 50), items: items[0], status: 200 };
    console.log(`  ✔ GET ${ep}: p50=${salida.endpoints[ep].p50}ms p95=${salida.endpoints[ep].p95}ms ${pct(bytes,50)}B items=${items[0]}`);
  }

  // ---- G. LOGOUT ----------------------------------------------------------
  obs.reset();
  const tL = Date.now();
  await page.goto(BASE + (ROL === "admin" ? "/admin/semanas" : "/kpi"), { waitUntil: "networkidle" }).catch(() => {});
  obs.reset();
  await page.click("text=Cerrar sesión").catch(() => {});
  await page.waitForURL(/\/login/, { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  const hL = obs.cosecha();
  salida.escenarios.G_logout = {
    logoutTotalMs: Date.now() - tL,
    requests: hL.filter((x) => x.esApi).map((x) => ({ endpoint: x.endpoint, method: x.method, status: x.status, durationMs: x.durationMs })),
    localStorage: await page.evaluate(() => ({ ...localStorage })).catch(() => ({})),
    sessionStorage: await page.evaluate(() => ({ ...sessionStorage })).catch(() => ({})),
    cookiesRestantes: (await ctx.cookies()).map((c) => c.name),
  };

  salida.meta.mutacionesAbortadas = ABORTADAS;
  writeFileSync(resolve(OUT, "performance-baseline.json"), JSON.stringify(salida, null, 2));

  // CSV comparable antes/después.
  const filas = [["vista", "cold_p50_ms", "revisit10s_p50_ms", "revisit30s_p50_ms", "api_cold", "api_revisit", "duplicados_cold", "bytes_cold"]];
  for (const [v, d] of Object.entries(salida.escenarios)) {
    if (!d.cold) continue;
    const c = d.cold.muestras[0], r = d.revisit10s.muestras[0];
    filas.push([v, d.cold.p50, d.revisit10s.p50, d.revisit30s.p50, c.apiRequests, r.apiRequests, c.apiDuplicados.length, c.transferredBytes]);
  }
  writeFileSync(resolve(OUT, "performance-baseline.csv"), filas.map((f) => f.join(",")).join("\n"));
  console.log(`\n✅ ${resolve(OUT, "performance-baseline.json")}\n   mutaciones abortadas: ${ABORTADAS}`);

  obs.stop(); await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
