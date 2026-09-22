import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { ConfigModule } from "@lab/config";
import { CreditsModule } from "@lab/credits";
import { DatabaseModule } from "@lab/database";
import { ObservabilityModule } from "@lab/observability";
import { QueueModule } from "@lab/queue";
import { CreditWorkerService } from "./credit-worker.service";
import { OutboxRelayService } from "./outbox/outbox-relay.service";
import { WorkerPlatformController } from "./worker-platform.controller";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    ObservabilityModule,
    QueueModule,
    CreditsModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        redact: ["req.headers.authorization", "req.headers.cookie"],
      },
    }),
  ],
  controllers: [WorkerPlatformController],
  providers: [CreditWorkerService, OutboxRelayService],
})
export class WorkerModule {}
