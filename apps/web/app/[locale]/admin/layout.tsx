import { redirect } from "next/navigation";
import { isAdminRequest } from "@/lib/auth/admin-session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdminRequest())) redirect("/login");
  return children;
}
