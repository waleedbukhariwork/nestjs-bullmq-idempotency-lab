import { createHash, randomUUID } from "node:crypto";
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import { DatabaseService } from "@lab/database";
import type {
  CreateCreditCommandInput,
  CreateCreditCommandResult,
  CreditCommand,
  CreditCommandStatus,
} from "./credits.types";

type CommandRow = {
  id: string;
  operation_key: string;
  account_id: string;
  amount_cents: number;
  reason: string;
  request_hash: string;
  status: CreditCommandStatus;
  result: Record<string, unknown> | null;
  created_at: Date;
  completed_at: Date | null;
};

@Injectable()
export class CreditCommandService {
  constructor(private readonly database: DatabaseService) {}

  create(input: CreateCreditCommandInput): Promise<CreateCreditCommandResult> {
    const requestHash = this.hashRequest(input);
    return this.database.withTransaction(async (client) => {
      await this.assertAccountExists(client, input.accountId);

      const commandId = randomUUID();
      const inserted = await client.query<CommandRow>(
        `INSERT INTO credit_commands
          (id, operation_key, account_id, amount_cents, reason, request_hash, trace_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (operation_key) DO NOTHING
         RETURNING *`,
        [
          commandId,
          input.operationKey,
          input.accountId,
          input.amountCents,
          input.reason,
          requestHash,
          input.traceId,
        ],
      );

      if (inserted.rowCount === 0) {
        const existing = await this.findByOperationKey(
          client,
          input.operationKey,
        );
        if (existing.request_hash !== requestHash) {
          throw new ConflictException(
            "The idempotency key was already used with a different request payload",
          );
        }
        return {
          commandId: existing.id,
          operationKey: existing.operation_key,
          status: existing.status,
          duplicate: true,
        };
      }

      await client.query(
        `INSERT INTO outbox_messages
          (id, aggregate_id, event_type, payload)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          randomUUID(),
          commandId,
          "credit.command.created.v1",
          JSON.stringify({
            version: 1,
            commandId,
            operationKey: input.operationKey,
            traceId: input.traceId,
            queuedAt: new Date().toISOString(),
          }),
        ],
      );

      return {
        commandId,
        operationKey: input.operationKey,
        status: "pending",
        duplicate: false,
      };
    });
  }

  async get(commandId: string): Promise<CreditCommand> {
    const result = await this.database.query<CommandRow>(
      "SELECT * FROM credit_commands WHERE id = $1",
      [commandId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException("Credit command not found");
    return this.mapCommand(row);
  }

  private hashRequest(input: CreateCreditCommandInput): string {
    const canonical = JSON.stringify({
      accountId: input.accountId,
      amountCents: input.amountCents,
      reason: input.reason,
    });
    return createHash("sha256").update(canonical).digest("hex");
  }

  private async assertAccountExists(
    client: PoolClient,
    accountId: string,
  ): Promise<void> {
    const account = await client.query(
      "SELECT 1 FROM credit_accounts WHERE id = $1",
      [accountId],
    );
    if (account.rowCount === 0)
      throw new NotFoundException("Credit account not found");
  }

  private async findByOperationKey(
    client: PoolClient,
    operationKey: string,
  ): Promise<CommandRow> {
    const result = await client.query<CommandRow>(
      "SELECT * FROM credit_commands WHERE operation_key = $1 FOR UPDATE",
      [operationKey],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Idempotency conflict row disappeared");
    return row;
  }

  private mapCommand(row: CommandRow): CreditCommand {
    return {
      id: row.id,
      operationKey: row.operation_key,
      accountId: row.account_id,
      amountCents: row.amount_cents,
      reason: row.reason,
      requestHash: row.request_hash,
      status: row.status,
      result: row.result,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }
}
