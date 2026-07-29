import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { execute, fetchAll, fetchOne } from "./query.ts";

/** Mimics a drizzle query builder: awaiting it re-runs the query. */
function builder<T>(run: () => Promise<T[]>) {
  let executions = 0;
  return {
    executions: () => executions,
    query: {
      then<R>(
        onFulfilled?: (rows: T[]) => R,
        onRejected?: (reason: unknown) => R
      ): Promise<R> {
        executions += 1;
        return run().then(onFulfilled, onRejected);
      },
    } as PromiseLike<T[]>,
  };
}

function drizzleFailure(driverCode?: string): Error {
  const driver = new Error("write CONNECTION_CLOSED 127.0.0.1:5433");
  if (driverCode) Object.assign(driver, { code: driverCode });
  return new Error('Failed query: select "id" from "work_tasks"\nparams: ', {
    cause: driver,
  });
}

describe("fetchAll", () => {
  it("replays a read once when the pooled connection died", async () => {
    let attempts = 0;
    const { query, executions } = builder(async () => {
      attempts += 1;
      if (attempts === 1) throw drizzleFailure("CONNECTION_CLOSED");
      return [{ id: 1 }];
    });

    assert.deepEqual(await fetchAll(query), [{ id: 1 }]);
    assert.equal(executions(), 2);
  });

  it("replays past both failures a dead connection produces", async () => {
    let attempts = 0;
    const { query, executions } = builder(async () => {
      attempts += 1;
      if (attempts === 1) throw drizzleFailure("CONNECTION_CLOSED");
      if (attempts === 2) throw drizzleFailure("57P01");
      return [{ id: 2 }];
    });

    assert.deepEqual(await fetchAll(query), [{ id: 2 }]);
    assert.equal(executions(), 3);
  });

  it("stops replaying and reports the driver failure", async () => {
    const { query, executions } = builder(async () => {
      throw drizzleFailure("CONNECTION_CLOSED");
    });

    await assert.rejects(fetchAll(query), (error: Error) => {
      assert.match(error.message, /CONNECTION_CLOSED: write CONNECTION_CLOSED/);
      assert.match(error.message, /Failed query: select "id" from "work_tasks"/);
      return true;
    });
    assert.equal(executions(), 3);
  });

  it("does not replay a query the database rejected", async () => {
    const { query, executions } = builder(async () => {
      throw drizzleFailure("42703");
    });

    await assert.rejects(fetchAll(query));
    assert.equal(executions(), 1);
  });

  it("passes through a failure with no driver cause", async () => {
    const { query } = builder(async () => {
      throw new Error("boom");
    });

    await assert.rejects(fetchAll(query), { message: "boom" });
  });
});

describe("fetchOne", () => {
  it("replays a read once and returns the first row", async () => {
    let attempts = 0;
    const { query } = builder(async () => {
      attempts += 1;
      if (attempts === 1) throw drizzleFailure("ECONNRESET");
      return [{ id: 7 }, { id: 8 }];
    });

    assert.deepEqual(await fetchOne(query), { id: 7 });
  });
});

describe("execute", () => {
  it("never replays a write, because the server may have committed it", async () => {
    const { query, executions } = builder(async () => {
      throw drizzleFailure("CONNECTION_CLOSED");
    });

    await assert.rejects(execute(query), (error: Error) => {
      assert.match(error.message, /CONNECTION_CLOSED: write CONNECTION_CLOSED/);
      return true;
    });
    assert.equal(executions(), 1);
  });
});
