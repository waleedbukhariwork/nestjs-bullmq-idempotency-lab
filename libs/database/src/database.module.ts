import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import type { AppEnvironment } from "@lab/config";
import { DATABASE_POOL } from "./database.constants";
import { DatabaseService } from "./database.service";

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnvironment, true>) =>
        new Pool({
          connectionString: config.get("DATABASE_URL", { infer: true }),
          max: config.get("DATABASE_POOL_MAX", { infer: true }),
          application_name: "nestjs-bullmq-idempotency-lab",
          connectionTimeoutMillis: 5_000,
          idleTimeoutMillis: 30_000,
          statement_timeout: 10_000,
        }),
    },
    DatabaseService,
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
