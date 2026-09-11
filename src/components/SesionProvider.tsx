"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { Ambito } from "@/lib/session";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { Rol } from "@/lib/roles";
import { api } from "@/lib/api";

// Expone el usuario actual al árbol de la app y el cierre de sesión.
// El estado viene del servidor (cookie `sir_session` verificada contra el backend);
// aquí no se guarda ninguna credencial.

export interface SesionCliente {
  uid: string;
  rol: Rol;
  roles: Rol[];
  nombre: string;
  correo: string;
  contrato: string;
  contratoId: string;
  doctorProfileId: string | null;
  /** Dónde puede trabajar. Lo resuelve el backend; aquí sólo se pinta. */
  ambitos: Ambito[];
}

interface Ctx {
  sesion: SesionCliente;
  cerrarSesion: () => Promise<void>;
  /** Para que el botón reaccione al instante en vez de quedarse mudo. */
  cerrandoSesion: boolean;
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
  const queryClient = useQueryClient();
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  /**
   * CERRAR SESIÓN VACÍA LA CACHÉ, Y ANTES DE NAVEGAR.
   *
   * En esta caché vive el expediente clínico de personas identificadas: la
   * bandeja del médico, los informes que abrió, los retenidos que revisó. Si
   * sobreviviera al cierre de sesión, el siguiente en entrar en ese mismo
   * navegador —un turno compartido, un equipo de la subcomisión— vería datos
   * que no le corresponden mientras se cargan los suyos.
   *
   * El orden importa:
   *   1. `cancelQueries` corta lo que esté en vuelo, para que una respuesta
   *      tardía no vuelva a sembrar la caché DESPUÉS de vaciarla;
   *   2. `clear` la vacía entera;
   *   3. y sólo entonces se navega.
   */
  const cerrarSesion = useCallback(async () => {
    setCerrandoSesion(true);
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* la cookie puede haber expirado; igual mandamos al login */
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    router.replace("/login");
    // El árbol servidor conserva la sesión anterior en su caché de router: sin
    // esto, volver atrás podría repintar la cabecera con el nombre de quien
    // acaba de salir.
    router.refresh();
  }, [queryClient, router]);

  return (
    <SesionCtx.Provider value={{ sesion, cerrarSesion, cerrandoSesion }}>
      {children}
    </SesionCtx.Provider>
  );
}

export function useSesion(): Ctx {
  const ctx = useContext(SesionCtx);
  if (!ctx) throw new Error("useSesion debe usarse dentro de <SesionProvider>");
  return ctx;
}
