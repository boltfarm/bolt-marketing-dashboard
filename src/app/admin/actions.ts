"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { login, logout } from "@/lib/auth";
import { store } from "@/lib/store";

function optNum(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function loginAction(formData: FormData) {
  const ok = await login(String(formData.get("password") ?? ""));
  redirect(ok ? "/admin" : "/admin?err=bad-password");
}

export async function logoutAction() {
  await logout();
  redirect("/admin");
}

export async function saveManualAction(formData: FormData) {
  const weekOf = String(formData.get("weekOf") ?? "");
  if (!weekOf) redirect("/admin?err=no-week");

  await store.saveManualInput({
    weekOf,
    bookings: optNum(formData.get("bookings")),
    totalBookingValue: optNum(formData.get("totalBookingValue")),
    notes: String(formData.get("notes") ?? "").trim() || undefined,
  });

  // Refresh the public report so the new numbers show immediately.
  revalidatePath("/");
  redirect(`/admin?week=${weekOf}&saved=1`);
}
