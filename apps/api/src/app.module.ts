import { randomUUID } from "node:crypto";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { ConfigModule } from "@lab/config";
import { CreditsModule } from "@lab/credits";
import { DatabaseModule } from "@lab/database";
import {
  HttpMetricsInterceptor,
  ObservabilityModule,
} from "@lab/observability";
import { CreditsController } from "./credits/credits.controller";
import { PlatformController } from "./platform/platform.controller";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    ObservabilityModule,
    CreditsModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "res.headers.set-cookie",
          ],
          censor: "[REDACTED]",
        },
        genReqId: (request, response) => {
          const incoming = request.headers["x-request-id"];
          const requestId =
            typeof incoming === "string" ? incoming : randomUUID();
          response.setHeader("x-request-id", requestId);
          return requestId;
        },
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [CreditsController, PlatformController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useExisting: HttpMetricsInterceptor },
  ],
})
export class AppModule {}
