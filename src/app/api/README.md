# src/app/api — proxy al backend

El front **no tiene datos ni lógica propia**. Todo `/api/*` se reenvía al backend real
(`BACKEND_URL`) mediante un único proxy: [`[...ruta]/route.ts`](./[...ruta]/route.ts).

- Reenvía método, query, body y headers (incluida la cookie de sesión).
- Devuelve el status y el body del backend, y propaga `Set-Cookie` (login/logout).
- Sin `BACKEND_URL` → responde `503` (aún no integrado).

La cookie de sesión (httpOnly, JWT HS256) la emite y borra **el backend**. El front solo la
verifica en `src/middleware.ts` / `src/lib/session.ts` con `AUTH_SECRET` (compartido con el backend)
para proteger rutas por rol.

## Endpoints que consume el front (los expone el backend)

| Ruta | Uso en el front |
|------|-----------------|
| `POST /api/auth/login` · `POST /api/auth/logout` | login / logout |
| `GET /api/casos?flujo=&estado=&decision=` | bandejas médico / calidad / admin |
| `GET /api/casos/{id}` | ficha del caso |
| `POST /api/casos/{id}/resolver` | ratificar / modificar + firma |
| `GET /api/casos/{id}/informe?formato=pdf\|docx` | Ver PDF / Descargar DOCX |
| `GET /api/mi-firma` · `POST /api/mi-firma` | firma del médico |
| `GET /api/semanas` · `POST /api/carga` | carga de expedientes por semana (admin) |
| `GET /api/bot/semanas` · `POST /api/bot/enviar` · `GET /api/bot/historial` | envío al bot / historial (admin) |
| `GET/POST /api/automation/{ingest\|analysis}/{start\|stop\|status}` | procesos del bot (admin) |
| `POST /api/quality/devolver` | devolución calidad → médico |
