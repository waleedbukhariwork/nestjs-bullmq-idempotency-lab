import { Worker } from "bullmq";
import { LabDatabase, type LabMode } from "./lab-support";

type CrashConfiguration = {
  databaseUrl: string;
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  prefix: string;
  queueName: string;
  operationKey: string;
  mode: LabMode;
};

async function main(): Promise<void> {
  const raw = process.argv[2];
  if (!raw) throw new Error("Missing crash-worker configuration");
  const config = JSON.parse(raw) as CrashConfiguration;
  const database = new LabDatabase(config.databaseUrl);
  const worker = new Worker(
    config.queueName,
    async (job) => {
      const inserted = await database.recordEffect(
        config.mode,
        config.operationKey,
        "terminated-worker",
      );
      process.stdout.write(
        `${JSON.stringify({
          event: "terminated-worker-effect",
          jobId: job.id,
          attemptsMade: job.attemptsMade,
          mode: config.mode,
          inserted,
        })}\n`,
      );
      process.exit(86);
    },
    {
      prefix: config.prefix,
      connection: {
        host: config.redisHost,
        port: config.redisPort,
        password: config.redisPassword,
        maxRetriesPerRequest: null,
      },
      lockDuration: 1_000,
      stalledInterval: 1_000,
    },
  );
  worker.on("error", (error) =>
    process.stderr.write(`${error.stack ?? error.message}\n`),
  );
  await worker.waitUntilReady();
}

void main();
