import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { validateEnvironment } from "@lab/config";
import { CREDIT_QUEUE } from "@lab/contracts";

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => {
        const environment = validateEnvironment(process.env);
        return {
          prefix: environment.QUEUE_PREFIX,
          connection: {
            host: environment.REDIS_HOST,
            port: environment.REDIS_PORT,
            password: environment.REDIS_PASSWORD,
            maxRetriesPerRequest: null,
            enableReadyCheck: true,
          },
        };
      },
    }),
    BullModule.registerQueue({
      name: CREDIT_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 500 },
        removeOnComplete: { age: 7 * 24 * 60 * 60, count: 10_000 },
        removeOnFail: { age: 30 * 24 * 60 * 60, count: 25_000 },
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
