import { redirect } from "next/navigation";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";

export default async function AdminLoginPage() {
  if (await isAdminRequest()) redirect("/admin");
  return (
    <div className="admin-theme fixed inset-0 z-[999999] overflow-hidden bg-neutral-50 font-admin text-admin-ink">
      <AdminLoginForm />
    </div>
  );
}
