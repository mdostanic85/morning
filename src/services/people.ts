import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { people as peopleTable, personAliases as personAliasesTable } from "@/db/tables";
import { fetchAll, fetchOne, execute, fetchReturning } from "@/db/query";
import type { Person, PersonAlias } from "@/domain/person";
import { normalizePersonName, resolvePersonIdFromAliases } from "@/lib/tasks/personIdentity";

function toPerson(row: typeof peopleTable.$inferSelect): Person {
  return {
    id: row.id,
    displayName: row.displayName,
    mergedIntoId: row.mergedIntoId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPersonAlias(row: typeof personAliasesTable.$inferSelect): PersonAlias {
  return {
    id: row.id,
    personId: row.personId,
    alias: row.alias,
    createdAt: row.createdAt,
  };
}

export async function listPeople(): Promise<Person[]> {
  const rows = await fetchAll(db.select().from(peopleTable));
  return rows.map(toPerson);
}

export async function getPersonById(id: number): Promise<Person | null> {
  const row = await fetchOne(db.select().from(peopleTable).where(eq(peopleTable.id, id)));
  return row ? toPerson(row) : null;
}

export async function listPersonAliases(): Promise<PersonAlias[]> {
  const rows = await fetchAll(db.select().from(personAliasesTable));
  return rows.map(toPersonAlias);
}

/** Follows a `mergedIntoId` chain to the final, canonical (non-merged) person id. */
async function resolveCanonicalPersonId(personId: number, guard = 0): Promise<number> {
  if (guard > 10) return personId; // defensive: never loop forever on a data error
  const person = await getPersonById(personId);
  if (!person || person.mergedIntoId == null) return personId;
  return resolveCanonicalPersonId(person.mergedIntoId, guard + 1);
}

async function createPerson(displayName: string): Promise<Person> {
  const [row] = await fetchReturning(
    db.insert(peopleTable).values({ displayName: displayName.trim() }).returning()
  );
  const person = toPerson(row);
  await execute(
    db.insert(personAliasesTable).values({ personId: person.id, alias: displayName.trim() })
  );
  return person;
}

async function addAliasIfNew(personId: number, alias: string): Promise<void> {
  const trimmed = alias.trim();
  if (!trimmed) return;
  const existing = await listPersonAliases();
  const alreadyKnown = existing.some(
    (entry) =>
      entry.personId === personId && normalizePersonName(entry.alias) === normalizePersonName(trimmed)
  );
  if (alreadyKnown) return;
  await execute(db.insert(personAliasesTable).values({ personId, alias: trimmed }));
}

export interface ResolvePersonResult {
  personId: number;
  created: boolean;
}

/**
 * WL-10: resolves a free-text name to a durable person id, learning new
 * alias spellings for a safe (unambiguous) match. When no safe match
 * exists, a brand-new person is created rather than guessing — this is
 * always additive, never a merge, so it carries no ambiguity risk.
 */
export async function resolveOrCreatePerson(name: string): Promise<ResolvePersonResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Cannot resolve a person from an empty name.");
  }

  const aliases = await listPersonAliases();
  const matchedId = resolvePersonIdFromAliases(trimmed, aliases);
  if (matchedId != null) {
    const canonicalId = await resolveCanonicalPersonId(matchedId);
    await addAliasIfNew(canonicalId, trimmed);
    return { personId: canonicalId, created: false };
  }

  const person = await createPerson(trimmed);
  return { personId: person.id, created: true };
}

/**
 * Explicit, user-confirmed merge of two distinct person entities — the only
 * way two different-looking names ever become the same person. Never
 * called automatically from extraction (ai-safety: no silent merges).
 */
export async function mergePersonInto(sourcePersonId: number, targetPersonId: number): Promise<void> {
  if (sourcePersonId === targetPersonId) return;
  const target = await resolveCanonicalPersonId(targetPersonId);
  const sourceAliases = (await listPersonAliases()).filter(
    (alias) => alias.personId === sourcePersonId
  );
  for (const alias of sourceAliases) {
    await addAliasIfNew(target, alias.alias);
  }
  await execute(
    db.update(peopleTable).set({ mergedIntoId: target, updatedAt: new Date().toISOString() }).where(eq(peopleTable.id, sourcePersonId))
  );
}
