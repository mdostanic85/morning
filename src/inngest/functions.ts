import { inngest } from "./client";
import { setLastTestPingResult } from "./testState";
import { syncMyDay } from "./functions/syncMyDay";

export const testPing = inngest.createFunction(
  {
    id: "test-ping",
    name: "Test ping",
    triggers: [{ event: "worklight/test.ping" }],
  },
  async ({ event, step }) => {
    const result = await step.run("build-pong", async () => {
      const note = typeof event.data.note === "string" ? event.data.note : "no note";
      const message = `pong: ${note}`;
      const completedAt = new Date().toISOString();
      setLastTestPingResult({ note, message, completedAt });
      return { note, message, completedAt };
    });

    return { ok: true, ...result };
  }
);

export const inngestFunctions = [testPing, syncMyDay];
