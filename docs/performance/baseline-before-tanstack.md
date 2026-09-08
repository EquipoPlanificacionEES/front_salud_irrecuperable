# Baseline de performance frontend — ANTES de TanStack Query

- **Fecha**: 2026-09-08
- **Frontend**: `front_salud_irrecuperable` @ `c4093ef`
- **Backend**: `plataforma-salud-irrecuperable-backend` @ `3be9a2c`
- **Dataset de producción**: 93 casos · 93 asignaciones activas · 2 médicos · 4 usuarios · 1 lote (Semana 8) · 2 retenciones activas
- **Repeticiones**: 5 por escenario. *p95 sobre 5 muestras no es estadísticamente robusto; se conserva como referencia interna de benchmark, no como SLA.*

## Cómo se midió, y por qué así

La sesión de producción exige credenciales que esta auditoría no maneja. Se resolvió partiendo la
medición en dos, según lo que cada mitad puede establecer con certeza:

| Qué | Cómo | Fidelidad |
|---|---|---|
| Nº de requests, orden, duplicados, refetch, waterfalls, UX de carga | Build de **producción** de Next 16 (`next start`) contra un **backend simulado** que registra cada llamada con marca de tiempo y origen | **Exacta.** El conteo no depende de qué servidor responda |
| Latencia por endpoint | Medida real contra Render (`GET /api/v1/auth/me`, 401, n=10) | **Real**: min 178 / p50 **197** / p95 204 / max 529 ms |
| Tiempo de usuario | Los conteos anteriores con 197 ms inyectados por salto | **Derivada**, reproducible |
| Tamaño de payload | Respuestas con la forma real del contrato y el dataset real (93) | **Aproximada** (±10%) |

Lo que NO cubre: latencia real de cada endpoint autenticado en Render. Requiere una sesión; ver
«Cómo repetir esto» al final.

## Inventario de rutas

| Ruta | Componente | Server/Client | Endpoints | Cuándo | Paralelo/Serie |
|---|---|---|---|---|---|
| `/login` | `LoginForm` | Client | `POST /auth/login` | submit | — |
| `/kpi` (médico) | `KpiPanel` | page Server + comp. Client | `GET /inbox` | `useEffect` al montar | 1 sola |
| `/kpi` (admin) | `KpiPanel` | page Server + comp. Client | `GET /admin/batches`, `GET /admin/doctor-workload` | `useEffect` (`Promise.all`) | **Paralelo** |
| `/mis-tramites` | `Bandeja` | page Server + comp. Client | `GET /inbox` | `useEffect` al montar | 1 sola |
| `/mis-tramites/[id]` | `PantallaResultado` | page Server + comp. Client | `GET /cases/{id}/report`; `GET /inbox` si 404; `GET /reports/{id}/manual-form` al abrir el formulario | `useEffect` / acción | **Serie** (encadenados) |
| `/mi-firma` | `MiFirma` | Client | `GET /doctors/me/signature` | `useEffect` | 1 sola |
| `/quality` | `RevisionCalidad` | Client | `GET /reports?limit=200` | `useEffect` | 1 sola |
| `/admin/semanas` | `Semanas` | Client | `GET /admin/batches?limit=200` | `useEffect` | 1 sola |
| `/admin/casos` | `Casos` | Client | `GET /admin/batches`, `GET /admin/doctor-workload`, `GET /admin/cases` | 2 `useEffect` | **Paralelo** |
| `/admin/retenidos` | `Retenidos` | Client | `GET /admin/holds` | `useEffect` | 1 sola |
| `/admin/informes` | `Informes` | Client | `GET /admin/batches`, `GET /reports` | 2 `useEffect` | **Paralelo** |
| `/admin/asignaciones` | `Asignaciones` | Client (+`Suspense`) | `GET /admin/batches?status=OPEN`, luego `GET .../assignment-context` | encadenado por `batchId` | **SERIE — waterfall real** |
| `/admin/reasignacion` | `Reasignar` | Client | `GET /admin/doctor-workload`, luego `GET /admin/cases` | encadenado por médico elegido | **SERIE** (dependencia legítima) |
| `/admin/usuarios` | `Usuarios` | Client | `GET /admin/users`, `GET /admin/doctors` | `Promise.all` | **Paralelo** |
| `/admin/exportaciones` | `Exportaciones` | Client | `GET /admin/batches`, `GET /admin/doctor-workload`, `GET /exports` + **polling** | `useEffect` + intervalo | Paralelo + polling |

