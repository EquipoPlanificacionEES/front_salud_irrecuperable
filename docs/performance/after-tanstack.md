# Antes y después — TanStack Query y la sesión

Mismas pruebas, mismos scripts, mismo instrumental que el baseline. No se cambió
ninguna prueba para favorecer el resultado.

- **Antes**: `c4093ef` · **Después**: esta rama
- **Dataset**: 93 casos · 93 asignaciones activas · 2 médicos · 1 lote
- **Entorno**: build de producción de Next 16 contra un backend instrumentado,
  con 197 ms inyectados por salto — el p50 real medido contra Render
- **Repeticiones**: 5 por escenario. *p95 sobre 5 muestras no es robusto; sirve
  como referencia interna.*

## Qué mide cada sonda, y qué no

`probe.mjs` / `probe-admin.mjs` cuentan **peticiones**: cuántas, cuáles y en qué
orden llegan al backend. Son exactas.

Su campo de tiempo (`contenidoUtilMs`) resultó no medir lo que dice: en las
corridas de después coincide al milisegundo con el momento en que la red queda
inactiva, no con el momento en que el contenido aparece. Los scripts NO se
tocaron —romper la comparación habría sido peor—, pero los tiempos de esta
página vienen de `probe-ux.mjs`, que muestrea el DOM cada 40 ms y se corrió
igual antes y después. Sus cifras se verificaron además con una tercera medición
independiente.

## Peticiones al backend — médico

| Escenario | Total antes → después | `/auth/me` | Peticiones de datos |
|---|---|---|---|
| Login → primera pantalla | **13 → 4** | 11 → **2** | 2 → 2 |
| `/kpi` → `/mis-tramites` | 4 → **1** | 3 → 1 | 1 → **0** |
| `/mis-tramites` → detalle | 4 → **2** | 3 → 1 | 1 → 1 |
| detalle → `/mis-tramites` (revisita) | 3 → **1** | 2 → 1 | 1 → **0** |
| Pendientes → Histórico (pestaña) | **12 → 0** | 12 → **0** | 0 → 0 |
| Volver al mismo caso | 9 → **2** | 8 → 1 | 1 → 1 |
| `/mis-tramites` → `/kpi` | 8 → **2** | 7 → 1 | 1 → 1 |

## Peticiones al backend — admin

| Escenario | Total antes → después | `/auth/me` | Datos |
|---|---|---|---|
| Login → primera pantalla | **30 → 4** | 28 → **2** | 2 → 2 |
| Navegación entre pestañas | 3–5 → 2–3 | 2 → **1** | igual |
| **Recarga dura (F5)** | **24 → 2** | 23 → **1** | 1 → 1 |
| Revisita `/admin/casos` | 5 → **1** | 2 → 1 | 3 → **0** |
| Revisita `/admin/informes` | 4 → **1** | 2 → 1 | 2 → **0** |
| Revisita `/admin/usuarios` | 4 → **1** | 2 → 1 | 2 → **0** |
| Revisita `/admin/retenidos` | 3 → 2 | 2 → 1 | 1 → 1 |

La revisita de retenidos sigue pidiendo datos, y está bien: su frescura son 15 s
—una retención la puede levantar otro administrador ahora mismo— y el recorrido
de la prueba tarda 23 s en volver. Las demás, con 20 s, 30 s y 5 min, no piden
nada. Es la política haciendo lo que dice, no una caché que falla.

## Tiempos de usuario (`probe-ux.mjs`, muestreo del DOM cada 40 ms)

| Navegación | Sin feedback | Contenido |
|---|---|---|
| `/kpi` → Mis casos | 440 ms → **45 ms** | 659 ms → **373 ms** |
| Mis casos → detalle | 438 ms → **43 ms** | 654 ms → **352 ms** |
| detalle → Mis casos | 453 ms → **45 ms** | 680 ms → **357 ms** |
| Mis casos → `/kpi` | 444 ms → **43 ms** | 666 ms → **357 ms** |
| Cambio de pestaña | 45 ms → **44 ms** | sin cambio, como debía |

Login → primera pantalla útil, con el mismo script en los dos casos:
**médico 1.912 → 1.397 ms**, **admin 3.465 → 1.775 ms**.

## Los números que importan

| Métrica | Antes | Después |
|---|---|---|
| `/auth/me` por login (médico / admin) | 11 / 28 | **2 / 2** |
| `/auth/me` por navegación | 2–3 | **1** |
| `/auth/me` por recarga dura de admin | 23 | **1** |
| `/auth/me` por cambio de pestaña | 12 | **0** |
| `/inbox` en el recorrido resumen→casos→caso→volver | 4 | **1** |
| Bytes de ese recorrido | ~330 KB | **~82,5 KB** |
| Peticiones de datos al volver a una vista fresca | todas | **0** |
| Tiempo sin señal visual tras un clic | ~440 ms | **~45 ms** |
| Recargas completas en navegación normal | 0 | **0** |
| Caché clínica tras cerrar sesión | ninguna | **ninguna** |

## Objetivos, honestamente

| Objetivo | Resultado |
|---|---|
| `/auth/me` en login ≤ 2 | **cumplido** (2 y 2) |
| Prefetch sin multiplicar la sesión | **cumplido** (1 por render, antes 3) |
| `/inbox`: 1 petición compartida | **cumplido** |
| 0 refetch dentro de la frescura | **cumplido** donde el recorrido cabe en la ventana |
| Sin feedback < 100 ms | **cumplido** (~45 ms) |
| 0 recargas completas | **cumplido** |
| Sin caché entre usuarios | **cumplido**, con prueba |
| Revisita < 100 ms | **NO** — ver abajo |

**La revisita no baja de 100 ms, y no es un problema de caché.** Los datos ya no
se piden (0 peticiones), pero cada navegación sigue costando un render de
servidor con su verificación de sesión: ~197 ms de Render más el tiempo del
propio render. El techo de esta fase es ese, no la caché. Bajarlo exige tocar la
latencia del backend o la arquitectura de sesión — la fase siguiente.

## Lo que esta fase no tocó

- Latencia de la API (~197 ms por llamada a Render), Express, PostgreSQL, Prisma.
- Paginación de `/inbox` (887 B por caso, ~4,4 MB con 5.000).
- Los 534 `ReportSnapshot` con `supersededAt IS NULL` para 93 casos.

## Repetir la medición

```bash
cd scripts/performance
MOCK_PORT=4000 MOCK_ROL=medico LATENCIA_MS=197 MOCK_LOG=./t.jsonl node mock-backend.mjs &
BACKEND_URL=http://localhost:4000 npx next start -p 3002 &
MOCK_LOG=./t.jsonl OUT=./r.json node probe.mjs      # peticiones
node probe-ux.mjs                                    # tiempos de usuario
```

Contra producción, `baseline.mjs` sólo hace GET y aborta cualquier mutación que
no sea entrar o salir. Las credenciales nunca están en el repositorio:

```bash
BASE_URL=https://front-salud-irrecuperable.vercel.app node baseline.mjs --login-manual --runs 5
```
