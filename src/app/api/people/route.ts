import { NextResponse } from "next/server";
import { listPeople, listPersonAliases } from "@/services/people";

export async function GET() {
  const [people, aliases] = await Promise.all([listPeople(), listPersonAliases()]);
  const aliasesByPerson = new Map<number, string[]>();
  for (const alias of aliases) {
    const list = aliasesByPerson.get(alias.personId) ?? [];
    list.push(alias.alias);
    aliasesByPerson.set(alias.personId, list);
  }
  return NextResponse.json({
    people: people.map((person) => ({
      ...person,
      aliases: aliasesByPerson.get(person.id) ?? [],
    })),
  });
}
