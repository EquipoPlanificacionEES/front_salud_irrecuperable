import { NextResponse, type NextRequest } from "next/server";
import { autenticar } from "@/lib/usuarios";
import { guardarSesion } from "@/lib/session";
import { HOME_POR_ROL } from "@/lib/roles";

export const runtime = "nodejs";

// CONTROLADOR del login: recibe credenciales, consulta el MODELO, crea la sesión.
export async function POST(req: NextRequest) {
  let body: { correo?: unknown; password?: unknown; next?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }

  const correo = typeof body.correo === "string" ? body.correo : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!correo || !password) {
    return NextResponse.json({ ok: false, error: "Completa correo y contraseña." }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  const r = await autenticar(correo, password, ip);
  if (!r.ok) {
    const msg =
      r.error === "bloqueado"
        ? "Demasiados intentos. Espera unos minutos."
        : r.error === "inactivo"
          ? "Usuario inactivo."
          : "Correo o contraseña incorrectos.";
    return NextResponse.json({ ok: false, error: msg }, { status: 401 });
  }

  await guardarSesion({
    uid: r.usuario.id,
    rol: r.usuario.rol,
    nombre: r.usuario.nombre,
    region: r.usuario.region,
  });

  const next =
    typeof body.next === "string" && body.next.startsWith("/") && !body.next.startsWith("//")
      ? body.next
      : null;
  return NextResponse.json({ ok: true, home: next ?? HOME_POR_ROL[r.usuario.rol] });
}
