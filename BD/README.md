# BD — contrato de datos para el backend

El frontend **no usa esta BD** (consume el backend vía proxy). Esta carpeta es la
**referencia de esquema + usuarios** para el equipo de backend.

| Archivo | Qué es |
|---------|--------|
| `schema.sql` | DDL de todas las tablas (SQLite, pero directo a PostgreSQL). Estados, índices y relaciones. |
| `seed.mjs` | Crea `BD/app.db` desde `schema.sql` y siembra los 3 usuarios base + roles + semanas 1..11. |
| `../prisma/schema.prisma` | Los mismos modelos en Prisma (provider `postgresql`). |

## Generar la BD de referencia

```bash
npm install          # incluye bcryptjs (devDependency, solo para el seed)
npm run db:init       # -> BD/app.db
```

## Usuarios sembrados (solo demo — cambiar en el backend real)

| Rol | Correo | Contraseña | Región |
|-----|--------|------------|--------|
| medico | medico@salud.local | `Medico2026#` | RM |
| calidad | calidad@salud.local | `Calidad2026#` | RM |
| admin | admin@salud.local | `Admin2026#` | — (nacional) |

`password_hash` = bcrypt (coste 12). `region` es un atributo TEXT (una sola región en el MVP).
Cada caso tiene `id` (Nº de caso) e `id_tramite` (Nº de búsqueda de 8 dígitos que usan los médicos).

## Estados por caso

- `estado`: `DESCARGADO` → `ENVIADO_BOT` → `INFORME_RECIBIDO`
- `estado_documento`: `BORRADOR` → `RATIFICADO` | `MODIFICADO`
- `estado_flujo`: `EN_REVISION` → `COMPLETADO`  (los dos últimos coexisten)
