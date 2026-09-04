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
      </div>
      <PantallaResultado caseId={id} />
    </section>
  );
}
