"use client";

import { useMemo, useState } from "react";

/**
 * EL EDITOR DEL INFORME — uno solo, para los tres desenlaces.
 *
 * LO DESCRIBE EL SERVIDOR. Qué campos hay, cuáles se pueden tocar, cuáles son
 * obligatorios y cuáles exigen motivo sale de `GET /reports/:id/manual-form`, no
 * de reglas escritas aquí. Si vivieran en el navegador, la primera divergencia
 * sería un campo que esta pantalla da por opcional y el servidor rechaza — con
 * el médico enterándose al pulsar confirmar, después de escribir veinte minutos.
 *
 * LO QUE DIJO EL SISTEMA NO SE ESCONDE. Cada campo corregido enseña debajo lo
 * que había establecido el motor y ofrece volver a ello. Un editor que sustituye
 * el valor y se olvida del anterior convierte una corrección en un dato sin
 * procedencia, y la pregunta que habrá que responder si se cuestiona es
 * exactamente cuál era el valor de partida.
 *
 * ESTO NO ESCRIBE NADA. Mantiene un borrador en memoria; la corrección se
 * persiste cuando el médico confirma, por el camino que ya existía. Un
 * `DoctorCorrection` por pulsación de tecla sería un historial ilegible.
 */

export interface CampoFormulario {
  readonly key: string;
  readonly label: string;
  readonly kind: "TEXT" | "LONG_TEXT" | "INTEGER" | "CHOICE" | "DATE";
  readonly value: string;
  readonly systemValue: string;
  readonly doctorValue: string | null;
  readonly effectiveValue: string;
  readonly editable: boolean;
  readonly required: boolean;
  readonly systemDetermined: boolean;
  readonly sourceType: "SOURCE_EXTRACTION" | "ENGINE_COMPUTED" | "ENGINE_NARRATIVE" | "DOCTOR_ONLY";
  readonly correctionReasonRequired: boolean;
  readonly options?: readonly { readonly value: string; readonly label: string }[];
}

export interface SeccionFormulario {
  readonly id: "I" | "II" | "III" | "IV" | "V";
  readonly title: string;
  readonly fields: readonly CampoFormulario[];
}

export interface FormularioInforme {
  readonly reportSnapshotId: string;
  readonly version: number;
  readonly sections: readonly SeccionFormulario[];
}

/** Lo que el médico lleva escrito. Sólo memoria: no se ha guardado nada. */
export interface Borrador {
  readonly valores: Record<string, string>;
  readonly motivo: string;
  readonly nota: string;
}

export function borradorInicial(form: FormularioInforme | null): Borrador {
  const valores: Record<string, string> = {};
  for (const s of form?.sections ?? []) {
    // Se arranca del valor que HOY se imprimiría. Así «no tocar nada» y
    // «reenviar lo mismo» son lo mismo, y el diff de abajo no manda ruido.
    for (const f of s.fields) valores[f.key] = f.effectiveValue;
  }
  return { valores, motivo: "", nota: "" };
}

/** Un campo cambiado respecto de lo que el informe dice hoy. */
export function camposModificados(
  form: FormularioInforme | null,
  borrador: Borrador,
): CampoFormulario[] {
  const salida: CampoFormulario[] = [];
  for (const s of form?.sections ?? []) {
    for (const f of s.fields) {
      if (!f.editable) continue;
      if ((borrador.valores[f.key] ?? "").trim() !== f.effectiveValue.trim()) salida.push(f);
    }
  }
  return salida;
}

/** ¿Hay algún cambio que exija motivo escrito? Hoy: la identificación. */
export function exigeMotivo(form: FormularioInforme | null, borrador: Borrador): boolean {
  return camposModificados(form, borrador).some((f) => f.correctionReasonRequired);
}

/**
 * EL CUERPO QUE SE ENVÍA. Sólo lo que cambió.
 *
 * Un campo que el médico no tocó NO viaja: el servidor parte de la versión
 * actual, así que omitirlo lo conserva. Mandarlo todo haría indistinguible
 * «confirmé este valor» de «lo escribí yo», que es la distinción entera.
 */
