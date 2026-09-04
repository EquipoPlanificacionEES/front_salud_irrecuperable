# BD — contrato de datos para el backend

El frontend **no usa ninguna BD** (consume el backend vía proxy). Esta carpeta es la
**referencia de esquema** para el equipo de backend.

| Archivo | Qué es |
|---------|--------|
| `schema.sql` | DDL de todas las tablas (SQLite, traducible a PostgreSQL). Estados, índices y relaciones. |
| `../prisma/schema.prisma` | Los mismos modelos en Prisma (`provider = postgresql`). |
| `firmas_de_medicos/` | Firmas (PNG) de los 6 médicos reales, para cargarlas en `usuarios.firma`. |

> El front no genera ni siembra datos: consume el backend vía proxy.

## Roles

`medico`, `calidad`, `admin`. `usuarios.region` es un atributo TEXT (una sola región).
`usuarios.sis` = código del profesional en la Superintendencia de Salud. `usuarios.rut` = RUT del profesional.

## Médicos (con firma en `firmas_de_medicos/`)

| Nombre | SIS |
|--------|-----|
| Gabriela Saavedra | 637921 |
| Gabriel Jiménez | 306124 |
| Catalina Hormazábal | 920811 |
| Alicia Noboa | 920172 |
| Matías Olivares | 701168 |
| Luis Diaz | 913179 |

## Estados por caso

- `estado`: `DESCARGADO` → `ENVIADO_BOT` → `INFORME_RECIBIDO`
- `estado_documento`: `BORRADOR` → `RATIFICADO` | `MODIFICADO`
- `estado_flujo`: `EN_REVISION` → `COMPLETADO`  (los dos últimos coexisten)

Cada caso tiene `id` (Nº de caso) e `id_tramite` (Nº de búsqueda de 8 dígitos que usan los médicos).
`casos.medico_id` = médico asignado (**NULL cuando llega sin asignar** → el admin lo asigna a mano).
`casos.informe_json` = "PROPUESTA DE EVALUACIÓN TSI" (secciones I–V, sin anexo). `casos.documento_url` = único
documento de antecedentes. `casos.anio` = año del proceso.

## Asignaciones (admin)

- `usuarios.limite_semanal` = máximo de casos asignables a ese médico por semana.
- `semanas.limite_asignaciones` = tope total de asignaciones disponibles esa semana.
- Tablas `asignaciones` (primera asignación) y `reasignaciones` (movimiento entre médicos).
