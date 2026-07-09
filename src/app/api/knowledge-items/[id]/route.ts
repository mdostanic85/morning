import { NextResponse } from "next/server";
import {
  approveKnowledgeItem,
  deleteKnowledgeItem,
  getKnowledgeItemById,
} from "@/services/knowledgeItems";
import { getSourceItemById } from "@/services/sourceItems";
import { deleteKnowledgeItemEmbeddings, indexKnowledgeItem } from "@/lib/knowledge/embeddings";

/** Accept a pending knowledge item: mark it approved and add it to the semantic index. */
export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Valid knowledge item id is required." }, { status: 400 });
  }

  const existing = await getKnowledgeItemById(id);
  if (!existing) {
    return NextResponse.json({ error: "Knowledge item not found." }, { status: 404 });
  }

  const item = (await approveKnowledgeItem(id)) ?? existing;

  let indexingError: string | null = null;
  try {
    const sourceItem = item.sourceItemId ? await getSourceItemById(item.sourceItemId) : null;
    await indexKnowledgeItem(item, sourceItem);
  } catch (err) {
    // The item is accepted either way — semantic search just won't find it
    // until indexing succeeds (e.g. once an API key is configured).
    indexingError = err instanceof Error ? err.message : "Indexing failed.";
  }

  return NextResponse.json({ item, indexingError });
}

/** Reject a pending knowledge item: remove it and any embeddings entirely. */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Valid knowledge item id is required." }, { status: 400 });
  }

  const item = await getKnowledgeItemById(id);
  if (!item) {
    return NextResponse.json({ error: "Knowledge item not found." }, { status: 404 });
  }

  await deleteKnowledgeItemEmbeddings(id);
  await deleteKnowledgeItem(id);
  return NextResponse.json({ ok: true });
}
