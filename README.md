# FRONT_BD_salud_irrecuperable — web

Front (Next.js 16 + Tailwind v4) del MVP. El backend lo desarrolla el compañero aparte.
Referencia visual: `EES---VERCEL/frontend` (paleta ATM, fuente Geist).

## Estado por ticket

| Ticket | Qué | Estado |
|--------|-----|--------|
| TSI-201 | Frontend Next.js + rutas iniciales (`/login` `/dashboard` `/mis-tramites` `/admin` `/admin/automation` `/quality` + `/kpi` `/mi-firma`) | ✅ scaffold |
| TSI-202 | Layout con nav: Mis trámites · Administración · Control de calidad · KPI · Mi firma | ✅ `components/AppShell.tsx` |
| TSI-203 | Login UI (email, password, login, logout, session) contra `POST /api/auth/login` | ✅ UI lista · backend = mock local |
| TSI-112 | Tablas `roles` · `regiones` (4) · `usuarios` (FK rol/región) + `institution_profile`/`institution_rule` en la BD mock; región viaja en la sesión | ✅ mock (backend migra a PostgreSQL) |
| TSI-301 | Bandeja Mis trámites (Pendientes / Resueltos) — **solo rol médico** | 🟡 UI con pestañas, sin datos |
| TSI-206 | `/admin/carga` con sub-nav de admin: (1) descarga expedientes por semana; (2) el admin **selecciona semanas (1..11, solo las que llegaron)**, empaqueta y envía al bot (`/api/bot/semanas`, `/api/bot/paquete`, `/api/bot/enviar` → `BOT_URL` o MOCK). Marca `ENVIADO_BOT`, registra la corrida en `bot_runs`, y el informe mock queda en la bandeja del médico. | 🟡 mock |
| TSI-208 | `/admin/historial-bot` — tabla Fecha/Run/Región/Semanas/Encontrados/Descargados/Errores/Duración/Usuario, **del propio admin** (`/api/bot/historial`). | 🟡 mock |
| TSI-402 | `/mis-tramites/[id]` (**solo médico**) — "Informe generado" + **Ver PDF** / **Descargar DOCX** (`pdf-lib` / `docx`) + resolución: ratificar o modificar con **firma PNG**. Deja `estado_documento=RATIFICADO\|MODIFICADO` + `estado_flujo=COMPLETADO`. | 🟡 mock |
| TSI-102 | `prisma/schema.prisma` (PostgreSQL) — espejo de `BD/schema.sql`. Scripts `prisma:generate/migrate/studio`. Runtime sigue en el mock SQLite hasta que `DATABASE_URL` apunte a un PG real. | 🟡 esquema listo |
| TSI-105 | Módulo Automation (mock de `modules/automation/`): procesos **INGEST** y **ANALYSIS** con `start`/`stop`/`status` en `/api/automation/{ingest\|analysis}/{start\|stop\|status}`. Estado en `automation_procesos`, progreso simulado por tiempo. | 🟡 mock |
| TSI-207 | `/admin/automation` — 2 paneles (Ingesta/Análisis) con Iniciar/Detener y barra de progreso, polling cada 3 s. **Solo admin**. | ✅ cableado a TSI-105 |
| TSI-302 | `FichaCaso.tsx` — 11 secciones del informe (identificación, documentos, antecedentes, licencias, FULME, TPI, exámenes, alertas, cruces, propuesta, informe) en acordeón, dentro de `/mis-tramites/[id]`. | 🟡 informe mock |
| TSI-303 | `/mi-firma` — subir imagen **PNG o JPG** de la firma (`usuarios.firma`, `/api/mi-firma`). Al resolver un caso se usa la firma guardada o una nueva. | 🟡 mock |
| Devolución calidad→médico | Control de calidad devuelve un caso al médico con motivo (`devoluciones` + `casos.estado='DEVUELTO_MEDICO'`) | 🟡 calidad en pausa |
| TSI-112 | InstitutionProfile/Rule → PostgreSQL | ⬜ backend (compañero) |
| Calificación RM — flujo vista Admin | — | ⬜ falta detalle |

