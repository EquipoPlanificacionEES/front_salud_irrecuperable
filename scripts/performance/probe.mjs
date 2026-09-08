import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const LOG = process.env.MOCK_LOG, BASE = "http://localhost:3002";
const lineas = () => readFileSync(LOG,"utf8").trim().split("\n").filter(Boolean);
const marca = () => lineas().length;
const desde = (n) => lineas().slice(n).map(JSON.parse);

const b = await chromium.launch();
const ctx = await b.newContext();
let abortadas = 0;
await ctx.route("**/*", (r) => {
  const m = r.request().method(), u = r.request().url();
  if (m === "GET" || m === "HEAD" || /auth\/(login|logout)$/.test(u)) return r.continue();
  abortadas++; console.error("⛔ ABORTADA", m, u); return r.abort();
});
const p = await ctx.newPage();
let cliente = [];
p.on("requestfinished", (r) => { if (r.url().includes("/api/v1/")) cliente.push(r.method()+" "+new URL(r.url()).pathname.replace(/\/00000000-[\w-]+/,"/{id}")); });

const out = [];
const paso = async (nombre, fn, esperar) => {
  const n0 = marca(); cliente = [];
  const t0 = Date.now();
  await fn();
  let tUtil = null;
  if (esperar) { await p.waitForSelector(esperar, { timeout: 20000 }).then(()=>tUtil=Date.now()-t0).catch(()=>{}); }
  await p.waitForLoadState("networkidle").catch(()=>{});
  const dt = Date.now() - t0;
  const srv = desde(n0).filter(x => x.path.startsWith("/api/v1"));
  const porOrigen = {}, total = {};
  for (const s of srv) {
    const k = s.method+" "+s.path.replace(/\/00000000-[\w-]+/,"/{id}");
    total[k] = (total[k]??0)+1;
    porOrigen[s.origen] = porOrigen[s.origen] ?? {};
    porOrigen[s.origen][k] = (porOrigen[s.origen][k]??0)+1;
  }
  const cl = {}; for (const c of cliente) cl[c]=(cl[c]??0)+1;
  const r = { nombre, totalMs: dt, contenidoUtilMs: tUtil, backendTotal: total,
    backendPorOrigen: porOrigen, desdeElNavegador: cl,
    nLlamadasBackend: srv.length, nLlamadasNavegador: cliente.length,
    secuencia: srv.map(s=>`+${s.tMs - srv[0].tMs}ms ${s.origen==="proxy(navegador)"?"CLI":"SRV"} ${s.path.replace(/\/00000000-[\w-]+/,"/{id}")}`) };
  out.push(r);
  console.log(`\n### ${nombre}`);
  console.log(`  total=${dt}ms  contenido-útil=${tUtil}ms  backend=${srv.length} req  navegador=${cliente.length} req`);
  console.log(`  backend:`, JSON.stringify(total));
  console.log(`  origen :`, JSON.stringify(porOrigen));
  return r;
};

await paso("A. LOGIN COLD (submit → primera pantalla útil)", async () => {
  await p.goto(BASE + "/login");
  await p.fill("#email", "sintetico@example.invalid");
  await p.fill("#password", "credencial-sintetica-del-mock");
  await p.click("button[type=submit]");
}, "text=Asignados a ti");

await paso("B. /kpi → /mis-tramites (COLD)", async () => {
  await p.click("nav a[href='/mis-tramites']");
}, "table tbody tr td.font-mono");

const primerCaso = await p.getAttribute("table tbody tr a", "href");
await paso("C1. /mis-tramites → detalle (COLD)", async () => {
  await p.click("table tbody tr a");
}, "text=/Sección|Trámite/");

await paso("C2. detalle → /mis-tramites (REVISIT <10s)", async () => {
  await p.click("text=← Mis casos");
}, "table tbody tr td.font-mono");

await paso("D1. pestaña Pendientes → Histórico", async () => {
  await p.click("button:has-text('Histórico')"); await p.waitForTimeout(500);
}, null);
await paso("D2. pestaña Histórico → Pendientes", async () => {
  await p.click("button:has-text('Pendientes')"); await p.waitForTimeout(500);
}, null);

await paso("E1. volver al MISMO caso (REVISIT del detalle)", async () => {
  await p.goto(BASE + primerCaso);
}, "text=/Sección|Trámite/");

await paso("E2. /mis-tramites → /kpi (REVISIT del dashboard)", async () => {
  await p.goto(BASE + "/kpi");
}, "text=Asignados a ti");

await paso("F. /kpi → /mi-firma", async () => {
  await p.click("nav a[href='/mi-firma']");
}, "main");

await paso("G. LOGOUT", async () => {
  await p.click("text=Cerrar sesión");
  await p.waitForURL(/login/, { timeout: 20000 }).catch(()=>{});
}, null);

const storage = {
  localStorage: await p.evaluate(() => ({...localStorage})).catch(()=>({})),
  sessionStorage: await p.evaluate(() => ({...sessionStorage})).catch(()=>({})),
  cookies: (await ctx.cookies()).map(c=>({name:c.name, value: c.value ? "(con valor)" : "(vacía)"})),
};
console.log("\n### tras logout:", JSON.stringify(storage));
writeFileSync(process.env.OUT, JSON.stringify({ pasos: out, storageTrasLogout: storage, mutacionesAbortadas: abortadas }, null, 2));
console.log("mutaciones abortadas:", abortadas);
await b.close();
