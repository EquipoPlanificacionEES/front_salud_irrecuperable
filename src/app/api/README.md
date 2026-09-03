# src/app/api — APIs internas del front

Carpeta para los endpoints pequeños que consume el propio frontend
(route handlers de Next.js). El backend "grande" lo desarrolla el compañero aparte.

| Ruta | Método | Qué hace |
|------|--------|----------|
| `/api/auth/login`  | POST | Valida credenciales contra la BD y crea la cookie de sesión. |
| `/api/auth/logout` | POST | Cierra la sesión (borra la cookie). |
| `/api/auth/me`     | GET  | Devuelve la sesión actual (uid, rol, nombre) o 401. |

Convención: una carpeta por dominio (`auth/`, luego `casos/`, etc.), cada endpoint en su `route.ts`.
Todos corren en runtime Node (acceso a `BD/`). La autorización por rol la aplica `src/middleware.ts`.
