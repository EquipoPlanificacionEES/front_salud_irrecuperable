import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destino = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;

  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--atm-fondo)] px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-zinc-900">Plataforma de Calificación</h1>
          <p className="mt-1 text-sm text-zinc-500">Ingresa con tu correo y contraseña</p>
        </div>
        <LoginForm next={destino} />
      </div>
    </div>
  );
}
