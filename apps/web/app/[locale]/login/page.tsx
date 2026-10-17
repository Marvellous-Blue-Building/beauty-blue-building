import { redirect } from "next/navigation";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";

export default async function AdminLoginPage() {
  if (await isAdminRequest()) redirect("/admin");
  return (
    <div
      className="fixed inset-0 z-[999999] overflow-hidden bg-neutral-50 text-neutral-900"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
    >
      <AdminLoginForm />
    </div>
  );
}
