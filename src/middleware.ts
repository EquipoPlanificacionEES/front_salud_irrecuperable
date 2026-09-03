import { NextResponse, type NextRequest } from "next/server";
import { verificarToken, COOKIE_SESION } from "@/lib/session";
import { HOME_POR_ROL, puedeAcceder } from "@/lib/roles";

// Guarda de rutas (Edge). Exige sesión y aplica los permisos por rol de `roles.ts`.
// Si un rol intenta abrir una sección que no le toca -> lo devuelve a su dashboard.

const PUBLICAS = ["/login", "/api/auth/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const sesion = await verificarToken(req.cookies.get(COOKIE_SESION)?.value);

  if (PUBLICAS.includes(pathname)) {
    if (pathname === "/login" && sesion) {
      return NextResponse.redirect(new URL(HOME_POR_ROL[sesion.rol], req.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return sesion ? NextResponse.next() : NextResponse.json({ ok: false }, { status: 401 });
  }

  if (!sesion) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(HOME_POR_ROL[sesion.rol], req.url));
  }

  if (!puedeAcceder(sesion.rol, pathname)) {
    return NextResponse.redirect(new URL(HOME_POR_ROL[sesion.rol], req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
