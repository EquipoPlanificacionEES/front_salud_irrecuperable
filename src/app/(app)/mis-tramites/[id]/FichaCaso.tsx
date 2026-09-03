"use client";

// TSI-302 — Ficha del caso: todas las secciones del informe del bot.

type Obj = Record<string, unknown>;

function Valor({ v }: { v: unknown }) {
  if (v == null) return <span className="text-zinc-400">—</span>;
  if (Array.isArray(v)) {
    if (v.length && typeof v[0] === "object") {
      const cols = Object.keys(v[0] as Obj);
      return (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-zinc-500">
              {cols.map((c) => (
                <th key={c} className="py-1 pr-3 font-medium">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(v as Obj[]).map((row, i) => (
              <tr key={i} className="border-t border-[var(--atm-linea)]">
                {cols.map((c) => (
                  <td key={c} className="py-1 pr-3 text-zinc-700">{String(row[c] ?? "—")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    return <span className="text-zinc-700">{v.join(", ")}</span>;
  }
  if (typeof v === "object") {
    return (
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {Object.entries(v as Obj).map(([k, val]) => (
          <div key={k} className="flex gap-2 text-xs">
            <dt className="min-w-32 text-zinc-500">{k}</dt>
            <dd className="text-zinc-700">{Array.isArray(val) ? val.join(", ") : String(val ?? "—")}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span className="text-zinc-700">{String(v)}</span>;
}

const SECCIONES: { key: string; titulo: string }[] = [
  { key: "identificacion", titulo: "Identificación" },
  { key: "documentos", titulo: "Documentos" },
  { key: "antecedentes", titulo: "Antecedentes" },
  { key: "licencias", titulo: "Licencias" },
  { key: "fulme", titulo: "FULME" },
  { key: "tpi", titulo: "TPI" },
  { key: "examenes", titulo: "Exámenes" },
  { key: "alertas", titulo: "Alertas" },
  { key: "cruces", titulo: "Cruces" },
  { key: "propuesta", titulo: "Propuesta" },
  { key: "informe", titulo: "Informe" },
];

export function FichaCaso({ informe }: { informe: Obj | null }) {
  if (!informe) return <p className="text-sm text-zinc-400">Sin informe.</p>;
  return (
    <div className="divide-y divide-[var(--atm-linea)] rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
      {SECCIONES.map(({ key, titulo }, i) => (
        <details key={key} open={i < 2} className="group">
          <summary className="flex cursor-pointer items-center justify-between px-5 py-3 text-sm font-medium text-zinc-800 marker:content-['']">
            {titulo}
            <span className="text-zinc-400 group-open:rotate-90">›</span>
          </summary>
          <div className="px-5 pb-4 text-sm">
            <Valor v={informe[key]} />
          </div>
        </details>
      ))}
    </div>
  );
}
