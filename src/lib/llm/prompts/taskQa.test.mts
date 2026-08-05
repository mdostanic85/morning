import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTaskQaUserPrompt,
  TASK_CHAT_MAX_SOURCE_BODY_CHARS,
  TASK_CHAT_USER_PROMPT_BUDGET,
  type TaskQaInput,
} from "./taskQa";

function oversizedInput(): TaskQaInput {
  return {
    question: "What should I pay attention to today?",
    currentUserName: "Milos Dostanic",
    task: null,
    sources: Array.from({ length: 60 }, (_, index) => ({
      id: `source-${index}`,
      sourceType: index % 3 === 0 ? "jira" : index % 3 === 1 ? "granola" : "confluence",
      sourceRole:
        index % 3 === 0
          ? "jira_issue_with_comments"
          : index % 3 === 1
            ? "granola_transcript"
            : "confluence_document",
      title: `Source ${index} KEEP-PRIORITY-${index < 3 ? "HIGH" : "LOW"}`,
      sourceDate: `2026-08-0${(index % 5) + 1}T12:00:00.000Z`,
      body: `BODY-${index} ${"x".repeat(24_000)}`,
    })),
    knowledge: Array.from({ length: 100 }, (_, index) => ({
      id: `knowledge-${index}`,
      type: "decision",
      title: `Knowledge ${index}`,
      content: `CONTENT-${index} ${"y".repeat(4_000)}`,
      sourceDate: `2026-08-0${(index % 5) + 1}T12:00:00.000Z`,
    })),
  };
}

describe("buildTaskQaUserPrompt", () => {
  it("keeps an oversized general-work prompt within the task-chat budget", () => {
    const prompt = buildTaskQaUserPrompt(oversizedInput());
    assert.ok(
      prompt.length <= TASK_CHAT_USER_PROMPT_BUDGET,
      `prompt was ${prompt.length} characters, budget is ${TASK_CHAT_USER_PROMPT_BUDGET}`
    );
  });

  it("prefers higher-priority sources when trimming", () => {
    const prompt = buildTaskQaUserPrompt(oversizedInput());
    assert.match(prompt, /KEEP-PRIORITY-HIGH/);
    assert.match(prompt, /"id": "source-0"/);
    assert.doesNotMatch(prompt, /"id": "source-59"/);
    assert.doesNotMatch(prompt, /BODY-59/);
  });

  it("clamps individual source bodies", () => {
    const prompt = buildTaskQaUserPrompt({
      question: "What is the status?",
      currentUserName: null,
      task: null,
      sources: [
        {
          id: "source-1",
          sourceType: "jira",
          sourceRole: "jira_issue_with_comments",
          title: "One issue",
          sourceDate: "2026-08-01T12:00:00.000Z",
          body: "z".repeat(TASK_CHAT_MAX_SOURCE_BODY_CHARS + 5_000),
        },
      ],
      knowledge: [],
    });
    assert.ok(prompt.length <= TASK_CHAT_USER_PROMPT_BUDGET);
    assert.match(prompt, /…/);
    assert.ok(!prompt.includes("z".repeat(TASK_CHAT_MAX_SOURCE_BODY_CHARS + 1)));
  });

  it("leaves a small prompt untouched", () => {
    const prompt = buildTaskQaUserPrompt({
      question: "What exactly do I need to do?",
      currentUserName: "Milos",
      task: {
        id: 1,
        title: "Ship the send button",
        status: "now",
        reason: "Users cannot tell it is a send control.",
        nextAction: "Make the control circular.",
        doneCriteria: ["Send button is circular when enabled and disabled."],
        dueDate: null,
        owner: "Milos",
        projectName: "Worklight",
      },
      sources: [
        {
          id: "source-1",
          sourceType: "jira",
          sourceRole: "jira_issue_with_comments",
          title: "WL-1",
          sourceDate: "2026-08-01T12:00:00.000Z",
          body: "Make the send button a circle.",
        },
      ],
      knowledge: [
        {
          id: "knowledge-1",
          type: "decision",
          title: "Circle send",
          content: "Icon-only send controls should be circular.",
          sourceDate: "2026-08-01T12:00:00.000Z",
        },
      ],
    });
    assert.match(prompt, /Make the send button a circle/);
    assert.match(prompt, /Icon-only send controls should be circular/);
    assert.match(prompt, /Ship the send button/);
  });
});
