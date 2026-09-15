"use client";

/**
 * INICIO DE LA REVISIÓN MÉDICA — se declara al pulsar «Revisar».
 *
 * `POST /api/v1/cases/:caseId/medical-review/start`. El backend lo registra UNA
 * vez por asignación (idempotente y con cerrojo ante doble clic) y ése es el
 * comienzo del tiempo de ciclo médico. No es seguimiento de actividad.
 *
 * ESTRATEGIA: AUDITORÍA FIABLE, EXPERIENCIA RESILIENTE.
 *   · No bloquea la navegación: si la petición falla, el médico entra igual al
 *     expediente. Impedirle trabajar por un fallo de medición sería peor que
 *     perder un dato, y el dato no se pierde para siempre: el siguiente
 *     «Revisar» vuelve a intentarlo (con su hora real, no una inventada).
 *   · `keepalive`: la petición sobrevive a que la pantalla cambie.
 *   · Guarda en memoria qué casos ya se declararon con éxito en esta sesión del
 *     navegador, para no repetir la llamada. El doble clic lo absorbe el
 *     servidor, que es quien garantiza que haya uno solo.
 */

const declarados = new Set<string>();
const enCurso = new Map<string, Promise<void>>();

function csrf(): string {
  const m = document.cookie.match(/(?:^|;\s*)sir_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export function iniciarRevision(caseId: string): Promise<void> {
  if (declarados.has(caseId)) return Promise.resolve();
  const pendiente = enCurso.get(caseId);
  if (pendiente) return pendiente;

  const promesa = fetch(`/api/v1/cases/${caseId}/medical-review/start`, {
    method: "POST",
    headers: { "x-csrf-token": csrf() },
    credentials: "same-origin",
    keepalive: true,
  })
    .then((res) => {
      if (res.ok) declarados.add(caseId);
    })
    .catch(() => {
      /* best effort: ver la nota de cabecera */
    })
    .finally(() => {
      enCurso.delete(caseId);
    });
  enCurso.set(caseId, promesa);
  return promesa;
}

/** Sólo para pruebas: olvida lo declarado en esta sesión. */
export function olvidarInicios(): void {
  declarados.clear();
  enCurso.clear();
}
