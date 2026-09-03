"use client";

import { createContext, useContext, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Rol } from "@/lib/roles";

// "session" (TSI-203): expone el usuario actual al árbol de la app y el cierre de sesión.
// El estado viene del servidor (cookie httpOnly); aquí no se guarda ninguna credencial.

export interface SesionCliente {
  uid: number;
  rol: Rol;
  nombre: string;
  region: string | null;
}

interface Ctx {
  sesion: SesionCliente;
  cerrarSesion: () => Promise<void>;
}

const SesionCtx = createContext<Ctx | null>(null);

export function SesionProvider({
  sesion,
  children,
}: {
  sesion: SesionCliente;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const cerrarSesion = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }, [router]);

  return <SesionCtx.Provider value={{ sesion, cerrarSesion }}>{children}</SesionCtx.Provider>;
}

export function useSesion(): Ctx {
  const ctx = useContext(SesionCtx);
  if (!ctx) throw new Error("useSesion debe usarse dentro de <SesionProvider>");
  return ctx;
}
