# front_salud_irrecuperable

Frontend (Next.js 16 + Tailwind v4) de la plataforma de calificación de salud irrecuperable.
**No tiene datos ni lógica propia**: consume el backend real vía proxy.

## Arquitectura

```
navegador ─► Next.js ─► /api/[...ruta] ──► proxy al backend real (BACKEND_URL)
```

- La sesión (cookie httpOnly, JWT HS256) la emite el backend; el front la verifica
  (`src/middleware.ts` + `src/lib/session.ts`) con `AUTH_SECRET` para proteger rutas por rol.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # AUTH_SECRET + BACKEND_URL
npm run dev                   # http://localhost:3010
```

| Variable | Qué es |
|----------|--------|
| `AUTH_SECRET` | Clave HS256 para verificar el JWT. **Igual a la que firma el backend.** |
| `BACKEND_URL` | URL base del backend. Ej. `https://api.example.com` |
| `SESSION_COOKIE` | (opcional) nombre de la cookie de sesión. Default `sesion`. |

## Rutas (roles)

| Ruta | Rol | Ticket |
|------|-----|--------|
| `/login` | público | TSI-203 |
| `/dashboard` `/kpi` | todos | TSI-201 |
| `/mis-tramites` · `/mis-tramites/[id]` | **medico** | TSI-301 / 302 / 402 |
| `/mi-firma` | **medico** | TSI-303 |
| `/quality` | calidad · admin | — (calidad en pausa) |
| `/admin` · `/admin/asignaciones` · `/admin/reasignacion` · `/admin/usuarios` · `/admin/carga` · `/admin/automation` · `/admin/historial-bot` · `/admin/modificados` | **admin** | TSI-206 / 207 / 208 / 105 |

Región: atributo único (viene en el JWT). Cada caso: `id` (Nº de caso) e `id_tramite` (Nº de búsqueda).

## Endpoints que el backend debe exponer

Ver [`src/app/api/README.md`](src/app/api/README.md).

## Contrato de datos para el backend

[`BD/`](BD/README.md) — `schema.sql` (DDL) + firmas reales de médicos, y
[`prisma/schema.prisma`](prisma/schema.prisma). El front no usa esta BD; es la referencia de tablas.

## Estructura

```
src/
  middleware.ts            guarda de rutas + permisos por rol
  lib/  session.ts (verify JWT) · guard.ts · roles.ts
  components/  AppShell · SesionProvider · Placeholder
  app/
    login/                 TSI-203
    (app)/                  secciones protegidas (AppShell + verificación de sesión)
      dashboard/ kpi/ quality/
      mis-tramites/  mis-tramites/[id]/  mi-firma/
      admin/  admin/{asignaciones,reasignacion,usuarios,carga,automation,historial-bot,modificados}/
    api/[...ruta]/          proxy único al backend
BD/                       contrato de datos (schema.sql + firmas) — el front NO lo usa
prisma/schema.prisma      modelos Prisma (PostgreSQL) para el backend
```
