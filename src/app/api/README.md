# src/app/api — proxy al backend real

`/api/*` pasa por [`[...ruta]/route.ts`](./[...ruta]/route.ts): reenvía método, query,
body, cookie y `x-csrf-token` a `${BACKEND_URL}` **verbatim** (sin reescribir el path).
El front llama directamente a las rutas reales `/api/v1/...`. Propaga `Set-Cookie`.
Sin `BACKEND_URL` responde `502`.

## Sesión (backend, ADR-0023)

- `POST /api/v1/auth/login` con `{ email, password }` → setea `sir_session` (HttpOnly) + `sir_csrf`.
- El front NO verifica token: `src/lib/session.ts` llama a `GET /api/v1/auth/me` con la cookie.
- Mutaciones (POST/PUT/PATCH/DELETE): header `x-csrf-token` = valor de la cookie `sir_csrf`
  (lo hace `src/lib/api.ts`).
- Roles backend `ADMIN/DOCTOR/QUALITY` → front `admin/medico/calidad` (mapeo en `session.ts`).

## Estado de integración (todo contra el backend real)

| Pantalla | Endpoint(s) | Estado |
|---|---|---|
| Login / logout / guardas por rol | `/auth/login` `/auth/me` `/auth/logout` | ✅ |
| Admin · Resumen | `/admin/batches` `/admin/doctor-workload` | ✅ |
| Admin · Semanas | `/admin/batches` (GET/POST) `/close` `/reopen` | ✅ crear / cerrar / reabrir |
| Admin · Asignaciones | `/admin/batches/:id/assignment-context` `/assignments/preview` `/assignments` | ✅ (falta data de casos para el reparto real) |
| Admin · Casos | `/admin/cases` · `PUT /admin/cases/:id/assignment` · `/assignment/end` | ✅ listar + reasignar |
| Admin · Informes | `/reports` · `/reports/:id/download` · `/signed-document` | ✅ listar + descargar |
| Admin · Exportaciones | `/exports` (GET/POST) · `/exports/:id/download` | ✅ generar ZIP + descargar |
| Admin · Usuarios | `/admin/users` + `/admin/doctors` (GET/POST/PATCH, deactivate/reactivate, credential-setup) | ✅ |
| Médico · Mi firma | `GET/PUT /doctors/me/signature` | ✅ |
| Médico · Ficha del caso | `GET /cases/:id/report` · `POST /reports/:id/reviews` · `/approve` | ✅ (se entra por Nº de caso: no hay bandeja del médico en el backend aún) |
| Control de calidad | `GET /reports` (solo lectura) | ⏳ el circuito de calidad (cola/claim/review) no está en el backend |

Rutas reales: `http://localhost:3000/openapi.json` (40 rutas). **Swagger manda.**
