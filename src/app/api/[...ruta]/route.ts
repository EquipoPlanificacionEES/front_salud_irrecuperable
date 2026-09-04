import { type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/* → proxy al backend real (BACKEND_URL). Reenvía método, query, body y cookie;
// propaga Set-Cookie. La cookie de sesión (httpOnly) la emite/borra el backend.

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
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