**Mecanismos de caché de datos hoy: ninguno.** Cero `fetch` con `cache`, cero `revalidate`, cero
estado global de datos de servidor, cero librería de datos. Todo es `useEffect` + `useState` local
que muere al desmontar el componente.

## Medición por escenario (latencia backend 197 ms/salto)

### Médico

| Escenario | Contenido útil p50 | p95 | Requests al backend | de esas, `/auth/me` | Endpoints de datos |
|---|---|---|---|---|---|
| Login → primera pantalla útil | **1912 ms** | 1952 | 13 | **11** | login + `/inbox` |
| `/kpi` → `/mis-tramites` (COLD) | 819 ms | 829 | 4 | 3 | `/inbox` |
| `/mis-tramites` → detalle (COLD) | 809 ms | 820 | 4 | 3 | `/cases/{id}/report` |
| detalle → `/mis-tramites` (**REVISIT <10 s**) | **816 ms** | 822 | 3 | 2 | `/inbox` **otra vez** |
| Pendientes → Histórico (pestaña) | — | — | 12 | **12** | **ninguno** |
| Histórico → Pendientes (pestaña) | — | — | 0 | 0 | ninguno |
| volver al **mismo** caso | **755 ms** | 762 | 9 | 8 | `/cases/{id}/report` **otra vez** |
| `/mis-tramites` → `/kpi` (REVISIT) | **752 ms** | 758 | 8 | 7 | `/inbox` **otra vez** |
| Logout | — | — | 2 | 1 | logout |

### Admin

| Escenario | Datos listos p50 | p95 | Requests | `/auth/me` | Endpoints de datos |
|---|---|---|---|---|---|
| Login → primera pantalla | 1739 ms | 1759 | 30 | **28** | login + `/admin/batches` |
| clic → `/admin/casos` (COLD) | 365 ms | 367 | 5 | 2 | batches + doctor-workload + cases |
| clic → `/admin/retenidos` (COLD) | 354 ms | 369 | 3 | 2 | `/admin/holds` |
| clic → `/admin/informes` (COLD) | 359 ms | 372 | 4 | 2 | batches + reports |
| clic → `/admin/asignaciones` (COLD) | **576 ms** | 580 | 4 | 2 | batches → assignment-context (**serie**) |
| clic → `/admin/usuarios` (COLD) | 355 ms | 371 | 4 | 2 | users + doctors |
| **REVISIT <10 s** a cada una de las cinco | **353–567 ms** | | idénticos | idénticos | **idénticos: se repite todo** |
| **REVISIT ~35 s** | **354–369 ms** | | idénticos | idénticos | **idénticos** |
| **Recarga dura (F5)** de `/admin/retenidos` | — | — | 24 | **23** | `/admin/holds` |
| clic → `/kpi` | 355 ms | 375 | 4 | 2 | batches + doctor-workload |

**COLD ≡ REVISIT.** No hay una sola métrica en la que volver a una vista sea más barato que entrar
por primera vez.

## Endpoints: payload y escalabilidad

| Endpoint | Bytes hoy | Items | Bytes/item | Paginación | Riesgo a 5.000 casos |
|---|---|---|---|---|---|
| `GET /inbox` | 82.524 | 93 | 887 | **NO** (por diseño) | **ALTO** — 4,4 MB sin tope |
| `GET /admin/cases?limit=100` | 82.524 | 93 | 887 | Sí (`limit/offset`) | MEDIO — tope, sin cursor |
| `GET /reports?limit=100` | 48.636 | 92 | 528 | Sí | MEDIO |
| `GET /admin/holds` | 2.063 | 2 | 1.031 | **NO** | BAJO |
| `GET /admin/batches?limit=200` | 496 | 1 | 496 | Sí | BAJO |
| `GET /admin/doctor-workload` | 657 | 2 | 328 | **NO** | BAJO |
| `GET /cases/{id}/report` | 8.954 | 1 | — | — | BAJO |
| `GET /auth/me` | 300 | 1 | — | — | BAJO en bytes, **ALTO en frecuencia** |

## UX de carga actual (medida muestreando el DOM cada 40 ms)

Toda navegación tiene la misma forma:

```
clic ──────── 440 ms ──────── swap de ruta ──── 220 ms ──── datos
      SIN NINGÚN FEEDBACK        "Cargando…"
   (la página vieja sigue        contenido vacío
    entera en pantalla)
```

