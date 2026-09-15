import { requerirSesion } from "@/lib/guard";
import { AdminTabs } from "../AdminTabs";
import { Dashboard, type AmbitoDashboard } from "./Dashboard";

export default async function DashboardPage() {
  const sesion = await requerirSesion("/admin/dashboard");
  // Región y contrato salen del ÁMBITO ACTIVO de la sesión, nunca de la URL.
  const delContrato = sesion.ambitos.filter((a) => a.contractId === sesion.activoContractId);
  const activo = delContrato.find((a) => a.regionId === sesion.activoRegionId) ?? delContrato[0];
  const ambito: AmbitoDashboard = {
    contrato: activo?.contractName ?? sesion.contrato,
    region: sesion.activoRegionId ? (activo?.regionName ?? activo?.regionCode ?? "Región del ámbito activo") : null,
    regiones: sesion.activoRegionId
      ? []
      : delContrato
          .filter((a) => a.regionId)
          .map((a) => ({ id: a.regionId as string, nombre: a.regionName ?? a.regionCode ?? "Región" })),
  };
  return (
    <section>
      <Dashboard ambito={ambito} navegacion={<AdminTabs />} />
    </section>
  );
}
