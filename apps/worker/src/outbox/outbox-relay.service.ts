import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { PinoLogger } from "nestjs-pino";
import type { AppEnvironment } from "@lab/config";
import {
  APPLY_CREDIT_JOB,
  CREDIT_QUEUE,
  creditJobId,
  creditJobSchema,
  type CreditJob,
} from "@lab/contracts";
import { DatabaseService } from "@lab/database";
import { MetricsService } from "@lab/observability";

type OutboxRow = {
  id: string;
  aggregate_id: string;
  payload: CreditJob;
  attempts: number;
};

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    @InjectQueue(CREDIT_QUEUE) private readonly queue: Queue<CreditJob>,
    private readonly config: ConfigService<AppEnvironment, true>,
    private readonly database: DatabaseService,
    private readonly metrics: MetricsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OutboxRelayService.name);
  }

  onModuleInit(): void {
    const interval = this.config.get("OUTBOX_POLL_INTERVAL_MS", {
      infer: true,
    });
    this.timer = setInterval(() => void this.dispatchOnce(), interval);
    this.timer.unref();
    void this.dispatchOnce();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    while (this.running) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  async dispatchOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const messages = await this.claimBatch();
      if (messages.length === 0) return;

      const attempts = await Promise.allSettled(
        messages.map(async (message) => {
          const payload = creditJobSchema.parse(message.payload);
          await this.queue.add(APPLY_CREDIT_JOB, payload, {
            jobId: creditJobId(payload.operationKey),
          });
          return message.id;
        }),
      );

      const publishedIds = attempts.flatMap((attempt) =>
        attempt.status === "fulfilled" ? [attempt.value] : [],
      );
      const failed = attempts.flatMap((attempt, index) => {
        if (attempt.status === "fulfilled") return [];
        const message = messages[index];
        return message
          ? [{ id: message.id, error: this.errorMessage(attempt.reason) }]
          : [];
      });

      await Promise.all([
        this.markPublished(publishedIds),
        ...failed.map((failure) =>
          this.releaseFailed(failure.id, failure.error),
        ),
      ]);
      this.metrics.outboxPublished.inc(publishedIds.length);

      if (failed.length > 0) {
        this.logger.warn(
          { failed: failed.length },
          "outbox publish failed; messages rescheduled",
        );
      }
    } catch (error) {
      this.logger.error({ err: error }, "outbox dispatch cycle failed");
    } finally {
      this.running = false;
    }
  }

  private async claimBatch(): Promise<OutboxRow[]> {
    const batchSize = this.config.get("OUTBOX_BATCH_SIZE", { infer: true });
    const result = await this.database.query<OutboxRow>(
      `WITH candidates AS (
         SELECT id
         FROM outbox_messages
         WHERE published_at IS NULL
           AND available_at <= now()
           AND (status = 'pending' OR locked_until < now())
         ORDER BY created_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE outbox_messages AS message
       SET status = 'publishing',
           locked_until = now() + interval '30 seconds',
           attempts = attempts + 1,
           last_error = NULL
       FROM candidates
       WHERE message.id = candidates.id
       RETURNING message.id, message.aggregate_id, message.payload, message.attempts`,
      [batchSize],
    );
    return result.rows;
  }

  async markPublished(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.database.query(
      `UPDATE outbox_messages
       SET status = 'published', published_at = now(), locked_until = NULL
       WHERE id = ANY($1::uuid[])`,
      [ids],
    );
  }

  private async releaseFailed(id: string, message: string): Promise<void> {
    await this.database.query(
      `UPDATE outbox_messages
       SET status = 'pending',
           locked_until = NULL,
           last_error = $2,
           available_at = now() + make_interval(secs => LEAST(300, power(2, attempts)::int))
       WHERE id = $1`,
      [id, message.slice(0, 2000)],
    );
  }

  private errorMessage(value: unknown): string {
    return value instanceof Error ? value.message : String(value);
  }
}
