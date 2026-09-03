import "server-only";
import { getDb } from "../../BD/db";

// TSI-303 — La firma del médico: una imagen PNG/JPG que se guarda en su usuario
// y se adjunta a la ratificación/modificación de cada caso (se manda al backend).

export const MAX_FIRMA_BYTES = 500_000; // ~370 KB de imagen

export function firmaValida(dataUrl: string): boolean {
  return (
    (dataUrl.startsWith("data:image/png") || dataUrl.startsWith("data:image/jpeg")) &&
    dataUrl.length <= MAX_FIRMA_BYTES
  );
}

export function obtenerFirma(usuarioId: number): string | null {
  const row = getDb().prepare("SELECT firma FROM usuarios WHERE id = ?").get(usuarioId) as
    | { firma: string | null }
    | undefined;
  return row?.firma ?? null;
}

export function guardarFirma(usuarioId: number, dataUrl: string): { ok: boolean; error?: string } {
  if (!firmaValida(dataUrl)) {
    return { ok: false, error: "La firma debe ser PNG o JPG y pesar menos de ~370 KB." };
  }
  getDb().prepare("UPDATE usuarios SET firma = ? WHERE id = ?").run(dataUrl, usuarioId);
  return { ok: true };
}
