import { NextResponse, type NextRequest } from "next/server";
import { verificarSesion, COOKIE_SESION } from "@/lib/session";
import { HOME_POR_ROL, puedeAcceder } from "@/lib/roles";

// Guarda de rutas de PÁGINA. Exige sesión (verificada contra el backend) y
// aplica los permisos por rol de `roles.ts`. Las rutas `/api/*` no se tocan
// aquí: el backend real ya responde 401/403 y el proxy lo reenvía.

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // El proxy y el backend se encargan de /api/*.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const sesion = await verificarSesion(req.cookies.get(COOKIE_SESION)?.value);

  if (pathname === "/login") {
    if (sesion) return NextResponse.redirect(new URL(HOME_POR_ROL[sesion.rol], req.url));
    return NextResponse.next();
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
  // Todo menos assets de Next y archivos estáticos del /public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|svg|gif|webp|ico|css|js|woff2?)).*)"],
};
