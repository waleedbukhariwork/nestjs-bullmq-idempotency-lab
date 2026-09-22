import "reflect-metadata";
import { Pool } from "pg";
import { validateEnvironment } from "@lab/config";

const DEMO_ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";

async function main(): Promise<void> {
  const environment = validateEnvironment(process.env);
  const pool = new Pool({ connectionString: environment.DATABASE_URL });

  try {
    await pool.query(
      `INSERT INTO credit_accounts (id, owner_reference, balance_cents)
       VALUES ($1, $2, 0)
       ON CONFLICT (id) DO NOTHING`,
      [DEMO_ACCOUNT_ID, "demo-account"],
    );
    process.stdout.write(`Seeded account ${DEMO_ACCOUNT_ID}\n`);
  } finally {
    await pool.end();
  }
}

void main();
