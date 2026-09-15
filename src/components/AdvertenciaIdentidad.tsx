import type { IdentityWarning } from "@/lib/backend";

/**
 * ADVERTENCIA DE IDENTIDAD — el nombre del expediente no coincide con la
 * planilla oficial de la semana.
 *
 * Con el RUT coincidente NO bloquea: el RUT dice de quién es el expediente.
 * Pero una diferencia de grafía se revisa ANTES de firmar, así que se muestra
 * donde se firma. No corrige nada: enseña los dos nombres tal como están.
 *
 *   · REVIEW_WARNING / BLOCKING — aviso visible, con texto (no sólo color).
 *   · INFORMATIONAL — una línea discreta: nombres de más o de menos, orden.
 *
 * `firmado`: el informe ya se firmó; el aviso queda como constancia, sin
 * pedir ninguna acción sobre el documento.
 */
export function AdvertenciaIdentidad({
  warnings,
  firmado = false,
}: {
  warnings: IdentityWarning[] | null | undefined;
  firmado?: boolean;
}) {
  const lista = warnings ?? [];
  if (lista.length === 0) return null;
  const graves = lista.filter((w) => w.severity !== "INFORMATIONAL");
  const leves = lista.filter((w) => w.severity === "INFORMATIONAL");

  const nombres = (w: IdentityWarning) => (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      <dt className="text-zinc-500">Planilla oficial</dt>
      <dd className="font-medium text-zinc-800">{w.expectedName ?? "—"}</dd>
      <dt className="text-zinc-500">Expediente</dt>
      <dd className="font-medium text-zinc-800">{w.observedName ?? "—"}</dd>
    </dl>
  );

  return (
    <div className="space-y-2">
      {graves.map((w, i) => (
        <div
          key={`g${i}`}
          role={firmado ? "note" : "alert"}
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-zinc-800"
        >
          <p className="font-semibold text-[var(--atm-obs)]">
            <span aria-hidden="true">! </span>
            {w.rutMatch === false
              ? "Identidad no coincide con la planilla"
              : firmado
                ? "Advertencia de identidad (informe ya firmado)"
                : "Revisar nombre antes de firmar"}
          </p>
          <p className="mt-1">
            {w.rutMatch === true
              ? "El RUT coincide con la fuente oficial, pero existe una diferencia en la grafía del nombre."
              : w.rutMatch === false
                ? "El RUT del expediente no coincide con el de la fuente oficial."
                : "No fue posible confirmar el RUT del expediente contra la fuente oficial."}
          </p>
          {nombres(w)}
          {!firmado && w.rutMatch !== false && <p className="mt-1 text-xs text-zinc-600">Revise la grafía antes de firmar.</p>}
        </div>
      ))}
      {leves.map((w, i) => (
        <div key={`l${i}`} className="rounded-lg border border-[var(--atm-linea)] bg-white px-4 py-2 text-xs text-zinc-600">
          <p>
            <span aria-hidden="true">ⓘ </span>
            El nombre difiere en formato respecto de la fuente oficial (el RUT coincide).
          </p>
          {nombres(w)}
        </div>
      ))}
    </div>
  );
}
