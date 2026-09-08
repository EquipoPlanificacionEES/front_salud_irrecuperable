# Estrategia de datos del frontend

Cómo pide datos esta aplicación, por qué así, y qué hay que respetar al añadir
una pantalla. La medición que motivó todo esto está en
[`baseline-before-tanstack.md`](./baseline-before-tanstack.md).

## El problema que había

Dos cosas, y sólo una era de caché.

**La sesión se verificaba tres veces por render.** El middleware preguntaba a
`/api/v1/auth/me`, el layout protegido otra vez, y cada `page.tsx` una tercera.
Como el prefetch de `<Link>` repite el render entero por cada enlace, las ocho
pestañas de administración lo multiplicaban por ocho. Medido, con los 197 ms
reales de Render por salto: **11 verificaciones para un login de médico, 28 para
uno de admin, 23 para cargar una vez la pantalla de retenidos**.

**No había ninguna caché de estado de servidor.** Todo era `useEffect` +
`useState`, y ese estado moría con el componente. Volver a una vista costaba
exactamente lo mismo que entrar por primera vez: 816 ms y 82,5 KB para repintar
una lista descargada tres segundos antes. `GET /inbox` lo pedían tres pantallas
distintas; un recorrido normal descargaba 330 KB de la misma lista.

Y encima, 440 ms de cada navegación transcurrían sin ninguna señal visual.

## Sesión: una verificación por petición

```
petición
   ↓
middleware — ¿está la cookie? (sin red)
   ↓
layout + page — requerirSesion() → obtenerSesion(), memoizada con cache()
   ↓                                       ↓
render                          UNA llamada a /auth/me
   ↓
SesionProvider recibe la identidad ya verificada
```

`obtenerSesion()` va envuelta en `cache()` de React (`src/lib/session.ts`).
Memoiza **por petición**: React abre el ámbito al empezarla y lo tira al
acabarla, así que dos usuarios simultáneos nunca comparten valor y una sesión
revocada no sobrevive a la petición en curso.

**El middleware ya no es la guardia.** Mira si la cookie está y redirige; es un
atajo de experiencia. El control de acceso vive donde siempre:
`requerirSesion(ruta)` en el servidor, que valida contra el backend y aplica
`puedeAcceder` antes de renderizar, y el propio backend, que responde 401/403.
Una cookie inventada pasa el middleware y choca con la guardia de abajo — hay
una prueba que lo documenta explícitamente (`src/middleware.test.ts`), y si
alguna vez espera un rechazo, será porque el middleware volvió a llamar al
backend en cada navegación.

**El cliente no pregunta quién es.** No hay ningún `useQuery(["session"])` ni
`["me"]`: la identidad autoritativa llega con el render del servidor. Meterla en
TanStack replicaría el problema que acabamos de quitar.

## Caché: `QueryClient` en memoria y nada más

`src/components/QueryProvider.tsx`. Se crea una vez por instancia de cliente con
`useState`; construirlo en el cuerpo del componente lo tiraría en cada render.

**No se persiste.** Ni `persistQueryClient`, ni `localStorage`, ni IndexedDB.
Aquí dentro viaja el expediente clínico de personas identificadas y un equipo
compartido —un turno, un puesto de la subcomisión— no debe conservarlo cuando la
sesión termina. La única excepción es la IMAGEN de la firma del médico en
`MiFirma`, bajo clave por usuario, porque el backend no devuelve sus bytes por
diseño y no es un dato clínico.

Al cerrar sesión, en este orden: `cancelQueries()` —para que una respuesta
tardía no vuelva a sembrar la caché justo después de vaciarla— y luego `clear()`,
antes de navegar.

## Claves

Todas en `src/lib/query-keys.ts`. Una clave escrita a mano en el componente que
la usa es una invalidación que algún día no coincidirá con la consulta que
pretendía invalidar, y el fallo no se ve: la pantalla enseña un dato viejo.

Son jerárquicas y el objeto de filtros va **siempre al final**, para que
invalidar `["admin","cases"]` alcance a todas las combinaciones sin enumerarlas.

```
["doctor","inbox"]                          ["admin","batches",{status,limit}]
["doctor","signature"]                      ["admin","doctor-workload"]
["cases",caseId,"report"]                   ["admin","holds"]
["cases","manual-form",reportId]            ["admin","cases",{filtros}]
["reports",{filtros}]                       ["admin","assignment-context",batchId]
["exports"]                                 ["admin","users"] · ["admin","doctors"]
```

## Frescura

No hay un `staleTime` universal. El criterio es **quién mueve el dato y con qué
retraso puede enterarse quien lo mira**.

| Consulta | staleTime | Por qué |
|---|---|---|
| `doctor.inbox` | 30 s | La mueven las acciones del propio médico, que invalidan, y los workers de firma, que no avisan |
| `cases.report` | **5 s** | Ver abajo — la cifra tiene truco |
| `cases.manual-form` | 0 | Depende del snapshot vigente |
| `admin.holds` | 15 s | Varios administradores pueden actuar a la vez |
| `admin.cases` | 20 s | Las mueven las asignaciones y el pipeline |
| `reports` | 30 s | Igual que la bandeja |
| `admin.batches` | 5 min | Un lote se abre o se cierra a mano, rara vez |
| `admin.doctor-workload` | 60 s | Cambia con cada asignación, y ésas invalidan |
| `admin.users` / `doctors` | 5 min | Administración de personas, muy estable |
| `exports` | 0 + sondeo | Sondea sólo mientras quede algún trabajo en curso |

