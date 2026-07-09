import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { userProfiles } from "@/db/schema";

export interface UserProfile {
  email: string;
  name: string | null;
  updatedAt: string;
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const row = db.select().from(userProfiles).limit(1).get();
  if (!row) return null;
  return { email: row.email, name: row.name ?? null, updatedAt: row.updatedAt };
}

export async function saveUserProfile(email: string, name?: string): Promise<UserProfile> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    throw new Error("Enter a valid work email.");
  }

  const trimmedName = name?.trim() || null;
  const existing = db.select().from(userProfiles).limit(1).get();

  if (existing) {
    const [row] = db
      .update(userProfiles)
      .set({ email: trimmed, name: trimmedName, updatedAt: new Date().toISOString() })
      .where(eq(userProfiles.id, existing.id))
      .returning()
      .all();
    return { email: row.email, name: row.name ?? null, updatedAt: row.updatedAt };
  }

  const [row] = db.insert(userProfiles).values({ email: trimmed, name: trimmedName }).returning().all();
  return { email: row.email, name: row.name ?? null, updatedAt: row.updatedAt };
}