| Vista | Mientras carga | Al refrescar |
|---|---|---|
| `/kpi` | `NO_FEEDBACK` 440 ms → texto «Cargando…» | tarjetas KPI **desaparecen**; `main` 3898→592 px |
| `/mis-tramites` | `NO_FEEDBACK` 440 ms → fila «Cargando…» | tabla **desmontada**; contador parpadea `Pendientes (0)` → `(1)` |
| detalle de caso | `NO_FEEDBACK` 440 ms → «Cargando…» | ficha entera **desmontada** |
| `/admin/*` | `NO_FEEDBACK` → fila «Cargando…» | tabla **desmontada** |
| pestañas de la bandeja | instantáneo (45 ms, filtro local) | — *lo único que ya está bien* |

Cero `loading.tsx`, cero skeleton, cero estado pendiente en los enlaces. Un solo `Suspense`
(`/admin/asignaciones`) con texto plano.

## Duplicaciones y waterfalls

1. **`GET /auth/me` — 11 (médico) / 28 (admin) por login; 2 por navegación; 23 por recarga dura.**
   Origen: `middleware.ts:19` + `(app)/layout.tsx:8` (`requerirSesion()`) + cada `page.tsx`
   (`requerirSesion(ruta)`). Tres verificaciones independientes contra el backend, cada una con
   `cache: "no-store"` (`lib/session.ts:47`). El prefetch de `<Link>` de Next multiplica: cada enlace
   prefetchado ejecuta middleware + layout + page = 3 más. `AdminTabs` tiene 8 enlaces → 24.
   **Ninguna llega desde el navegador: todas son server-side.** TanStack Query **no las toca**.
2. **`GET /inbox` en tres componentes distintos**: `KpiPanel:34`, `Bandeja:45`,
   `PantallaResultado:175` (fallback 404). Recorrido KPI → Mis casos → caso sin informe → volver =
   **4 × 82,5 KB = 330 KB** de la misma lista.
3. **`GET /admin/batches` en cinco vistas**: kpi, casos, informes, asignaciones, exportaciones,
   semanas. Datos casi inmutables (1 lote), pedidos en cada visita.
4. **`GET /admin/doctor-workload` en cuatro vistas**: kpi, casos, reasignación, exportaciones.
5. **Waterfall real** — `/admin/asignaciones`: `GET /admin/batches?status=OPEN` → estado `batchId` →
   render → `GET /admin/batches/{id}/assignment-context`. Coste evitable ≈ **197 ms** (medido: 576 ms
   frente a 355 ms de las vistas paralelas). Prefetchable: el lote por defecto es el primero abierto.
6. **Waterfall en el detalle**: `/cases/{id}/report` → render → (al pulsar) `/reports/{id}/manual-form`.
   Dependencia real (hace falta `rep.id`), pero prefetchable en cuanto llega el informe.

## Matriz de oportunidad TanStack Query

Distinguiendo **latencia de servidor** (TanStack no la baja) de **espera de cliente evitable**
(TanStack sí):

| Recurso | Prioridad | Mecanismo | Espera evitable |
|---|---|---|---|
| `/inbox` | **VERY_HIGH** | dedupe + cache + prefetch + background refetch | 752–819 ms por revisita, ×3 componentes |
| `/cases/{id}/report` | **VERY_HIGH** | cache por caseId + prefetch al pasar el ratón | 755 ms al reabrir un caso |
| `/admin/batches` | **HIGH** | cache larga (casi inmutable) | 197 ms × 5 vistas |
| `/admin/doctor-workload` | **HIGH** | cache + invalidación por asignación | 197 ms × 4 vistas |
| `/admin/holds` | **HIGH** | cache + invalidación al resolver | 354 ms por revisita |
| `/admin/cases` | **HIGH** | cache por filtros + `placeholderData` | 365 ms; evita desmontar la tabla al filtrar |
| `/reports` | **MEDIUM** | cache por filtros | 359 ms |
| `/admin/users` + `/admin/doctors` | **MEDIUM** | cache larga | 355 ms |
| `assignment-context` | **MEDIUM** | prefetch del lote por defecto | 197 ms del waterfall |
| `/doctors/me/signature` | **LOW** | cache de sesión | mínima |
| **`/auth/me`** | **NO APLICA** | **es server-side; se arregla en el layout, no con TanStack** | 2 200 ms en login |

## Query keys propuestas

