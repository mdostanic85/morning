Determine whether the current work has reached a clean chat boundary.

If the current phase is not complete, state why this chat should continue.

If a new chat is appropriate:

1. Summarize only the verified current state.
2. Create or update `docs/agent-handoffs/next-chat.md`.
3. Include:
   - completed phase;
   - changed files;
   - uncommitted or committed state;
   - tests and results;
   - unresolved review findings;
   - next single objective;
   - allowed file scope;
   - prohibited scope;
   - acceptance criteria;
   - required documents;
   - recommended model.
4. Produce a self-contained starter prompt for the next chat.
5. Do not begin the next phase.
6. Do not modify production code.
