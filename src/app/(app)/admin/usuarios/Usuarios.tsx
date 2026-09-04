"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiFallo } from "@/lib/api";

// Administración de cuentas contra el backend real:
//   GET/POST /api/v1/admin/users · PATCH /api/v1/admin/users/:id · .../deactivate · .../reactivate · .../credential-setup
//   GET      /api/v1/admin/doctors · PATCH /api/v1/admin/doctors/:id
//
// El alta NO fija contraseña: el backend devuelve un token de instalación de un
// solo uso que el ADMIN entrega a la persona; ésta lo canjea en /auth/setup-password.

type RolBk = "ADMIN" | "DOCTOR" | "QUALITY";
type EstadoBk = "PENDING_SETUP" | "ACTIVE" | "INACTIVE";

interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  roles: RolBk[];
  status: EstadoBk;
  doctorProfileId: string | null;
  lastLoginAt: string | null;
}
interface AdminDoctor {
  id: string;
  userId: string;
  fullName: string;
  profession: string;
  nationalId: string | null;
  professionalCode: string | null;
  status: "ACTIVE" | "INACTIVE";
}
interface Fila extends AdminUser {
  doctor?: AdminDoctor;
}

const input =
  "rounded-lg border border-[var(--atm-linea)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--atm-azul2)]";
const ESTADO: Record<EstadoBk, { texto: string; clase: string }> = {
  ACTIVE: { texto: "activo", clase: "text-[var(--atm-ok)]" },
  PENDING_SETUP: { texto: "pendiente de clave", clase: "text-[var(--atm-obs)]" },
  INACTIVE: { texto: "inactivo", clase: "text-[var(--atm-mal)]" },
};

