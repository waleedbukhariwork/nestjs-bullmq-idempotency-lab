import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { INestApplicationContext } from "@nestjs/common";
import { ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CreditCommandService } from "@lab/credits";
import { DatabaseService } from "@lab/database";
import { AppModule } from "../../apps/api/src/app.module";
import { WorkerModule } from "../../apps/worker/src/worker.module";

const DEMO_ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";

describe("production reliability path", () => {
  let api: INestApplicationContext;
  let worker: INestApplicationContext;
  let commands: CreditCommandService;
  let database: DatabaseService;

  beforeAll(async () => {
    const apiModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const workerModule = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();
    api = apiModule;
    worker = workerModule;
    await Promise.all([api.init(), worker.init()]);
    commands = api.get(CreditCommandService);
    database = api.get(DatabaseService);
  });

  afterAll(async () => {
    await Promise.all([api.close(), worker.close()]);
  });

  beforeEach(async () => {
    await database.query("DELETE FROM credit_ledger");
    await database.query("DELETE FROM outbox_messages");
    await database.query("DELETE FROM credit_commands");
    await database.query(
      `INSERT INTO credit_accounts (id, owner_reference, balance_cents, version)
       VALUES ($1, 'integration-account', 0, 0)
       ON CONFLICT (id) DO UPDATE SET balance_cents = 0, version = 0`,
      [DEMO_ACCOUNT_ID],
    );
  });

  it("publishes through the outbox and applies one durable effect", async () => {
    const operationKey = `integration-${randomUUID()}`;
    const input = {
      operationKey,
      accountId: DEMO_ACCOUNT_ID,
      amountCents: 2500,
      reason: "integration test credit",
      traceId: randomUUID(),
    };

    const first = await commands.create(input);
    const duplicate = await commands.create(input);
    const completed = await waitForCompletion(first.commandId);

    expect(duplicate.commandId).toBe(first.commandId);
    expect(duplicate.duplicate).toBe(true);
    expect(completed.status).toBe("completed");

    const [account, ledger, outbox] = await Promise.all([
      database.query<{ balance_cents: string; version: number }>(
        "SELECT balance_cents::text, version FROM credit_accounts WHERE id = $1",
        [DEMO_ACCOUNT_ID],
      ),
      database.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM credit_ledger WHERE operation_key = $1",
        [operationKey],
      ),
      database.query<{ published_at: Date | null }>(
        "SELECT published_at FROM outbox_messages WHERE aggregate_id = $1",
        [first.commandId],
      ),
    ]);

    expect(account.rows[0]).toEqual({ balance_cents: "2500", version: 1 });
    expect(ledger.rows[0]?.count).toBe("1");
    expect(outbox.rows[0]?.published_at).toBeInstanceOf(Date);
  });

  it("rejects reuse of an idempotency key with a different payload", async () => {
    const operationKey = `conflict-${randomUUID()}`;
    await commands.create({
      operationKey,
      accountId: DEMO_ACCOUNT_ID,
      amountCents: 100,
      reason: "first request",
      traceId: randomUUID(),
    });

    await expect(
      commands.create({
        operationKey,
        accountId: DEMO_ACCOUNT_ID,
        amountCents: 200,
        reason: "different request",
        traceId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  async function waitForCompletion(commandId: string) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const command = await commands.get(commandId);
      if (command.status === "completed") return command;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Command ${commandId} did not complete within 15 seconds`);
  }
});