**Por qué el informe son 5 s y no 0.** La intuición dice cero: es el documento
que se va a firmar. Pero `staleTime` sólo decide si un MONTAJE nuevo vuelve a
pedir el dato; una vez en pantalla, el informe se queda ahí los minutos que el
médico tarde en leerlo. Bajarlo a cero no hace que lo que firma esté más fresco
— sólo obliga a volver a pedir lo que se acababa de prefetchar al pasar el
ratón. Eso se midió: **dos peticiones del mismo informe para abrir un caso**. Lo
que sí mantiene fresco lo que hay en pantalla es `refetchOnWindowFocus`, que
revalida al volver a la pestaña, y la invalidación explícita de las mutaciones.

## Invalidación

En `invalidacionesDe()` (`src/lib/queries.ts`), no repartida por los `onSuccess`
de cada pantalla. Cada acción caduca lo que cambió y **nada más**: recargar la
pantalla en la que estás es a la vez demasiado —descarta lo que nadie tocó— y
demasiado poco, porque las otras siguen enseñando el estado anterior.

| Acción | Caduca |
|---|---|
| Ratificar informe | `cases.report(id)`\*, `doctor.inbox`, `reports` |
| Corregir informe | `cases.report(id)`, `manual-form`, `doctor.inbox`, `reports` |
| Devolver desde calidad | `reports`, `doctor.inbox` |
| Levantar retención | `admin.holds`, `admin.cases`, `cases.report(id)`, `doctor.inbox` |
| Asignar / reasignar | `admin.doctor-workload`, `admin.cases`, `assignment-context`, `admin.batches`, `doctor.inbox` |
| Abrir/cerrar semana | `admin.batches`, `assignment-context` |
| Alta o edición de personas | `admin.users`, `admin.doctors`, `admin.doctor-workload` |

\* salvo con `{ informeYaRefrescado: true }`: ratificar sondea el informe hasta
que el worker firma, así que al terminar el de la caché ya es el vigente y
volver a pedirlo es el gasto que vinimos a quitar.

**Nunca `router.refresh()` como estrategia por defecto** después de una mutación.

**Nada de optimistic updates en lo clínico.** Ratificar, levantar una retención o
crear una firma no se dan por hechos antes de que el backend lo confirme. El
patrón es: botón pendiente al instante → backend → éxito → invalidar → interfaz
consistente. Si falla, se dice.

## Prefetch

Sólo por **intención probable**. Al pasar el ratón o enfocar el enlace de una
fila de la bandeja se pide su informe. Traer los 93 por si acaso serían 93
peticiones para abrir uno.

El prefetch usa la MISMA frescura que la consulta que lo va a consumir; con una
distinta, el montaje descarta lo prefetchado y pide dos veces.

## Carga

Tres niveles, cada uno donde corresponde:

1. **Transición de ruta** — `loading.tsx`. Next lo pinta en cuanto empieza la
   navegación, así que el hueco de 440 ms sin señal desaparece. Uno por FORMA,
   no por ruta: las ocho pestañas de administración comparten el suyo.
2. **Enlace pulsado** — `useLinkStatus` (`src/components/EnlaceNav.tsx`). Es la
   solución nativa de Next 16. Se descartó `nextjs-toploader`: haría lo mismo
   con una dependencia más y una barra global que no distingue qué se pulsó. El
   punto tarda 150 ms en aparecer porque una navegación prefetchada se resuelve
   antes y un parpadeo por clic es ruido.
3. **Refresco de fondo** — el contenido SE QUEDA y un punto discreto dice
   «Actualizando…». `isPending` (no hay nada) manda esqueleto; `isFetching` (ya
   hay algo) no borra nada.

Los esqueletos (`src/components/Skeleton.tsx`) llevan las alturas y el número de
columnas del contenido real: el panel del médico colapsaba de 3.898 px a 592 px
y volvía a crecer en cada visita.

En tablas con filtros, `placeholderData` conserva el resultado anterior mientras
llega el nuevo. La tabla no se desmonta para volver a aparecer.

## Al añadir una pantalla

- Los datos del servidor van en `lib/queries.ts` con su clave en
  `query-keys.ts`. Nada de `useEffect` + `fetch`.
- Lo de la interfaz —pestaña abierta, fila desplegada, texto a medio escribir—
  sigue en `useState`. TanStack Query es para estado de servidor.
- Si varias pantallas necesitan subconjuntos del mismo listado, se usa `select`
  sobre la misma consulta. Tres pestañas no son tres peticiones.
- Toda mutación relevante entra en el mapa de invalidación.
- Primera carga, esqueleto; refresco, indicador. Nunca borrar lo que hay.

## Escalabilidad — pendiente, no resuelto

`GET /inbox` **no pagina**, por diseño del backend: 887 bytes por caso, 82,5 KB
con los 93 de hoy, ~4,4 MB con 5.000. La capa de consultas no lo arregla, pero
tampoco lo estorba: `useDoctorInbox` devuelve la lista sin acoplar la interfaz a
que venga entera, así que pasar a `useInfiniteQuery` con cursor es un cambio en
el hook y en el contrato, no en las pantallas.

## Seguimiento para el backend — fuera de esta fase

- **Paginación de `/inbox`**, antes de que un contrato asigne miles de casos a un
  médico.
- **`ReportSnapshot` sin superar**: 534 filas con `supersededAt IS NULL` para 93
  casos. `createReportSnapshot` supera sólo dentro de la misma `caseAnalysisId`,
  nunca al crear una `CaseAnalysis` nueva. Hoy no rompe nada porque todas las
  capas ordenan por `createdAt DESC`, pero es frágil.
- **Latencia de la API**: ~197 ms por llamada al backend de Render, medidos
  contra `/auth/me` sin sesión. Es el suelo de todo lo demás y no se ha tocado.
