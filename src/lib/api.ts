"use client";

// Cliente HTTP del front hacia el backend (vía el proxy `/api/*`).
//
// - La cookie de sesión `sir_session` (HttpOnly) viaja sola: mismo origen.
// - Las mutaciones (POST/PUT/PATCH/DELETE) exigen el header `x-csrf-token` con
//   el valor de la cookie legible `sir_csrf` (doble envío). Ver ADR-0023 del backend.

function csrf(): string {
  const m = document.cookie.match(/(?:^|;\s*)sir_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export interface ApiError {
  code?: string;
  message: string;
  details?: unknown;
}

export class ApiFallo extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(status: number, err: ApiError) {
    super(err.message);
    this.status = status;
    this.code = err.code;
    this.details = err.details;
  }
}

async function parse(res: Response): Promise<unknown> {
  const txt = await res.text();
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

export async function api<T = unknown>(
  ruta: string,
  opciones: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, method, ...resto } = opciones;
  const m = (method ?? (json !== undefined ? "POST" : "GET")).toUpperCase();
  const h = new Headers(headers);
  if (json !== undefined) h.set("Content-Type", "application/json");
  if (m !== "GET" && m !== "HEAD") h.set("x-csrf-token", csrf());

  const res = await fetch(`/api/v1${ruta}`, {
    ...resto,
    method: m,
    headers: h,
    body: json !== undefined ? JSON.stringify(json) : resto.body,
  });

  const cuerpo = await parse(res);
  if (!res.ok) {
    const e = (cuerpo as { error?: ApiError })?.error;
    throw new ApiFallo(res.status, e ?? { message: `Error ${res.status}` });
  }
  return cuerpo as T;
}
