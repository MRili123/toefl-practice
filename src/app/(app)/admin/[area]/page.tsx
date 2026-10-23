import { notFound } from "next/navigation";
import { ADMIN_AREAS, type AdminArea } from "@/components/admin/areas";
import { ContentManager } from "@/components/admin/ContentManager";

export default async function AdminAreaPage({ params }: PageProps<"/admin/[area]">) {
  const { area } = await params;
  if (!ADMIN_AREAS.includes(area as AdminArea)) notFound();
  return <ContentManager key={area} area={area as AdminArea} />;
}