```ts
["session"]                              // del layout, NO refetch en cliente
["doctor", "inbox"]                      // GET /inbox
["cases", caseId, "report"]              // GET /cases/{id}/report
["cases", caseId, "manual-form"]         // GET /reports/{id}/manual-form
["doctor", "signature"]                  // GET /doctors/me/signature
["admin", "batches", { status, limit }]  // GET /admin/batches
["admin", "doctor-workload"]             // GET /admin/doctor-workload
["admin", "holds"]                       // GET /admin/holds
["admin", "cases", { batchId, assignment, doctorProfileId, limit }]
["admin", "users"] / ["admin", "doctors"]
["admin", "batches", batchId, "assignment-context"]
["reports", { batchId, workflowStatus, limit }]
["exports", { limit }]
```

## staleTime propuesto

Sin `staleTime` universal: el criterio es **quién cambia el dato y con qué latencia el usuario
necesita enterarse**.

| Query | staleTime | gcTime | Por qué |
|---|---|---|---|
| `["session"]` | `Infinity` | sesión | Sale del layout servidor. Cambia sólo con logout |
| `["doctor","inbox"]` | **30 s** | 5 min | Lo mueven las acciones del propio médico (invalidación explícita) y los workers de firma. 30 s cubre ir-y-volver sin ocultar una firma recién emitida |
| `["cases",id,"report"]` | **0** + `refetchOnMount:"always"` | 10 min | **Dato clínico que se va a firmar.** Se sirve el caché al instante y se revalida en fondo: nunca se firma una versión vieja, y nunca se ve un «Cargando…» |
| `["cases",id,"manual-form"]` | 0 | 5 min | Depende del snapshot vigente |
| `["admin","holds"]` | **15 s** | 5 min | Incidencia administrativa; varios admins pueden actuar a la vez |
| `["admin","cases"]` | **20 s** | 5 min | Lo mueven asignaciones y el pipeline |
| `["admin","batches"]` | **5 min** | 30 min | Un lote se crea/cierra a mano, rara vez |
| `["admin","doctor-workload"]` | **60 s** | 10 min | Cambia con cada asignación → invalidación explícita |
| `["admin","users"]`/`["admin","doctors"]` | **5 min** | 30 min | Administración de personas, muy estable |
| `["reports"]` | 30 s | 5 min | Igual que inbox |
| `["exports"]` | 0 (polling) | 1 min | Ya hace polling; TanStack lo hace con `refetchInterval` |

**Nunca `persistQueryClient` ni `localStorage` para datos clínicos.** Caché sólo en memoria, y
`queryClient.clear()` en `cerrarSesion()` (`SesionProvider.tsx:41`). Hoy el riesgo de sesión cruzada
es **nulo** —`localStorage` y `sessionStorage` quedan vacíos y las cookies borradas tras logout,
verificado— y el refactor no debe introducirlo.

## Cómo repetir esto después del refactor

Los mismos scripts, sin cambiarlos. Están fuera del repo, en el scratchpad de esta sesión:

```
perf/mock-backend.mjs   backend simulado que registra cada llamada (dataset sintético, 93 casos)
perf/probe.mjs          escenarios del médico
perf/probe-admin.mjs    escenarios del admin
perf/probe-ux.mjs       muestreo del DOM para la UX de carga
perf/baseline.mjs       arnés contra PRODUCCIÓN (necesita sesión; sólo GET, aborta mutaciones)
```

Reproducir el baseline (no toca producción ni la base de datos):

```bash
cd perf
node mock-backend.mjs &                    # :4000, LATENCIA_MS=197 MOCK_ROL=medico|admin
cd app && BACKEND_URL=http://localhost:4000 npx next start -p 3002 &
MOCK_LOG=../run.jsonl OUT=../resultado.json node ../probe.mjs
```

Contra producción (requiere una sesión que esta auditoría no creó):

```bash
BASE_URL=https://front-salud-irrecuperable.vercel.app node baseline.mjs --login-manual --runs 5
# abre el navegador, inicias sesión tú, guarda estado-sesion.json y mide sin volver a pedirla
```

## Métricas oficiales BEFORE

| Métrica | Médico | Admin |
|---|---|---|
| Login → pantalla útil (p50) | 1.912 ms | 1.739 ms |
| `/auth/me` por login | 11 | 28 |
| `/auth/me` por navegación | 2–3 | 2 |
| `/auth/me` por recarga dura | — | 23 |
| Revisita de la vista principal (p50) | 816 ms | 354 ms |
| **Requests de datos ahorrados en revisita** | **0** | **0** |
| Endpoint de datos más repetido | `/inbox` (3 componentes) | `/admin/batches` (5 vistas) |
| Tiempo sin feedback visual por navegación | ~440 ms | ~440 ms |
| Recargas duras en uso normal | 0 | 0 |
| Datos sensibles tras logout | ninguno | ninguno |
