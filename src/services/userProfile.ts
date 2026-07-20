import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { userProfiles } from "@/db/tables";
import { fetchOne, fetchReturning } from "@/db/query";

export interface UserProfile {
  id: number;
  email: string;
  name: string | null;
  updatedAt: string;
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const row = await fetchOne(db.select().from(userProfiles).limit(1));
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name ?? null, updatedAt: row.updatedAt };
}

export async function saveUserProfile(email: string, name?: string): Promise<UserProfile> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    throw new Error("Enter a valid work email.");
  }

  const trimmedName = name?.trim() || null;
  const existing = await fetchOne(db.select().from(userProfiles).limit(1));

  if (existing) {
    const [row] = await fetchReturning(
      db
        .update(userProfiles)
        .set({ email: trimmed, name: trimmedName, updatedAt: new Date().toISOString() })
        .where(eq(userProfiles.id, existing.id))
        .returning()
    );
    return { id: row.id, email: row.email, name: row.name ?? null, updatedAt: row.updatedAt };
  }

  const [row] = await fetchReturning(db.insert(userProfiles).values({ email: trimmed, name: trimmedName }).returning());
  return { id: row.id, email: row.email, name: row.name ?? null, updatedAt: row.updatedAt };
}
