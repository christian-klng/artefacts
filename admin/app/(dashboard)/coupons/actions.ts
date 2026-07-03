"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { COOKIE_NAME, verifySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { coupons, users } from "@/lib/schema";

export type CreateState = { ok?: boolean; error?: string; code?: string };

// Unambiguous alphabet (no I/O/0/1), mirrors web/lib/coupons.ts.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  const bytes = randomBytes(6);
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `KUBI-${s}`;
}

/** null = invalid, "" = empty (auto-generate), else the normalized code. */
function normalizeCode(raw: string): string | null {
  const c = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!c) return "";
  if (c.length < 3 || c.length > 40 || !/^[A-Z0-9-]+$/.test(c)) return null;
  return c;
}

function parseEur(raw: string): number | null {
  const n = Number(raw.replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * Creates a fully-configurable "admin" coupon (for test users). The proxy gates
 * /coupons, but this writes, so we re-verify the admin session. An owner + a
 * referrer amount are optional; a blank code is auto-generated.
 */
export async function createCoupon(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const session = await verifySession(
    (await cookies()).get(COOKIE_NAME)?.value,
  );
  if (!session) return { error: "Nicht angemeldet." };

  const codeInput = normalizeCode(String(formData.get("code") ?? ""));
  if (codeInput === null) {
    return { error: "Ungültiger Code (nur A–Z, 0–9, Bindestrich)." };
  }

  const recipient = parseEur(String(formData.get("recipient") ?? ""));
  if (recipient === null || recipient <= 0) {
    return { error: "Einlöser-Betrag muss größer als 0 sein." };
  }

  const referrer = parseEur(String(formData.get("referrer") ?? "0")) ?? 0;

  const ownerEmail = String(formData.get("ownerEmail") ?? "")
    .trim()
    .toLowerCase();
  let ownerId: string | null = null;
  if (ownerEmail) {
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, ownerEmail))
      .limit(1);
    if (!u) return { error: `Kein Nutzer mit E-Mail ${ownerEmail}.` };
    ownerId = u.id;
  }

  const maxRaw = String(formData.get("maxRedemptions") ?? "").trim();
  let maxRedemptions: number | null = null;
  if (maxRaw) {
    const m = Number(maxRaw);
    if (!Number.isInteger(m) || m <= 0) {
      return { error: "Max. Einlösungen muss eine positive ganze Zahl sein." };
    }
    maxRedemptions = m;
  }

  const expiresRaw = String(formData.get("expiresAt") ?? "").trim();
  let expiresAt: Date | null = null;
  if (expiresRaw) {
    const d = new Date(expiresRaw);
    if (Number.isNaN(d.getTime())) return { error: "Ungültiges Ablaufdatum." };
    expiresAt = d;
  }

  const active = formData.get("active") != null;
  const code = codeInput || generateCode();

  try {
    await db.insert(coupons).values({
      code,
      ownerId,
      kind: "admin",
      recipientAmountEur: String(recipient),
      referrerAmountEur: String(referrer),
      referrerRequiresSubscription: true,
      rewardWindowDays: 14,
      maxRedemptions,
      expiresAt,
      active,
      createdByAdmin: true,
    });
  } catch (error) {
    console.error("Failed to create coupon:", error);
    return { error: "Code bereits vergeben oder Speichern fehlgeschlagen." };
  }

  revalidatePath("/coupons");
  return { ok: true, code };
}
