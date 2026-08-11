import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { userProfiles } from "@/db/tables";
import { fetchReturning } from "@/db/query";
import { requireAppUser } from "@/lib/auth/appUser";

export interface UserProfile {
  id: number;
  clerkUserId: string | null;
  email: string;
  name: string | null;
  updatedAt: string;
}

export async function getUserProfile(): Promise<UserProfile | null> {
  return requireAppUser();
}

export async function saveUserProfile(email: string, name?: string): Promise<UserProfile> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    throw new Error("Enter a valid work email.");
  }

  const trimmedName = name?.trim() || null;
  const existing = await requireAppUser();
  const [row] = await fetchReturning(
    db
      .update(userProfiles)
      .set({ email: trimmed, name: trimmedName, updatedAt: new Date().toISOString() })
      .where(eq(userProfiles.id, existing.id))
      .returning()
  );
  return {
    id: row.id,
    clerkUserId: row.clerkUserId ?? null,
    email: row.email,
    name: row.name ?? null,
    updatedAt: row.updatedAt,
  };
}