## Mock del backend (temporal) — destino: PostgreSQL + Prisma

El backend **aún no existe**. La BD final es **PostgreSQL** con **Prisma** (`prisma/schema.prisma`). Por mientras:
- `BD/` es un mock en SQLite (`node:sqlite`, sin deps nativas). `BD/schema.sql` y `prisma/schema.prisma` son el **contrato** de tablas — mantener ambos en sync.
- `src/app/api/*` implementa localmente lo mínimo (auth, semanas, carga, casos, quality/devolver, bot).
- Cuando haya un PostgreSQL: setear `DATABASE_URL`, `npm run prisma:migrate`, y cambiar `getDb()` por el cliente Prisma. Los componentes de UI no se tocan.
- `BOT_URL` (env): destino del envío de expedientes; vacío = se simula.

## Puesta en marcha

```bash
npm install
npm run db:init
npm run dev        # http://localhost:3010
```

| Rol | Correo | Contraseña | Ve en el menú |
|-----|--------|------------|---------------|
| medico (RM) | medico@salud.local | `Medico2026#` | Mis trámites · KPI · Mi firma |
| calidad (RM) | calidad@salud.local | `Calidad2026#` | Control de calidad · KPI |
| admin (Nacional) | admin@salud.local | `Admin2026#` | Administración · Control de calidad · KPI |

Roles: **medico**, **calidad**, **admin**. `Mis trámites` y `Mi firma` son exclusivos del rol
médico (TSI-301 / TSI-303 — solo el médico firma). Regiones: RM · OHIGGINS · BIOBIO · ANTOFAGASTA.

## Estructura

```
BD/                     mock de datos (SQLite) — temporal
src/
  middleware.ts         guarda de rutas + permisos por rol (roles.ts)
  lib/
    roles.ts            roles, permisos por ruta, ítems del menú
    session.ts          sesión JWT HS256 en cookie httpOnly
    usuarios.ts         acceso a datos + autenticación (mock)
    guard.ts            revalidación server-side por página
  components/
    SesionProvider.tsx  contexto "session" en cliente
    AppShell.tsx        cabecera + nav (TSI-202)
    casos.ts            informes, bandejas, resolución del médico (mock)
    bot.ts              semanas procesables, paquete, envío al bot, historial (mock)
    carga.ts            descarga de expedientes por semana (mock)
    informe-archivo.ts  informe -> PDF (pdf-lib) / DOCX (docx)
  app/
    login/              TSI-203
    (app)/              secciones protegidas (comparten AppShell)
      dashboard/  kpi/  mi-firma/  quality/
      mis-tramites/          TSI-301 (bandeja, solo médico)
      mis-tramites/[id]/     TSI-402 (pantalla resultado + resolución)
      admin/                 resumen + sub-nav (AdminTabs)
      admin/carga/           TSI-206 (descarga + envío al bot por semanas)
      admin/automation/      TSI-207
      admin/historial-bot/   TSI-208
      admin/modificados/     casos que el médico modificó
    api/
      auth/  casos/  casos/[id]/(resolver|informe)  bot/(semanas|paquete|enviar|historial)
      semanas/  carga/  quality/devolver
```

Contrato de BD: `BD/schema.sql` + `prisma/schema.prisma` (PostgreSQL). Estados por caso:
`estado` (DESCARGADO→ENVIADO_BOT→INFORME_RECIBIDO), `estado_documento` (BORRADOR→RATIFICADO|MODIFICADO)
y `estado_flujo` (EN_REVISION→COMPLETADO) — los dos últimos coexisten, como pediste.

## Seguridad

bcrypt (coste 12) · JWT HS256 httpOnly+SameSite=strict (8 h) · aislamiento por rol en
middleware + revalidación por página · anti fuerza bruta (5/10 min) · anti enumeración ·
anti open-redirect · cabeceras + CSP en `next.config.ts` · auditoría en `login_intentos`.

**Producción:** cambiar `AUTH_SECRET` y las contraseñas demo.
