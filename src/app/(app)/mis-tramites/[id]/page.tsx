import Link from "next/link";
import { requerirSesion } from "@/lib/guard";
import { PantallaResultado } from "./PantallaResultado";

export default async function CasoPage({ params }: { params: Promise<{ id: string }> }) {
  await requerirSesion("/mis-tramites");
  const { id } = await params;
  return (
    <section>
      <div className="mb-5 flex items-baseline gap-3">
        <Link href="/mis-tramites" className="text-sm text-[var(--atm-azul2)]">
          ← Mis trámites
        </Link>
        <span className="rounded-full border border-[var(--atm-linea)] bg-white px-2 py-0.5 font-mono text-xs text-zinc-500">
          TSI-402
        </span>
      </div>
      <PantallaResultado id={Number(id)} />
    </section>
  );
}
