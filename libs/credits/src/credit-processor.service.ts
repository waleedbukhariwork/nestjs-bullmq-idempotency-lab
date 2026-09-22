import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { DatabaseService } from "@lab/database";

type LockedCommand = {
  id: string;
  operation_key: string;
  account_id: string;
  amount_cents: number;
  status: "pending" | "completed" | "failed";
  result: Record<string, unknown> | null;
};

export type CreditProcessingResult = {
  status: "applied" | "already-applied";
  commandId: string;
  operationKey: string;
  balanceCents: string;
};

@Injectable()
export class CreditProcessorService {
  constructor(private readonly database: DatabaseService) {}

  process(
    commandId: string,
    sourceJobId: string,
  ): Promise<CreditProcessingResult> {
    return this.database.withTransaction(async (client) => {
      const command = await this.lockCommand(client, commandId);

      if (command.status === "completed") {
        return this.completedResult(command);
      }

      const ledger = await client.query(
        `INSERT INTO credit_ledger
          (operation_key, command_id, account_id, amount_cents, source_job_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (operation_key) DO NOTHING
         RETURNING id`,
        [
          command.operation_key,
          command.id,
          command.account_id,
          command.amount_cents,
          sourceJobId,
        ],
      );

      if (ledger.rowCount === 0) {
        throw new Error(
          `Ledger already contains operation ${command.operation_key} but command is incomplete`,
        );
      }

      const account = await client.query<{ balance_cents: string }>(
        `UPDATE credit_accounts
         SET balance_cents = balance_cents + $2,
             version = version + 1,
             updated_at = now()
         WHERE id = $1
         RETURNING balance_cents::text`,
        [command.account_id, command.amount_cents],
      );
      const balance = account.rows[0]?.balance_cents;
      if (!balance)
        throw new Error(
          `Account ${command.account_id} disappeared during processing`,
        );

      const result: CreditProcessingResult = {
        status: "applied",
        commandId: command.id,
        operationKey: command.operation_key,
        balanceCents: balance,
      };

      await client.query(
        `UPDATE credit_commands
         SET status = 'completed', result = $2::jsonb, completed_at = now(), updated_at = now()
         WHERE id = $1`,
        [command.id, JSON.stringify(result)],
      );

      return result;
    });
  }

  private async lockCommand(
    client: PoolClient,
    commandId: string,
  ): Promise<LockedCommand> {
    const result = await client.query<LockedCommand>(
      `SELECT id, operation_key, account_id, amount_cents, status, result
       FROM credit_commands
       WHERE id = $1
       FOR UPDATE`,
      [commandId],
    );
    const command = result.rows[0];
    if (!command) throw new Error(`Credit command ${commandId} does not exist`);
    if (command.status === "failed")
      throw new Error(`Credit command ${commandId} is terminally failed`);
    return command;
  }

  private completedResult(command: LockedCommand): CreditProcessingResult {
    const result = command.result as Partial<CreditProcessingResult> | null;
    if (!result?.balanceCents) {
      throw new Error(`Completed command ${command.id} has no durable result`);
    }
    return {
      status: "already-applied",
      commandId: command.id,
      operationKey: command.operation_key,
      balanceCents: result.balanceCents,
    };
  }
}
