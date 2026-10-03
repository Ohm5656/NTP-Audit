import Workspace from "@/components/workspace";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  if (slug?.[0] === "login") return <Workspace />;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <Workspace user={user} />;
}
