"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

// TSI-203 — Login UI. email + password contra POST /api/v1/auth/login del backend.
// El backend valida y setea las cookies `sir_session` (HttpOnly) + `sir_csrf`.
export default function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? "No se pudo iniciar sesión.");
        return;
      }
      // A "/" y el layout raíz manda a cada rol a su área (HOME_POR_ROL).
      const destino = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      router.replace(destino);
      router.refresh();
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-xl border border-[var(--atm-linea)] bg-white p-6 shadow-sm"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-zinc-700">
          Correo
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-[var(--atm-linea)] px-3 py-2 text-sm outline-none focus:border-[var(--atm-azul2)]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-zinc-700">
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-[var(--atm-linea)] px-3 py-2 text-sm outline-none focus:border-[var(--atm-azul2)]"
        />
      </div>

      {error && <p className="text-sm text-[var(--atm-mal)]">{error}</p>}

      <button
        type="submit"
        disabled={cargando}
        className="mt-1 rounded-lg bg-[var(--atm-azul)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--atm-azul2)] disabled:opacity-50"
      >
        {cargando ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
