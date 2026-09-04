"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiFallo } from "@/lib/api";
import { Aviso, Btn, Campo, Chip, FilaVacia, Input, Select, Tabla } from "../ui";

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

const ROL_ES: Record<RolBk, string> = { ADMIN: "Administrador", DOCTOR: "Médico", QUALITY: "Calidad" };
const ESTADO: Record<EstadoBk, { texto: string; tono: "ok" | "obs" | "mal" }> = {
  ACTIVE: { texto: "Activo", tono: "ok" },
  PENDING_SETUP: { texto: "Pendiente de clave", tono: "obs" },
  INACTIVE: { texto: "Inactivo", tono: "mal" },
};

export function Usuarios() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [token, setToken] = useState<{ correo: string; token: string; expira: string } | null>(null);
  const [claveCreada, setClaveCreada] = useState<{ correo: string; password: string } | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [edit, setEdit] = useState({ displayName: "", profession: "", nationalId: "", professionalCode: "" });
  const [crear, setCrear] = useState(false);
  const [modoClave, setModoClave] = useState<"token" | "password">("password");
  const [nuevo, setNuevo] = useState({
    email: "",
    displayName: "",
    rol: "DOCTOR" as RolBk,
    fullName: "",
    profession: "Médico cirujano",
    professionalCode: "",
    nationalId: "",
    password: "",
  });

  function generarClave() {
    const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const arr = new Uint32Array(14);
    crypto.getRandomValues(arr);
    const clave = Array.from(arr, (n) => alfabeto[n % alfabeto.length]).join("");
    setNuevo((n) => ({ ...n, password: clave }));
  }

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
    setClaveCreada(null);
    if (modoClave === "password" && nuevo.password.trim().length < 12) {
      setMsg({ ok: false, texto: "La contraseña debe tener al menos 12 caracteres." });
      return;
    }
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
      if (modoClave === "password") body.password = nuevo.password;

      const r = await api<{ credentialSetup?: { token: string; expiresAt: string } }>("/admin/users", { json: body });
      if (r.credentialSetup) {
        setToken({ correo: nuevo.email.trim(), token: r.credentialSetup.token, expira: r.credentialSetup.expiresAt });
        setMsg({ ok: true, texto: "Usuario creado. Entrégale el token de instalación." });
      } else {
        setClaveCreada({ correo: nuevo.email.trim(), password: nuevo.password });
        setMsg({ ok: true, texto: "Usuario creado y activo con la contraseña que definiste." });
      }
      setNuevo({ email: "", displayName: "", rol: "DOCTOR", fullName: "", profession: "Médico cirujano", professionalCode: "", nationalId: "", password: "" });
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
      const r = await api<{ credentialSetup: { token: string; expiresAt: string } }>(`/admin/users/${f.id}/credential-setup`, {
        method: "POST",
      });
      setToken({ correo: f.email, token: r.credentialSetup.token, expira: r.credentialSetup.expiresAt });
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof ApiFallo ? e.message : "Error." });
    }
  }

  return (
    <div className="space-y-5">
      <Btn variante={crear ? "neutral" : "primary"} onClick={() => setCrear((v) => !v)}>
        {crear ? "Cancelar" : "Crear usuario"}
      </Btn>

      {crear && (
        <div className="grid gap-3 rounded-xl border border-[var(--atm-linea)] bg-white p-4 shadow-sm sm:grid-cols-3">
          <Campo label="Correo">
            <Input placeholder="persona@salud.cl" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} />
          </Campo>
          <Campo label="Nombre visible">
            <Input value={nuevo.displayName} onChange={(e) => setNuevo({ ...nuevo, displayName: e.target.value })} />
          </Campo>
          <Campo label="Rol">
            <Select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value as RolBk })}>
              <option value="DOCTOR">Médico</option>
              <option value="QUALITY">Calidad</option>
              <option value="ADMIN">Administrador</option>
            </Select>
          </Campo>
          {nuevo.rol === "DOCTOR" && (
            <>
              <Campo label="Nombre completo (informe)">
                <Input value={nuevo.fullName} onChange={(e) => setNuevo({ ...nuevo, fullName: e.target.value })} />
              </Campo>
              <Campo label="Profesión">
                <Input value={nuevo.profession} onChange={(e) => setNuevo({ ...nuevo, profession: e.target.value })} />
              </Campo>
              <Campo label="Código SIS / Cero Filas">
                <Input value={nuevo.professionalCode} onChange={(e) => setNuevo({ ...nuevo, professionalCode: e.target.value })} />
              </Campo>
              <Campo label="RUT">
                <Input value={nuevo.nationalId} onChange={(e) => setNuevo({ ...nuevo, nationalId: e.target.value })} />
              </Campo>
            </>
          )}

          <div className="sm:col-span-3 rounded-lg border border-[var(--atm-linea)] bg-[var(--atm-fondo)] p-3">
            <p className="mb-2 text-sm font-medium text-zinc-600">Contraseña</p>
            <div className="mb-2 flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={modoClave === "password"} onChange={() => setModoClave("password")} />
                La defino yo ahora
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={modoClave === "token"} onChange={() => setModoClave("token")} />
                Token de instalación (la persona la fija después)
              </label>
            </div>
            {modoClave === "password" && (
              <div className="flex flex-wrap items-end gap-2">
                <Campo label="Contraseña" hint="Mínimo 12 caracteres.">
                  <Input
                    className="w-64 font-mono"
                    value={nuevo.password}
                    onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })}
                  />
                </Campo>
                <Btn type="button" variante="neutral" onClick={generarClave}>
                  Generar
                </Btn>
              </div>
            )}
          </div>

          <div className="sm:col-span-3">
            <Btn
              onClick={crearUsuario}
              disabled={
                !nuevo.email.trim() ||
                !nuevo.displayName.trim() ||
                (modoClave === "password" && nuevo.password.trim().length < 12)
              }
            >
              Guardar usuario
            </Btn>
          </div>
        </div>
      )}

      {claveCreada && (
        <div className="rounded-xl border border-[var(--atm-obs)] bg-amber-50 p-4 text-sm">
          <p className="font-medium">Contraseña para {claveCreada.correo}</p>
          <p className="mt-1 break-all font-mono text-xs">{claveCreada.password}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Cuenta activa de inmediato. Esta clave no vuelve a mostrarse — entrégasela a la persona por un canal
            seguro (no por correo en texto plano).
          </p>
        </div>
      )}

      {token && (
        <div className="rounded-xl border border-[var(--atm-obs)] bg-amber-50 p-4 text-sm">
          <p className="font-medium">Token de instalación para {token.correo}</p>
          <p className="mt-1 break-all font-mono text-xs">{token.token}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Vence {new Date(token.expira).toLocaleString("es-CL")}. La persona lo canjea en <code>/auth/setup-password</code> para fijar su
            contraseña.
          </p>
        </div>
      )}

      {msg && <Aviso ok={msg.ok}>{msg.texto}</Aviso>}

      <Tabla columnas={["Nombre", "Correo", "Roles", "Profesión", "RUT", "SIS", "Estado", ""]}>
        {filas.length === 0 && <FilaVacia cols={8}>Sin usuarios. Crea el primero.</FilaVacia>}
        {filas.map((f) => (
          <tr key={f.id} className="border-t border-[var(--atm-linea)] align-top">
            {editando === f.id ? (
              <>
                <td className="px-4 py-2.5">
                  <Input value={edit.displayName} onChange={(e) => setEdit({ ...edit, displayName: e.target.value })} />
                </td>
                <td className="px-4 py-2.5 text-zinc-500">{f.email}</td>
                <td className="px-4 py-2.5 text-zinc-500">{f.roles.map((r) => ROL_ES[r]).join(", ")}</td>
                <td className="px-4 py-2.5">
                  {f.doctor ? (
                    <Input value={edit.profession} onChange={(e) => setEdit({ ...edit, profession: e.target.value })} />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {f.doctor ? (
                    <Input className="w-28" value={edit.nationalId} onChange={(e) => setEdit({ ...edit, nationalId: e.target.value })} />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {f.doctor ? (
                    <Input
                      className="w-24"
                      value={edit.professionalCode}
                      onChange={(e) => setEdit({ ...edit, professionalCode: e.target.value })}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <Chip tono={ESTADO[f.status].tono}>{ESTADO[f.status].texto}</Chip>
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <Btn className="px-2.5 py-1 text-xs" onClick={() => guardarEdicion(f)}>
                    Guardar
                  </Btn>
                  <Btn variante="neutral" className="ml-1 px-2.5 py-1 text-xs" onClick={() => setEditando(null)}>
                    Cancelar
                  </Btn>
                </td>
              </>
            ) : (
              <>
                <td className="px-4 py-2.5 text-zinc-800">{f.displayName}</td>
                <td className="px-4 py-2.5 text-zinc-600">{f.email}</td>
                <td className="px-4 py-2.5 text-zinc-600">{f.roles.map((r) => ROL_ES[r]).join(", ")}</td>
                <td className="px-4 py-2.5 text-zinc-600">{f.doctor?.profession ?? "—"}</td>
                <td className="px-4 py-2.5 text-zinc-600">{f.doctor?.nationalId ?? "—"}</td>
                <td className="px-4 py-2.5 text-zinc-600">{f.doctor?.professionalCode ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <Chip tono={ESTADO[f.status].tono}>{ESTADO[f.status].texto}</Chip>
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <Btn variante="ghost" className="px-2.5 py-1 text-xs" onClick={() => abrirEdicion(f)}>
                    Editar
                  </Btn>
                  {f.status === "PENDING_SETUP" && (
                    <Btn variante="neutral" className="ml-1 px-2.5 py-1 text-xs" onClick={() => reemitirToken(f)}>
                      Reemitir token
                    </Btn>
                  )}
                  <Btn variante="neutral" className="ml-1 px-2.5 py-1 text-xs" onClick={() => cambiarEstado(f)}>
                    {f.status === "INACTIVE" ? "Reactivar" : "Desactivar"}
                  </Btn>
                </td>
              </>
            )}
          </tr>
        ))}
      </Tabla>
    </div>
  );
}
