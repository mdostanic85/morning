// Seeds one project, one transcript source, and three tasks so the app has
// something real to render. Run with `npm run db:seed`. Safe to re-run — it
// clears every table first.
import { db } from "./connection";
import {
  projects,
  sourceItems,
  workTasks,
  evidence,
  knowledgeItems,
  verificationReports,
  connections,
} from "./schema";

function run() {
  db.delete(verificationReports).run();
  db.delete(evidence).run();
  db.delete(knowledgeItems).run();
  db.delete(workTasks).run();
  db.delete(sourceItems).run();
  db.delete(projects).run();
  db.delete(connections).run();

  const [project] = db
    .insert(projects)
    .values({
      name: "Client Website Refresh",
      description: "Redesign of the marketing site for Acme Co.",
      keywords: ["website", "acme", "homepage", "hero"],
      people: ["Milos", "Sara"],
      jiraKeys: ["WEB"],
      repoPaths: ["~/code/acme-website"],
      figmaFileKeys: [],
    })
    .returning()
    .all();

  const [transcript] = db
    .insert(sourceItems)
    .values({
      projectId: project.id,
      sourceType: "manual_transcript",
      title: "Tuesday standup",
      body:
        "Milos: I'll get the drizzle schema drafted today. Sara: can you also loop in the " +
        "client about the homepage hero copy? We still don't have a final answer on who owns " +
        "the illustration asset — need to check with the design team. Also Sara is blocked on " +
        "deploying staging until INFRA-42 is resolved.",
      author: "Milos",
      sourceDate: "2026-07-07T09:00:00.000Z",
    })
    .returning()
    .all();

  const [task1] = db
    .insert(workTasks)
    .values({
      projectId: project.id,
      title: "Confirm homepage hero copy with client",
      status: "now",
      priorityScore: 0.9,
      confidence: 0.85,
      reason: "Copy sign-off is blocking the hero section build.",
      nextAction: "Send the client the two hero copy options and ask for a pick by Friday.",
      doneCriteria: ["Client has replied with a chosen option"],
    })
    .returning()
    .all();

  db.insert(evidence)
    .values({
      taskId: task1.id,
      sourceItemId: transcript.id,
      quote: "can you also loop in the client about the homepage hero copy?",
      summary: "Sara asked Milos to get client sign-off on the hero copy.",
      sourceDate: transcript.sourceDate,
    })
    .run();

  const [task2] = db
    .insert(workTasks)
    .values({
      projectId: project.id,
      title: "Find owner of the hero illustration asset",
      status: "unclear",
      priorityScore: 0.4,
      confidence: 0.3,
      reason:
        "Nobody has confirmed who is responsible for delivering the illustration, so the hero " +
        "section can't be scheduled.",
      nextAction: "Ask the design team lead who owns the illustration deliverable.",
      doneCriteria: ["An owner is named and confirmed"],
    })
    .returning()
    .all();

  db.insert(evidence)
    .values({
      taskId: task2.id,
      sourceItemId: transcript.id,
      quote: "We still don't have a final answer on who owns the illustration asset",
      summary: "Standup surfaced that the illustration asset has no confirmed owner.",
      sourceDate: transcript.sourceDate,
    })
    .run();

  const [task3] = db
    .insert(workTasks)
    .values({
      projectId: project.id,
      title: "Deploy staging once INFRA-42 is resolved",
      status: "waiting",
      priorityScore: 0.5,
      confidence: 0.95,
      reason: "Sara is blocked on deploying until the infra ticket is resolved.",
      nextAction: "No action available yet — waiting on infra.",
      doneCriteria: ["INFRA-42 is marked resolved", "Staging deploy succeeds"],
      waitingOn: "INFRA-42 (infra ticket)",
    })
    .returning()
    .all();

  db.insert(evidence)
    .values({
      taskId: task3.id,
      sourceItemId: transcript.id,
      quote: "Sara is blocked on deploying staging until INFRA-42 is resolved.",
      summary: "Staging deploy is blocked on an infra ticket.",
      sourceDate: transcript.sourceDate,
    })
    .run();

  db.insert(knowledgeItems)
    .values({
      projectId: project.id,
      type: "open_question",
      title: "Who owns the hero illustration asset?",
      content: "Raised in Tuesday standup — no owner confirmed yet.",
      sourceItemId: transcript.id,
      confidence: 0.3,
    })
    .run();

  console.log("Seeded 1 project, 1 source item, and 3 tasks (with evidence).");
}

run();
