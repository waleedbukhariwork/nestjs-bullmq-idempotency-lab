import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, QueueEvents, Worker } from "bullmq";
import { PinoLogger } from "nestjs-pino";
import type { AppEnvironment } from "@lab/config";
import {
  APPLY_CREDIT_JOB,
  CREDIT_QUEUE,
  creditJobSchema,
  type CreditJob,
} from "@lab/contracts";
import { CreditProcessorService } from "@lab/credits";
import { MetricsService } from "@lab/observability";

@Injectable()
export class CreditWorkerService
  implements OnModuleInit, OnApplicationShutdown
{
  private worker: Worker<CreditJob> | undefined;
  private events: QueueEvents | undefined;
  private ready = false;

  constructor(
    private readonly config: ConfigService<AppEnvironment, true>,
    private readonly processor: CreditProcessorService,
    private readonly metrics: MetricsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CreditWorkerService.name);
  }

  async onModuleInit(): Promise<void> {
    const connection = this.connection();
    const prefix = this.config.get("QUEUE_PREFIX", { infer: true });
    this.worker = new Worker<CreditJob>(
      CREDIT_QUEUE,
      (job) => this.process(job),
      {
        connection,
        prefix,
        concurrency: this.config.get("WORKER_CONCURRENCY", { infer: true }),
      },
    );
    this.events = new QueueEvents(CREDIT_QUEUE, { connection, prefix });

    this.worker.on("error", (error) =>
      this.logger.error({ err: error }, "worker error"),
    );
    this.events.on("stalled", ({ jobId }) =>
      this.logger.warn({ jobId, event: "job-stalled" }, "BullMQ job stalled"),
    );
    await Promise.all([
      this.worker.waitUntilReady(),
      this.events.waitUntilReady(),
    ]);
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  async onApplicationShutdown(): Promise<void> {
    this.ready = false;
    await Promise.all([this.worker?.close(), this.events?.close()]);
  }

  private async process(job: Job<CreditJob>) {
    if (job.name !== APPLY_CREDIT_JOB) {
      throw new Error(`Unsupported job name: ${job.name}`);
    }
    const payload = creditJobSchema.parse(job.data);
    this.logger.info(
      {
        event: "credit-job-started",
        jobId: job.id,
        commandId: payload.commandId,
        operationKey: payload.operationKey,
        attemptsMade: job.attemptsMade,
        traceId: payload.traceId,
      },
      "processing credit command",
    );

    try {
      const result = await this.processor.process(
        payload.commandId,
        String(job.id),
      );
      this.metrics.jobsProcessed.inc({ outcome: result.status });
      this.logger.info(
        { event: "credit-job-completed", jobId: job.id, ...result },
        "credit command completed",
      );
      return result;
    } catch (error) {
      this.metrics.jobsProcessed.inc({ outcome: "failed" });
      this.logger.error(
        {
          err: error,
          event: "credit-job-failed",
          jobId: job.id,
          commandId: payload.commandId,
        },
        "credit command failed",
      );
      throw error;
    }
  }

  private connection() {
    return {
      host: this.config.get("REDIS_HOST", { infer: true }),
      port: this.config.get("REDIS_PORT", { infer: true }),
      password: this.config.get("REDIS_PASSWORD", { infer: true }),
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    };
  }
}