export function cuerpoDeCorreccion(
  form: FormularioInforme | null,
  borrador: Borrador,
): Record<string, unknown> | null {
  const cambiados = camposModificados(form, borrador);
  const seccionDe = new Map<string, SeccionFormulario["id"]>();
  for (const s of form?.sections ?? []) for (const f of s.fields) seccionDe.set(f.key, s.id);

  const identity: Record<string, string | number> = {};
  const figures: Record<string, number> = {};
  const figureTexts: Record<string, string> = {};
  let clinicalAnalysis: string | undefined;
  let conclusion = "";
  let assessment: "RECOVERABLE" | "IRRECOVERABLE" | null = null;

  // La conclusión y la evaluación viajan SIEMPRE: son lo que se firma, y el
  // servidor las exige aunque el médico las deje tal cual venían.
  for (const s of form?.sections ?? []) {
    for (const f of s.fields) {
      const v = (borrador.valores[f.key] ?? "").trim();
      if (f.key === "conclusion") conclusion = v;
      if (f.key === "assessment" && (v === "RECOVERABLE" || v === "IRRECOVERABLE")) assessment = v;
    }
  }
  if (assessment === null || conclusion === "") return null;

  for (const f of cambiados) {
    const v = (borrador.valores[f.key] ?? "").trim();
    const seccion = seccionDe.get(f.key);
    if (f.key === "conclusion" || f.key === "assessment") continue;
    if (f.key === "clinicalAnalysis") {
      clinicalAnalysis = v;
      continue;
    }
    if (seccion === "I") {
      if (f.key === "ageYears") {
        const n = Number(v);
        if (Number.isInteger(n) && n >= 0) identity[f.key] = n;
      } else if (v !== "") identity[f.key] = v;
      continue;
    }
    if (seccion === "II") {
      if (f.kind === "INTEGER") {
        const n = Number(v);
        if (Number.isInteger(n) && n >= 0) figures[f.key] = n;
      } else if (v !== "") figureTexts[f.key] = v;
    }
  }

  return {
    schemaVersion: 2,
    assessment,
    conclusion,
    ...(clinicalAnalysis !== undefined ? { clinicalAnalysis } : {}),
    ...(Object.keys(figures).length ? { figures } : {}),
    ...(Object.keys(figureTexts).length ? { figureTexts } : {}),
    ...(Object.keys(identity).length ? { identity } : {}),
    ...(borrador.motivo.trim() ? { correctionReason: borrador.motivo.trim() } : {}),
    ...(borrador.nota.trim() ? { note: borrador.nota.trim() } : {}),
  };
}

const ORIGEN: Record<CampoFormulario["sourceType"], string> = {
  SOURCE_EXTRACTION: "Leído del expediente",
  ENGINE_COMPUTED: "Calculado por el sistema",
  ENGINE_NARRATIVE: "Redactado por el sistema",
  DOCTOR_ONLY: "Lo aporta el profesional",
};

const entrada =
  "w-full rounded-lg border border-[var(--atm-linea)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--atm-azul2)]";

