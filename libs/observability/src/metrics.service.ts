import { Injectable } from "@nestjs/common";
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from "@prometheus-io/client";

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpDuration = new Histogram({
    name: "idempotency_lab_http_request_duration_seconds",
    help: "HTTP request latency in seconds",
    labelNames: ["method", "route", "status_code"] as const,
    registers: [this.registry],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  });

  readonly jobsProcessed = new Counter({
    name: "idempotency_lab_jobs_processed_total",
    help: "BullMQ jobs processed by outcome",
    labelNames: ["outcome"] as const,
    registers: [this.registry],
  });

  readonly outboxPublished = new Counter({
    name: "idempotency_lab_outbox_published_total",
    help: "Outbox messages published to BullMQ",
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({
      register: this.registry,
      prefix: "idempotency_lab_process_",
    });
  }
}
