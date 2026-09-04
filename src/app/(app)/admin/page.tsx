import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/guard";

export default async function AdminPage() {
  await requerirSesion("/admin");
  redirect("/admin/semanas");
}
