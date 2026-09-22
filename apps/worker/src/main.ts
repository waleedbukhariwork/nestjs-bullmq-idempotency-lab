import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import type { AppEnvironment } from "@lab/config";
import { WorkerModule } from "./worker.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(WorkerModule, { bufferLogs: true });
  const config = app.get<ConfigService<AppEnvironment, true>>(ConfigService);
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await app.listen(config.get("WORKER_PORT", { infer: true }), "0.0.0.0");
}

void bootstrap();
