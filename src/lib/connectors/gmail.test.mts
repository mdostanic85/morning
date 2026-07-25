import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractGoogleDocumentReference,
  fetchLinkedGoogleDocumentText,
  sharedGoogleDocumentTitle,
} from "./gmail.ts";

describe("Gemini Google Docs links in Gmail", () => {
  it("recognizes regular and account-scoped Google Docs URLs", () => {
    const id = "13IBEiN29bLtyf7dpJ_2MYjVOYInP5_wYqDzRyDfPICk";
    assert.deepEqual(
      extractGoogleDocumentReference(
        `Open https://docs.google.com/document/d/${id}/edit?usp=sharing`
      ),
      {
        id,
        url: `https://docs.google.com/document/d/${id}/edit`,
      }
    );
    assert.deepEqual(
      extractGoogleDocumentReference(
        `Open https://docs.google.com/document/u/1/d/${id}/edit?usp=sharing`
      ),
      {
        id,
        url: `https://docs.google.com/document/d/${id}/edit`,
      }
    );
  });

  it("extracts the actual document title from a share-notification subject", () => {
    assert.equal(
      sharedGoogleDocumentTitle(
        'Document shared with you: "Design Team meeting - Notes by Gemini"'
      ),
      "Design Team meeting - Notes by Gemini"
    );
  });

  it("loads transcript text through the authenticated Docs export endpoint", async () => {
    const id = "doc_123";
    let requestedUrl = "";
    const text = await fetchLinkedGoogleDocumentText(
      {
        id,
        url: `https://docs.google.com/document/d/${id}/edit`,
      },
      async (url) => {
        requestedUrl = url;
        return new Response("\uFEFFMeet Jackson and align the AI efforts.");
      }
    );

    assert.equal(
      requestedUrl,
      `https://docs.google.com/document/d/${id}/export?format=txt`
    );
    assert.equal(text, "Meet Jackson and align the AI efforts.");
  });

  it("fails the provider when a linked document cannot be read so sync retries it", async () => {
    await assert.rejects(
      fetchLinkedGoogleDocumentText(
        {
          id: "blocked_doc",
          url: "https://docs.google.com/document/d/blocked_doc/edit",
        },
        async () =>
          new Response("Permission denied", {
            status: 403,
          })
      ),
      /Could not read linked Gemini document: Permission denied/
    );
  });
});
