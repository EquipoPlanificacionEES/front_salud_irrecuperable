// Roles y permisos de navegación.
// Regla de seguridad: cada rol solo entra a lo que le toca; no navega a la interfaz de otro rol.

export const ROLES = ["medico", "calidad", "admin"] as const;
export type Rol = (typeof ROLES)[number];

export function esRol(v: unknown): v is Rol {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

/** Adónde llega cada rol después del login (sin dashboard: cada uno a su área). */
export const HOME_POR_ROL: Record<Rol, string> = {
  medico: "/kpi",
  calidad: "/quality",
  admin: "/admin",
};

// Secciones protegidas: prefijo de ruta -> roles permitidos.
// El orden importa: se evalúa el prefijo más específico primero.
export const PERMISOS: { prefijo: string; roles: readonly Rol[] }[] = [
  { prefijo: "/admin", roles: ["admin"] },
  { prefijo: "/quality", roles: ["calidad", "admin"] },
  { prefijo: "/mis-tramites", roles: ["medico"] }, // TSI-301: bandeja solo para el rol médico
  { prefijo: "/kpi", roles: ["medico", "calidad", "admin"] },
  { prefijo: "/mi-firma", roles: ["medico"] }, // solo el médico firma
];

/** ¿El rol puede entrar a esta ruta? (rutas no listadas: libres para logueados) */
export function puedeAcceder(rol: Rol, pathname: string): boolean {
  const regla = PERMISOS.find(
    (r) => pathname === r.prefijo || pathname.startsWith(r.prefijo + "/"),
  );
  return regla ? regla.roles.includes(rol) : true;
}

// Ítems del menú (TSI-202). `roles` controla la visibilidad.
export const NAV: { href: string; etiqueta: string; roles: readonly Rol[] }[] = [
  { href: "/kpi", etiqueta: "KPI", roles: ["medico", "calidad", "admin"] },
  { href: "/mis-tramites", etiqueta: "Mis casos", roles: ["medico"] },
  { href: "/mi-firma", etiqueta: "Mi firma", roles: ["medico"] },
  { href: "/admin", etiqueta: "Administración", roles: ["admin"] },
  { href: "/quality", etiqueta: "Control de calidad", roles: ["calidad", "admin"] },
];
