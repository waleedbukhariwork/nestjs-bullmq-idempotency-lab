import { Controller, Get, Header } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { DatabaseService } from "@lab/database";
import { MetricsService } from "@lab/observability";

@ApiExcludeController()
@Controller()
export class PlatformController {
  constructor(
    private readonly database: DatabaseService,
    private readonly metrics: MetricsService,
  ) {}

  @Get("health/live")
  live() {
    return { status: "ok", service: "api" };
  }

  @Get("health/ready")
  async ready() {
    await this.database.ping();
    return { status: "ready", dependencies: { postgres: "up" } };
  }

  @Get("metrics")
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  metricsText() {
    return this.metrics.registry.metrics();
  }
}
