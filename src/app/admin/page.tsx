import type { Metadata } from "next";
import AdminApp from "@/components/AdminApp";

export const metadata: Metadata = { title: "Admin — Halloween Drawing Contest" };

export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <AdminApp />
    </main>
  );
}
