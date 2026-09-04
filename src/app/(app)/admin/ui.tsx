"use client";

// Primitivas visuales compartidas del área de administración.
// El objetivo es que cada pantalla se lea como una lista de acciones, no como
// un muro de clases de Tailwind repetidas.

import type { ReactNode } from "react";

type Tono = "neutral" | "azul" | "ok" | "obs" | "mal";

const CHIP_TONO: Record<Tono, string> = {
  neutral: "bg-zinc-100 text-zinc-600",
  azul: "bg-blue-50 text-[var(--atm-azul)]",
  ok: "bg-green-50 text-[var(--atm-ok)]",
  obs: "bg-amber-50 text-[var(--atm-obs)]",
  mal: "bg-red-50 text-[var(--atm-mal)]",
};

export function Chip({ tono = "neutral", children }: { tono?: Tono; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${CHIP_TONO[tono]}`}>
      {children}
    </span>
  );
}

// ---- Botones --------------------------------------------------------------

const BTN_BASE = "rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed";
const BTN_VAR = {
  primary: "bg-[var(--atm-azul)] text-white hover:bg-[var(--atm-azul2)]",
  ghost: "border border-[var(--atm-linea)] text-[var(--atm-azul)] hover:bg-blue-50",
  danger: "border border-red-300 text-[var(--atm-mal)] hover:bg-red-50",
  neutral: "border border-[var(--atm-linea)] text-zinc-600 hover:bg-zinc-50",
};

export function Btn({
  variante = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: keyof typeof BTN_VAR }) {
  return <button {...props} className={`${BTN_BASE} ${BTN_VAR[variante]} ${className}`} />;
}

// ---- Campos de formulario ----------------------------------------------

const FIELD = "rounded-lg border border-[var(--atm-linea)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--atm-azul2)]";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${FIELD} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${FIELD} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${FIELD} ${props.className ?? ""}`} />;
}

export function Campo({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-zinc-600">{label}</span>
      {children}
      {hint && <span className="text-xs text-zinc-400">{hint}</span>}
    </label>
  );
}

// ---- Mensajes -----------------------------------------------------------

export function Aviso({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <p
      className={`rounded-lg border px-4 py-2.5 text-sm ${
        ok ? "border-green-300 bg-green-50 text-[var(--atm-ok)]" : "border-red-300 bg-red-50 text-[var(--atm-mal)]"
      }`}
    >
      {children}
    </p>
  );
}

// ---- Tarjetas de indicador -------------------------------------------

export function Stat({ label, valor, tono = "neutral" }: { label: string; valor: ReactNode; tono?: Tono }) {
  const acento = tono === "neutral" ? "text-zinc-900" : CHIP_TONO[tono].split(" ")[1];
  return (
    <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-4 shadow-sm">
      <p className={`text-2xl font-semibold ${acento}`}>{valor}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{label}</p>
    </div>
  );
}

// ---- Tabla ------------------------------------------------------------

export function Tabla({ columnas, children }: { columnas: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--atm-th)] text-left text-white">
            {columnas.map((c, i) => (
              <th key={i} className="px-4 py-2.5 font-medium whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function FilaVacia({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-10 text-center text-sm text-zinc-400">
        {children}
      </td>
    </tr>
  );
}

// ---- Traducciones de estado -----------------------------------------

export function batchTono(status: string): Tono {
  return status === "OPEN" ? "ok" : "neutral";
}

export function workflowTono(w: string): Tono {
  if (w === "SIGNED" || w === "APPROVED") return "ok";
  if (w === "CHANGES_REQUESTED") return "obs";
  if (w === "SIGNING_FAILED") return "mal";
  return "azul";
}

export const EXPORT_LABEL: Record<string, string> = {
  PENDING: "En cola",
  PROCESSING: "Procesando",
  READY: "Listo",
  FAILED: "Falló",
  EXPIRED: "Vencido",
};

export function exportTono(s: string): Tono {
  if (s === "READY") return "ok";
  if (s === "FAILED") return "mal";
  if (s === "EXPIRED") return "neutral";
  return "azul";
}
