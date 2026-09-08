import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION } from "@/lib/session";

/**
 * PRIMER FILTRO, NO LA GUARDIA.
 *
 * El middleware ya NO llama al backend. Antes verificaba la sesión contra
 * `/api/v1/auth/me` en cada navegación Y en cada prefetch de `<Link>`: con ocho
 * pestañas de administración eso eran 8 viajes de ~197 ms a Render por pantalla,
 * sumados a los que hacían el layout y la página. Medido: 23 verificaciones para
 * cargar una sola vez la pantalla de retenidos.
 *
 * QUÉ HACE AHORA: mira si existe la cookie de sesión y redirige en consecuencia.
 * Es un atajo de experiencia —evita pintar una pantalla que va a rebotar—, no un
 * control de acceso.
 *
 * POR QUÉ ESTO NO DEBILITA NADA. La autorización real vive en dos capas que no
 * se pueden esquivar y que no cambian:
 *
 *   1. `requerirSesion(ruta)` en el layout protegido y en CADA `page.tsx`, en el
 *      servidor. Valida la cookie contra el backend y aplica `puedeAcceder`. Una
 *      cookie inventada, caducada o de un rol que no corresponde nunca llega a
 *      renderizar: `redirect()` ocurre antes.
 *   2. El backend, que responde 401/403 por su cuenta a cada petición de datos.
 *      El proxy `/api/*` sólo reenvía.
 *
 * Lo que un atacante gana falsificando la presencia de la cookie es pasar este
 * filtro y chocar con la guardia del servidor una capa más abajo. Lo que la
 * plataforma gana es una verificación por petición en vez de tres.
 */

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // El proxy y el backend se encargan de /api/*.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const tieneCookie = Boolean(req.cookies.get(COOKIE_SESION)?.value);

  // Sin cookie no hay nada que renderizar de la app: al login, recordando adónde iba.
  if (!tieneCookie && pathname !== "/login") {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Con cookie, `/login` y `/` los resuelve el servidor, que sí sabe el rol:
  // `login/page.tsx` y `app/page.tsx` verifican la sesión y mandan a cada uno a
  // su área. Aquí no se puede: averiguar el rol costaría la llamada que se quitó.
  return NextResponse.next();
}

export const config = {
  // Todo menos assets de Next y archivos estáticos del /public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|svg|gif|webp|ico|css|js|woff2?)).*)"],
};
