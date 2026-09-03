// Tarjeta de sección en construcción (MVP). Uniforma el look mientras se portan las pantallas.
export function Placeholder({
  titulo,
  ticket,
  children,
}: {
  titulo: string;
  ticket?: string;
  children?: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-5 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">{titulo}</h2>
        {ticket && (
          <span className="rounded-full border border-[var(--atm-linea)] bg-white px-2 py-0.5 font-mono text-xs text-zinc-500">
            {ticket}
          </span>
        )}
      </div>
      <div className="rounded-xl border border-[var(--atm-linea)] bg-white p-6 text-sm text-zinc-600 shadow-sm">
        {children ?? "Pantalla pendiente de implementación (MVP)."}
      </div>
    </section>
  );
}
