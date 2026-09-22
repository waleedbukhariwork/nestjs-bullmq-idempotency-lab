import { Pool } from "pg";

export type LabMode = "unsafe" | "safe";

export class LabDatabase {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      application_name: "nestjs-bullmq-idempotency-lab-controlled-test",
      max: 4,
    });
  }

  async setup(): Promise<void> {
    await this.pool.query(`
      CREATE SCHEMA IF NOT EXISTS bullmq_lab;
      CREATE TABLE IF NOT EXISTS bullmq_lab.effects (
        id bigserial PRIMARY KEY,
        operation_key text NOT NULL,
        mode text NOT NULL,
        source text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS bullmq_lab.processed_operations (
        operation_key text PRIMARY KEY,
        completed_at timestamptz NOT NULL DEFAULT now()
      );
      TRUNCATE bullmq_lab.effects, bullmq_lab.processed_operations RESTART IDENTITY;
    `);
  }

  async recordEffect(
    mode: LabMode,
    operationKey: string,
    source: string,
  ): Promise<boolean> {
    if (mode === "unsafe") {
      await this.pool.query(
        `INSERT INTO bullmq_lab.effects (operation_key, mode, source)
         VALUES ($1, $2, $3)`,
        [operationKey, mode, source],
      );
      return true;
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const claim = await client.query(
        `INSERT INTO bullmq_lab.processed_operations (operation_key)
         VALUES ($1)
         ON CONFLICT (operation_key) DO NOTHING
         RETURNING operation_key`,
        [operationKey],
      );
      if (claim.rowCount === 0) {
        await client.query("COMMIT");
        return false;
      }
      await client.query(
        `INSERT INTO bullmq_lab.effects (operation_key, mode, source)
         VALUES ($1, $2, $3)`,
        [operationKey, mode, source],
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async countEffects(mode: LabMode, operationKey: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM bullmq_lab.effects
       WHERE operation_key = $1 AND mode = $2`,
      [operationKey, mode],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
