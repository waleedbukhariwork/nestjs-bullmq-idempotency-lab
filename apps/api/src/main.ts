import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import type { AppEnvironment } from "@lab/config";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<ConfigService<AppEnvironment, true>>(ConfigService);
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({
    origin: config
      .get("CORS_ORIGINS", { infer: true })
      .split(",")
      .map((origin) => origin.trim()),
    credentials: false,
    methods: ["GET", "POST"],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
    }),
  );

  if (config.get("ENABLE_SWAGGER", { infer: true })) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("Reliable credit command API")
        .setDescription(
          "Transactional outbox and idempotent BullMQ processing reference",
        )
        .setVersion("1.0.0")
        .build(),
    );
    SwaggerModule.setup("docs", app, document);
  }

  await app.listen(config.get("PORT", { infer: true }), "0.0.0.0");
}

void bootstrap();
