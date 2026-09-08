import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const LOG = process.env.MOCK_LOG, BASE = "http://localhost:3002";
const lineas = () => readFileSync(LOG,"utf8").trim().split("\n").filter(Boolean);
const b = await chromium.launch();
const ctx = await b.newContext();
let abortadas = 0;
await ctx.route("**/*", (r) => {
  const m = r.request().method(), u = r.request().url();
  if (m==="GET"||m==="HEAD"||/auth\/(login|logout)$/.test(u)) return r.continue();
  abortadas++; console.error("⛔ ABORTADA", m, u); return r.abort();
});
const p = await ctx.newPage();
const out = [];
/** Espera a que el ENDPOINT DE DATOS de la vista destino haya llegado al backend. */
const esperaDato = async (n0, ep) => {
  const t0 = Date.now();
  while (Date.now()-t0 < 20000) {
    if (lineas().slice(n0).map(JSON.parse).some(x=>x.path.includes(ep))) return Date.now()-t0;
    await p.waitForTimeout(15);
  }
  return null;
};
const paso = async (nombre, fn, epDato) => {
  const n0 = lineas().length, t0 = Date.now();
  await fn();
  const tDato = epDato ? await esperaDato(n0, epDato) : null;
  await p.waitForLoadState("networkidle").catch(()=>{});
  await p.waitForTimeout(250);
  const dt = Date.now()-t0;
  const srv = lineas().slice(n0).map(JSON.parse).filter(x=>x.path.startsWith("/api/v1"));
  const total={}, datos={};
  for (const s of srv){ const k=s.method+" "+s.path.replace(/\/00000000-[\w-]+/,"/{id}"); total[k]=(total[k]??0)+1; if(!k.includes("auth/me")) datos[k]=(datos[k]??0)+1; }
  const r={nombre,totalMs:dt,datosListosMs:tDato,nBackend:srv.length,authMe:total["GET /api/v1/auth/me"]??0,datos,
    secuencia:srv.map(s=>`${s.origen==="proxy(navegador)"?"CLI":"SRV"} ${s.path.replace(/\/00000000-[\w-]+/,"/{id}")}`)};
  out.push(r);
  console.log(`\n### ${nombre}\n  total=${dt}ms datos-listos=${tDato}ms  backend=${srv.length} req  /auth/me=${r.authMe}  datos=${JSON.stringify(datos)}`);
};
const clic = (sel) => async () => { await p.click(sel); await p.waitForTimeout(80); };

await paso("A. LOGIN COLD (admin)", async () => {
  await p.goto(BASE+"/login"); await p.fill("#email","admin@example.invalid");
  await p.fill("#password","credencial-sintetica-del-mock"); await p.click("button[type=submit]");
}, "/admin/batches");

const RUTAS = [
  ["/admin/casos","/admin/cases"], ["/admin/retenidos","/admin/holds"],
  ["/admin/informes","/reports"], ["/admin/asignaciones","assignment-context"],
  ["/admin/usuarios","/admin/users"],
];
for (const [ruta, ep] of RUTAS) await paso(`COLD  clic → ${ruta}`, clic(`a[href='${ruta}']`), ep);
console.log("\n--- REVISIT <10s (misma sesión, se vuelve a cada una) ---");
for (const [ruta, ep] of RUTAS) await paso(`REVISIT<10s clic → ${ruta}`, clic(`a[href='${ruta}']`), ep);
console.log("\n--- REVISIT ~35s (fuera de la ventana del Router Cache) ---");
await p.waitForTimeout(35000);
for (const [ruta, ep] of RUTAS.slice(0,2)) await paso(`REVISIT~35s clic → ${ruta}`, clic(`a[href='${ruta}']`), ep);
await paso("RECARGA DURA (F5) de /admin/retenidos", async()=>{ await p.reload(); }, "/admin/holds");
await paso("clic → /kpi (nav principal)", clic("nav a[href='/kpi']"), "/admin/doctor-workload");
await paso("clic → /admin (volver)", clic("nav a[href='/admin']"), "/admin/batches");
await paso("LOGOUT", async()=>{ await p.click("text=Cerrar sesión"); await p.waitForURL(/login/,{timeout:20000}).catch(()=>{}); }, null);
const storage={ localStorage: await p.evaluate(()=>({...localStorage})).catch(()=>({})), sessionStorage: await p.evaluate(()=>({...sessionStorage})).catch(()=>({})), cookies:(await ctx.cookies()).map(c=>c.name) };
console.log("\ntras logout:",JSON.stringify(storage),"| mutaciones abortadas:",abortadas);
writeFileSync(process.env.OUT, JSON.stringify({pasos:out,storageTrasLogout:storage,mutacionesAbortadas:abortadas},null,2));
await b.close();
