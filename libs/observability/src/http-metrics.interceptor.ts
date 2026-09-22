import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import type { Observable } from "rxjs";
import { finalize } from "rxjs";
import { MetricsService } from "./metrics.service";

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = process.hrtime.bigint();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      finalize(() => {
        const seconds =
          Number(process.hrtime.bigint() - started) / 1_000_000_000;
        const routeValue = (request.route as { path?: unknown } | undefined)
          ?.path;
        const route = typeof routeValue === "string" ? routeValue : "unmatched";
        this.metrics.httpDuration.observe(
          {
            method: request.method,
            route,
            status_code: String(response.statusCode),
          },
          seconds,
        );
      }),
    );
  }
}