export function Usuarios() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [token, setToken] = useState<{ correo: string; token: string; expira: string } | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ displayName: string; profession: string; nationalId: string; professionalCode: string }>({
    displayName: "",
    profession: "",
    nationalId: "",
    professionalCode: "",
  });
  const [crear, setCrear] = useState(false);
  const [nuevo, setNuevo] = useState({
    email: "",
    displayName: "",
    rol: "DOCTOR" as RolBk,
    fullName: "",
    profession: "Médico cirujano",
    professionalCode: "",
    nationalId: "",
  });

  const cargar = useCallback(async () => {
    try {
      const [u, d] = await Promise.all([
        api<{ users: AdminUser[] }>("/admin/users?limit=200"),
        api<{ doctors: AdminDoctor[] }>("/admin/doctors?limit=200"),
      ]);
      const porUser = new Map(d.doctors.map((x) => [x.userId, x]));
      setFilas(u.users.map((x) => ({ ...x, doctor: porUser.get(x.id) })));
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "No se pudo cargar." });
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function crearUsuario() {
    setMsg(null);
    setToken(null);
    try {
      const body: Record<string, unknown> = {
        email: nuevo.email.trim(),
        displayName: nuevo.displayName.trim(),
        roles: [nuevo.rol],
      };
      if (nuevo.rol === "DOCTOR") {
        body.doctorProfile = {
          fullName: nuevo.fullName.trim() || nuevo.displayName.trim(),
          profession: nuevo.profession.trim(),
          professionalCode: nuevo.professionalCode.trim() || null,
          nationalId: nuevo.nationalId.trim() || null,
        };
      }
      const r = await api<{ credentialSetup: { token: string; expiresAt: string } }>("/admin/users", {
        json: body,
      });
      setToken({ correo: nuevo.email.trim(), token: r.credentialSetup.token, expira: r.credentialSetup.expiresAt });
      setMsg({ ok: true, texto: "Usuario creado. Entrégale el token de instalación." });
      setNuevo({ email: "", displayName: "", rol: "DOCTOR", fullName: "", profession: "Médico cirujano", professionalCode: "", nationalId: "" });
      setCrear(false);
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "Error al crear." });
    }
  }

  function abrirEdicion(f: Fila) {
    setEditando(f.id);
    setEdit({
      displayName: f.displayName,
      profession: f.doctor?.profession ?? "",
      nationalId: f.doctor?.nationalId ?? "",
      professionalCode: f.doctor?.professionalCode ?? "",
    });
  }

  async function guardarEdicion(f: Fila) {
    setMsg(null);
    try {
      if (edit.displayName.trim() && edit.displayName.trim() !== f.displayName) {
        await api(`/admin/users/${f.id}`, { method: "PATCH", json: { displayName: edit.displayName.trim() } });
      }
      if (f.doctor) {
        const cambios: Record<string, unknown> = {};
        if (edit.profession.trim() && edit.profession.trim() !== f.doctor.profession) cambios.profession = edit.profession.trim();
        if ((edit.nationalId.trim() || null) !== f.doctor.nationalId) cambios.nationalId = edit.nationalId.trim() || null;
        if ((edit.professionalCode.trim() || null) !== f.doctor.professionalCode) cambios.professionalCode = edit.professionalCode.trim() || null;
        if (Object.keys(cambios).length) await api(`/admin/doctors/${f.doctor.id}`, { method: "PATCH", json: cambios });
      }
      setMsg({ ok: true, texto: "Cambios guardados." });
      setEditando(null);
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "Error al guardar." });
    }
  }

  async function cambiarEstado(f: Fila) {
    setMsg(null);
    const accion = f.status === "INACTIVE" ? "reactivate" : "deactivate";
    try {
      await api(`/admin/users/${f.id}/${accion}`, { method: "POST" });
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "Error." });
    }
  }

  async function reemitirToken(f: Fila) {
    setMsg(null);
    try {
      const r = await api<{ credentialSetup: { token: string; expiresAt: string } }>(
        `/admin/users/${f.id}/credential-setup`,
        { method: "POST" },
      );
      setToken({ correo: f.email, token: r.credentialSetup.token, expira: r.credentialSetup.expiresAt });
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "Error." });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <button
          onClick={() => setCrear((v) => !v)}
          className="rounded-lg bg-[var(--atm-azul)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--atm-azul2)]"
        >
          {crear ? "Cancelar" : "Crear usuario"}
        </button>
      </div>

      {crear && (
        <div className="grid gap-2 rounded-xl border border-[var(--atm-linea)] bg-white p-4 shadow-sm sm:grid-cols-3">
          <input className={input} placeholder="Correo" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} />
          <input className={input} placeholder="Nombre visible" value={nuevo.displayName} onChange={(e) => setNuevo({ ...nuevo, displayName: e.target.value })} />
          <select className={input} value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value as RolBk })}>
            <option value="DOCTOR">Médico</option>
            <option value="QUALITY">Calidad</option>
            <option value="ADMIN">Administrador</option>
          </select>
          {nuevo.rol === "DOCTOR" && (
            <>
              <input className={input} placeholder="Nombre completo (informe)" value={nuevo.fullName} onChange={(e) => setNuevo({ ...nuevo, fullName: e.target.value })} />
              <input className={input} placeholder="Profesión" value={nuevo.profession} onChange={(e) => setNuevo({ ...nuevo, profession: e.target.value })} />
              <input className={input} placeholder="Código SIS / Cero Filas" value={nuevo.professionalCode} onChange={(e) => setNuevo({ ...nuevo, professionalCode: e.target.value })} />
              <input className={input} placeholder="RUT" value={nuevo.nationalId} onChange={(e) => setNuevo({ ...nuevo, nationalId: e.target.value })} />
            </>
          )}
          <div className="sm:col-span-3">
            <button onClick={crearUsuario} className="rounded-lg bg-[var(--atm-azul)] px-4 py-2 text-sm font-semibold text-white">
              Guardar usuario
            </button>
          </div>
        </div>
      )}

      {token && (
        <div className="rounded-xl border border-[var(--atm-obs)] bg-amber-50 p-4 text-sm">
          <p className="font-medium">Token de instalación para {token.correo}</p>
          <p className="mt-1 break-all font-mono text-xs">{token.token}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Vence {new Date(token.expira).toLocaleString("es-CL")}. La persona lo canjea en <code>/auth/setup-password</code> para fijar su contraseña.
          </p>
        </div>
      )}

      {msg && <p className={`text-sm ${msg.ok ? "text-[var(--atm-ok)]" : "text-[var(--atm-mal)]"}`}>{msg.texto}</p>}

      <div className="overflow-x-auto rounded-xl border border-[var(--atm-linea)] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--atm-th)] text-left text-white">
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Correo</th>
              <th className="px-4 py-2 font-medium">Roles</th>
              <th className="px-4 py-2 font-medium">Profesión</th>
              <th className="px-4 py-2 font-medium">RUT</th>
              <th className="px-4 py-2 font-medium">SIS</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-zinc-400">
                  Sin usuarios. Crea el primero.
                </td>
              </tr>
            )}
            {filas.map((f) => (
              <tr key={f.id} className="border-t border-[var(--atm-linea)] align-top">
                {editando === f.id ? (
                  <>
                    <td className="px-4 py-2"><input className={input} value={edit.displayName} onChange={(e) => setEdit({ ...edit, displayName: e.target.value })} /></td>
                    <td className="px-4 py-2 text-zinc-500">{f.email}</td>
                    <td className="px-4 py-2 text-zinc-500">{f.roles.join(", ")}</td>
                    <td className="px-4 py-2">{f.doctor ? <input className={input} value={edit.profession} onChange={(e) => setEdit({ ...edit, profession: e.target.value })} /> : "—"}</td>
                    <td className="px-4 py-2">{f.doctor ? <input className={`${input} w-28`} value={edit.nationalId} onChange={(e) => setEdit({ ...edit, nationalId: e.target.value })} /> : "—"}</td>
                    <td className="px-4 py-2">{f.doctor ? <input className={`${input} w-24`} value={edit.professionalCode} onChange={(e) => setEdit({ ...edit, professionalCode: e.target.value })} /> : "—"}</td>
                    <td className="px-4 py-2 text-zinc-500">{ESTADO[f.status].texto}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button onClick={() => guardarEdicion(f)} className="rounded-lg bg-[var(--atm-azul)] px-2.5 py-1 text-xs font-semibold text-white">Guardar</button>
                      <button onClick={() => setEditando(null)} className="ml-1 rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs text-zinc-600">Cancelar</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2">{f.displayName}</td>
                    <td className="px-4 py-2 text-zinc-600">{f.email}</td>
                    <td className="px-4 py-2 text-zinc-600">{f.roles.join(", ")}</td>
                    <td className="px-4 py-2 text-zinc-600">{f.doctor?.profession ?? "—"}</td>
                    <td className="px-4 py-2 text-zinc-600">{f.doctor?.nationalId ?? "—"}</td>
                    <td className="px-4 py-2 text-zinc-600">{f.doctor?.professionalCode ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className={ESTADO[f.status].clase}>{ESTADO[f.status].texto}</span>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button onClick={() => abrirEdicion(f)} className="rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs font-medium text-[var(--atm-azul)] hover:bg-blue-50">Editar</button>
                      {f.status === "PENDING_SETUP" && (
                        <button onClick={() => reemitirToken(f)} className="ml-1 rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs text-zinc-600">Reemitir token</button>
                      )}
                      <button onClick={() => cambiarEstado(f)} className="ml-1 rounded-lg border border-[var(--atm-linea)] px-2.5 py-1 text-xs text-zinc-600">
                        {f.status === "INACTIVE" ? "Reactivar" : "Desactivar"}
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
