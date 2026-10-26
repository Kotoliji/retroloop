import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const metadata: Metadata = {
  title: "Stats — Retroloop",
  robots: { index: false, follow: false },
};

/** Operator-only. English on purpose: it is not part of the product people use. */
export default function AdminPage() {
  return <AdminDashboard />;
}
