import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from "@nestjs/common";
import { DatabaseService } from "@lab/database";
import { MetricsService } from "@lab/observability";
import { CreditWorkerService } from "./credit-worker.service";

@Controller()
export class WorkerPlatformController {
  constructor(
    private readonly database: DatabaseService,
    private readonly worker: CreditWorkerService,
    private readonly metrics: MetricsService,
  ) {}

  @Get("health/live")
  live() {
    return { status: "ok", service: "worker" };
  }

  @Get("health/ready")
  async ready() {
    await this.database.ping();
    if (!this.worker.isReady())
      throw new ServiceUnavailableException("BullMQ worker is not ready");
    return { status: "ready", dependencies: { postgres: "up", redis: "up" } };
  }

  @Get("metrics")
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  metricsText() {
    return this.metrics.registry.metrics();
  }
}
