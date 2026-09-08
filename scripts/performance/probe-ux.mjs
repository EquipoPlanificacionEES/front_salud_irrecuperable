import { chromium } from "playwright";
const BASE="http://localhost:3002";
const b=await chromium.launch(); const ctx=await b.newContext();
await ctx.route("**/*",(r)=>{const m=r.request().method(),u=r.request().url();
  if(m==="GET"||m==="HEAD"||/auth\/(login|logout)$/.test(u))return r.continue(); return r.abort();});
const p=await ctx.newPage();
await p.goto(BASE+"/login"); await p.fill("#email","a@example.invalid");
await p.fill("#password","credencial-sintetica-del-mock"); await p.click("button[type=submit]");
await p.waitForSelector("text=Asignados a ti");

/** Muestrea el DOM cada 40ms durante una navegación, para ver QUÉ hay en pantalla. */
async function filmar(nombre, accion, ms=1400) {
  const tiras=[]; let corriendo=true;
  const acc=(async()=>{ while(corriendo){
    tiras.push(await p.evaluate(()=>{
      const main=document.querySelector("main");
      const t=(main?.innerText??"").trim();
      return { t: Date.now(), filas: document.querySelectorAll("table tbody tr").length,
        kpis: document.querySelectorAll("main .grid > div").length,
        cargando: /Cargando…/.test(t), vacio: t.length<40, alto: main?.getBoundingClientRect().height??0,
        primeros: t.split("\n").slice(0,2).join(" | ").slice(0,70) };
    }).catch(()=>null));
    await p.waitForTimeout(40);
  }})();
  const t0=Date.now(); await accion(); await p.waitForTimeout(ms); corriendo=false; await acc;
  console.log(`\n### ${nombre}`);
  let prev=null;
  for(const s of tiras.filter(Boolean)){
    const clave=`${s.filas}|${s.kpis}|${s.cargando}|${s.vacio}|${Math.round(s.alto)}`;
    if(clave!==prev){ console.log(`  +${String(s.t-t0).padStart(4)}ms filas=${String(s.filas).padStart(3)} kpis=${s.kpis} cargando=${s.cargando?"SÍ":"no"} altoMain=${Math.round(s.alto)}px  «${s.primeros}»`); prev=clave; }
  }
}
await filmar("KPI → Mis casos (COLD)", async()=>{ await p.click("nav a[href='/mis-tramites']"); });
await p.waitForSelector("table tbody tr td.font-mono");
await filmar("Mis casos → detalle", async()=>{ await p.click("table tbody tr a"); });
await filmar("detalle → Mis casos (REVISIT <10s)", async()=>{ await p.click("text=← Mis casos"); });
await filmar("cambio de pestaña Pendientes→Histórico", async()=>{ await p.click("button:has-text('Histórico')"); }, 700);
await filmar("Mis casos → KPI (REVISIT)", async()=>{ await p.click("nav a[href='/kpi']"); });
await b.close();
