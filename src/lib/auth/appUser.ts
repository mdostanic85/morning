import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { auth, currentUser } from "@clerk/nextjs/server";
import { asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { userProfiles } from "@/db/tables";
import { fetchAll, fetchOne, fetchReturning } from "@/db/query";

export interface AppUser {
  id: number;
  clerkUserId: string | null;
  email: string;
  name: string | null;
  updatedAt: string;
}

const appUserStorage = new AsyncLocalStorage<number>();

function toAppUser(row: typeof userProfiles.$inferSelect): AppUser {
  return {
    id: row.id,
    clerkUserId: row.clerkUserId ?? null,
    email: row.email,
    name: row.name ?? null,
    updatedAt: row.updatedAt,
  };
}

export function runAsAppUser<T>(userId: number, operation: () => T): T {
  return appUserStorage.run(userId, operation);
}

export async function getAppUserById(id: number): Promise<AppUser | null> {
  const row = await fetchOne(db.select().from(userProfiles).where(eq(userProfiles.id, id)));
  return row ? toAppUser(row) : null;
}

async function ensureClerkUser(clerkUserId: string): Promise<AppUser> {
  const existing = await fetchOne(
    db.select().from(userProfiles).where(eq(userProfiles.clerkUserId, clerkUserId))
  );
  if (existing) return toAppUser(existing);

  const clerkUser = await currentUser();
  if (!clerkUser || clerkUser.id !== clerkUserId) {
    throw new Error("Could not load the signed-in user.");
  }

  const primaryEmail =
    clerkUser.emailAddresses.find((item) => item.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
  if (!primaryEmail) throw new Error("Your account needs an email address.");

  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() || null;

  // Preserve a legacy single-user installation by assigning its unclaimed
  // profile to the first Clerk user. Never claim a row once several profiles exist.
  const unclaimed = await fetchAll(
    db.select().from(userProfiles).where(isNull(userProfiles.clerkUserId)).orderBy(asc(userProfiles.id)).limit(2)
  );
  if (
    unclaimed.length === 1 &&
    unclaimed[0].email.toLowerCase() === primaryEmail.toLowerCase()
  ) {
    const [claimed] = await fetchReturning(
      db
        .update(userProfiles)
        .set({
          clerkUserId,
          email: primaryEmail.toLowerCase(),
          name: displayName,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(userProfiles.id, unclaimed[0].id))
        .returning()
    );
    return toAppUser(claimed);
  }

  const [created] = await fetchReturning(
    db
      .insert(userProfiles)
      .values({ clerkUserId, email: primaryEmail.toLowerCase(), name: displayName })
      .onConflictDoNothing({ target: userProfiles.clerkUserId })
      .returning()
  );
  if (created) return toAppUser(created);

  const raced = await fetchOne(
    db.select().from(userProfiles).where(eq(userProfiles.clerkUserId, clerkUserId))
  );
  if (!raced) throw new Error("Could not create the signed-in user.");
  return toAppUser(raced);
}

export async function requireAppUser(explicitUserId?: number): Promise<AppUser> {
  const contextualUserId = explicitUserId ?? appUserStorage.getStore();
  if (contextualUserId) {
    const user = await getAppUserById(contextualUserId);
    if (!user) throw new Error("The app user no longer exists.");
    return user;
  }

  let clerkUserId: string | null = null;
  try {
    clerkUserId = (await auth()).userId;
  } catch {
    // Background jobs have no Clerk request. They are allowed to use an
    // implicit owner only while this remains a single-user installation.
  }
  if (clerkUserId) return ensureClerkUser(clerkUserId);

  const users = await fetchAll(db.select().from(userProfiles).orderBy(asc(userProfiles.id)).limit(2));
  if (users.length === 1) return toAppUser(users[0]);
  throw new Error(
    users.length === 0
      ? "You must be signed in."
      : "This background operation needs an explicit user because multiple users exist."
  );
}

export async function requireAppUserId(explicitUserId?: number): Promise<number> {
  return (await requireAppUser(explicitUserId)).id;
}
