"use client";

import { useId, useState } from "react";
import { ApiFallo } from "@/lib/api";
import { useOrientationReview } from "@/lib/queries";
import { ORIENTATION_LABEL, type Orientation, type OrientationReason } from "@/lib/backend";
import { AdvertenciaIdentidad } from "./AdvertenciaIdentidad";

/**
 * EL FUNDAMENTO DE LA ORIENTACIÓN IA, para ADMIN y CALIDAD.
 *
 * Objetivo: entender en pocos segundos POR QUÉ el análisis orientó el
 * expediente como lo hizo. Es una ayuda de revisión, no una decisión: la
 * palabra es «Orientación IA». Nunca se apoya sólo en el color — cada estado
 * lleva texto y un glifo.
 *
 * Los textos los redacta el backend. Aquí no se traducen códigos ni se pinta
 * JSON; si falta un campo, simplemente no se muestra.
 */

const GLIFO: Record<Orientation | "NONE", string> = {
  RECOVERABLE: "✓",
  IRRECOVERABLE: "✕",
  INDETERMINATE: "?",
  NONE: "–",
};

const TONO: Record<Orientation | "NONE", string> = {
  RECOVERABLE: "border-green-200 bg-green-50 text-[var(--atm-ok)]",
  IRRECOVERABLE: "border-zinc-300 bg-zinc-100 text-zinc-700",
  INDETERMINATE: "border-amber-200 bg-amber-50 text-[var(--atm-obs)]",
  NONE: "border-zinc-200 bg-zinc-50 text-zinc-500",
};

function etiquetaOrientacion(a: Orientation | null | undefined): string {
  return a ? ORIENTATION_LABEL[a] : "Sin orientación";
}

/** Insignia de orientación: glifo + texto. El glifo es decorativo. */
export function InsigniaOrientacion({ assessment }: { assessment: Orientation | null | undefined }) {
  const k = assessment ?? "NONE";
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONO[k]}`}
    >
      <span aria-hidden="true">{GLIFO[k]}</span>
      {etiquetaOrientacion(assessment)}
    </span>
  );
}

export function ChipRevisionMedica() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-[var(--atm-obs)]">
      <span aria-hidden="true">!</span>
      Requiere revisión médica
    </span>
  );
}

/**
 * Celda de orientación para los listados: etiqueta, motivo corto y, si hace
 * falta, el aviso de revisión médica. Sin párrafos.
 */
export function OrientacionCelda({
  assessment,
  reason,
}: {
  assessment: Orientation | null;
  reason?: OrientationReason | null;
}) {
  return (
    <div className="min-w-0 max-w-64">
      <span className="text-zinc-700">{assessment ? ORIENTATION_LABEL[assessment] : "—"}</span>
      {reason?.label && (
        <span className="mt-0.5 block truncate text-[11px] text-zinc-500" title={reason.label}>
          {reason.label}
        </span>
      )}
      {reason?.requiresClinicalReview && (
        <span className="mt-1 block">
          <ChipRevisionMedica />
        </span>
      )}
    </div>
  );
}

function Lista({ titulo, items }: { titulo: string; items: string[] | undefined | null }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-zinc-600">{titulo}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-zinc-700">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function OrientationReviewCard({ reportId, enabled = true }: { reportId: string; enabled?: boolean }) {
  const { data, error, isPending } = useOrientationReview(reportId, { enabled });
  const [abierto, setAbierto] = useState(false);
  const idDetalle = useId();

  const marco = "rounded-xl border border-[var(--atm-linea)] bg-white p-4 text-sm shadow-sm";

  if (error) {
    return (
      <div className={marco} role="alert">
        <p className="text-zinc-600">
          No se pudo cargar el fundamento de la orientación.
          {error instanceof ApiFallo && error.message ? ` ${error.message}` : ""}
        </p>
      </div>
    );
  }

  if (isPending || !data) {
    return (
      <div className={marco} aria-busy="true" aria-live="polite">
        <p className="text-zinc-400">Cargando fundamento…</p>
        <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-zinc-200/70" />
      </div>
    );
  }

  const conclusiva = data.assessment === "RECOVERABLE" || data.assessment === "IRRECOVERABLE";
  const aFavor = data.supportingSummary ?? [];
  const enContra = data.opposingSummary ?? [];
  const presente = data.presentEvidence ?? [];
  const falta = data.missingEvidence ?? [];
  const advertencias = data.warnings ?? [];
  const hayDetalle = [aFavor, enContra, presente, falta, advertencias].some((l) => l.length > 0);

  return (
    <section className={`${marco} space-y-3`} aria-label="Orientación IA">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-zinc-800">Orientación IA</h3>
        <InsigniaOrientacion assessment={data.assessment} />
        {data.requiresClinicalReview && <ChipRevisionMedica />}
      </header>

      {data.rationale && (
        <div>
          <p className="text-xs font-semibold text-zinc-600">{conclusiva ? "Fundamento IA" : "Motivo"}</p>
          <p className="mt-0.5 text-zinc-700">{data.rationale}</p>
        </div>
      )}

      {(data.identityWarnings?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-600">Identidad frente a la planilla oficial</p>
          <div className="mt-1">
            <AdvertenciaIdentidad warnings={data.identityWarnings} />
          </div>
        </div>
      )}

      {data.whatToReview && (
        <div>
          <p className="text-xs font-semibold text-zinc-600">Qué falta / qué revisar</p>
          <p className="mt-0.5 text-zinc-700">{data.whatToReview}</p>
        </div>
      )}

      {hayDetalle && (
        <div>
          <button
            type="button"
            aria-expanded={abierto}
            aria-controls={idDetalle}
            onClick={() => setAbierto((v) => !v)}
            className="rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs font-medium text-[var(--atm-azul)] hover:bg-blue-50"
          >
            {abierto ? "Ocultar elementos considerados" : "Ver elementos considerados"}
          </button>
          {abierto && (
            <div id={idDetalle} className="mt-3 grid gap-3 sm:grid-cols-2">
              <Lista titulo="A favor de recuperación" items={aFavor} />
              <Lista titulo="En contra" items={enContra} />
              <Lista titulo="Evidencia presente" items={presente} />
              <Lista titulo="Evidencia que no consta" items={falta} />
              <Lista titulo="Advertencias" items={advertencias} />
            </div>
          )}
        </div>
      )}

      <p className="border-t border-[var(--atm-linea)] pt-2 text-[11px] text-zinc-400">
        Ayuda de revisión: la decisión es del profesional.
      </p>
    </section>
  );
}