export function EditorInforme({
  form,
  borrador,
  onChange,
}: {
  form: FormularioInforme;
  borrador: Borrador;
  onChange: (b: Borrador) => void;
}) {
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({
    I: false,
    II: true,
    III: true,
    IV: true,
    V: true,
  });

  const modificados = useMemo(
    () => new Set(camposModificados(form, borrador).map((f) => f.key)),
    [form, borrador],
  );
  const motivoObligatorio = exigeMotivo(form, borrador);

  const set = (key: string, valor: string) =>
    onChange({ ...borrador, valores: { ...borrador.valores, [key]: valor } });

  return (
    <div className="space-y-3">
      {form.sections.map((s) => {
        const cambiadosAqui = s.fields.filter((f) => modificados.has(f.key)).length;
        const abierta = abiertas[s.id] ?? true;
        return (
          <section
            key={s.id}
            className="overflow-hidden rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm"
          >
            <button
              type="button"
              onClick={() => setAbiertas((a) => ({ ...a, [s.id]: !abierta }))}
              className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left hover:bg-[var(--atm-fondo)]"
              aria-expanded={abierta}
            >
              <h4 className="text-sm font-semibold text-zinc-800">{s.title}</h4>
              <span className="flex items-center gap-2">
                {cambiadosAqui > 0 && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-[var(--atm-obs)]">
                    {cambiadosAqui} modificado{cambiadosAqui > 1 ? "s" : ""}
                  </span>
                )}
                <span aria-hidden className="text-zinc-400">
                  {abierta ? "▾" : "▸"}
                </span>
              </span>
            </button>

            {abierta && (
              <div className="grid gap-4 border-t border-[var(--atm-linea)] px-5 py-4 sm:grid-cols-2">
                {s.fields.map((f) => (
                  <Campo
                    key={f.key}
                    campo={f}
                    valor={borrador.valores[f.key] ?? ""}
                    modificado={modificados.has(f.key)}
                    onChange={(v) => set(f.key, v)}
                    onRestaurar={() => set(f.key, f.systemValue)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/*
        EL MOTIVO. Aparece SÓLO cuando se tocó algo que lo exige, en vez de
        pedirlo siempre: obligar a justificar cada coma de la narrativa enseña a
        escribir "corrección" y vaciar el campo de sentido.
      */}
      {motivoObligatorio && (
        <div className="rounded-xl border border-[var(--atm-obs)] bg-amber-50/60 px-5 py-4">
          <label className="block text-sm">
            <span className="font-medium text-zinc-800">Motivo de la corrección</span>
            <span className="mt-0.5 block text-xs text-zinc-600">
              Cambiaste datos de identificación. Queda registrado con tu nombre y es lo que habrá
              que releer si la corrección se cuestiona. Mínimo 10 caracteres.
            </span>
            <textarea
              className={`${entrada} mt-2`}
              rows={2}
              value={borrador.motivo}
              onChange={(e) => onChange({ ...borrador, motivo: e.target.value })}
              placeholder="Qué decía el expediente original y por qué esto es lo correcto"
            />
          </label>
        </div>
      )}

      <label className="block text-sm">
        <span className="text-zinc-600">Nota para el expediente (opcional)</span>
        <textarea
          className={`${entrada} mt-1`}
          rows={2}
          value={borrador.nota}
          onChange={(e) => onChange({ ...borrador, nota: e.target.value })}
          placeholder="No se imprime en el informe"
        />
      </label>
    </div>
  );
}

function Campo({
  campo,
  valor,
  modificado,
  onChange,
  onRestaurar,
}: {
  campo: CampoFormulario;
  valor: string;
  modificado: boolean;
  onChange: (v: string) => void;
  onRestaurar: () => void;
}) {
  const largo = campo.kind === "LONG_TEXT";
  const id = `campo-${campo.key}`;

  return (
    <div className={largo ? "sm:col-span-2" : ""}>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
        <label htmlFor={id} className="text-sm text-zinc-700">
          {campo.label}
          {campo.required && <span className="text-[var(--atm-mal)]"> *</span>}
        </label>
        {!campo.systemDetermined && (
          <span className="text-xs font-medium text-[var(--atm-obs)]">· por completar</span>
        )}
        {modificado && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-[var(--atm-obs)]">
            Modificado por ti
          </span>
        )}
      </div>

      {campo.kind === "CHOICE" ? (
        <div className="flex flex-wrap gap-2">
          {(campo.options ?? []).map((o) => (
            <label
              key={o.value}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                valor === o.value
                  ? "border-[var(--atm-azul2)] bg-white font-medium text-[var(--atm-azul)]"
                  : "border-[var(--atm-linea)] bg-white text-zinc-600"
              }`}
            >
              <input
                type="radio"
                name={campo.key}
                checked={valor === o.value}
                onChange={() => onChange(o.value)}
                disabled={!campo.editable}
              />
              {o.label}
            </label>
          ))}
        </div>
      ) : largo ? (
        <textarea
          id={id}
          className={`${entrada} min-h-[130px]`}
          value={valor}
          disabled={!campo.editable}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          type={campo.kind === "INTEGER" ? "number" : "text"}
          {...(campo.kind === "INTEGER" ? { min: 0 } : {})}
          className={entrada}
          value={valor}
          disabled={!campo.editable}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {/*
        LO QUE DIJO EL SISTEMA, siempre visible. No desaparece al editar: el
        médico tiene que poder ver de qué está discrepando MIENTRAS discrepa.
      */}
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
        <span className="text-zinc-400">{ORIGEN[campo.sourceType]}:</span>
        <span className="font-medium text-zinc-600">
          {campo.systemValue === "" ? "—" : campo.systemValue}
        </span>
        {modificado && campo.systemValue !== "" && (
          <button
            type="button"
            onClick={onRestaurar}
            className="text-[var(--atm-azul)] underline underline-offset-2"
          >
            restaurar
          </button>
        )}
      </p>
    </div>
  );
}
