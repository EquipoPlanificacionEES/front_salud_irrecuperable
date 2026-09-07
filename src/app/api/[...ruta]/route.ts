import { type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/* → proxy al backend real (BACKEND_URL). Reenvía método, query, body y cookie;
// propaga Set-Cookie. La cookie de sesión (httpOnly) la emite/borra el backend.

// Headers que NUNCA se reenvían en la respuesta al navegador: `content-encoding`
// va aquí porque el `fetch` de Node/Vercel DESCOMPRIME gzip/br automáticamente
// antes de que este código vea el body — si se reenvía el header original, el
// navegador recibe texto plano pero cree que viene comprimido y revienta con
// ERR_CONTENT_DECODING_FAILED. Solo aparece en respuestas grandes porque el
// backend no comprime las chicas (quedan bajo su umbral de compresión).
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "content-encoding",
]);

async function proxy(req: NextRequest): Promise<Response> {
  const base = process.env.BACKEND_URL?.trim();
  if (!base) {
    return Response.json(
      { ok: false, error: "BACKEND_URL no configurado." },
      { status: 502 },
    );
  }

  const target = base.replace(/\/$/, "") + req.nextUrl.pathname + req.nextUrl.search;

  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers.set(k, v);
  });
  // Le pedimos al backend que NO comprima: así el body que Node nos entrega
  // coincide siempre con lo que declaramos, sin depender de si undici alcanzó
  // a descomprimir antes de que armemos la respuesta.
  headers.set("accept-encoding", "identity");

  const init: RequestInit = { method: req.method, headers, redirect: "manual" };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.arrayBuffer();

  let backendRes: Response;
  try {
    backendRes = await fetch(target, init);
  } catch {
    return Response.json({ ok: false, error: "No se pudo contactar el backend." }, { status: 502 });
  }

  const out = new Headers();
  backendRes.headers.forEach((v, k) => {
    const key = k.toLowerCase();
    if (!HOP_BY_HOP.has(key) && key !== "set-cookie") out.set(k, v);
  });
  for (const c of backendRes.headers.getSetCookie?.() ?? []) out.append("set-cookie", c);

  return new Response(backendRes.body, { status: backendRes.status, headers: out });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
