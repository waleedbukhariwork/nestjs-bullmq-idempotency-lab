import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { Queue, QueueEvents, Worker } from "bullmq";
import { validateEnvironment } from "@lab/config";
import { LabDatabase, type LabMode } from "./lab-support";

type LabResult = Record<string, string | number>;

const environment = validateEnvironment(process.env);
const prefix = `${environment.QUEUE_PREFIX}-controlled-lab`;
const connection = {
  host: environment.REDIS_HOST,
  port: environment.REDIS_PORT,
  password: environment.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};
const database = new LabDatabase(environment.DATABASE_URL);

function emit(event: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields })}\n`,
  );
}

async function closeAll(
  ...resources: Array<{ close(): Promise<void> } | undefined>
): Promise<void> {
  await Promise.all(
    resources
      .filter((resource) => resource !== undefined)
      .map((resource) => resource.close()),
  );
}

async function runRetry(mode: LabMode): Promise<LabResult> {
  const queueName = `exception-${mode}-${Date.now()}`;
  const operationKey = `exception-${mode}`;
  const queue = new Queue(queueName, { connection, prefix });
  const events = new QueueEvents(queueName, { connection, prefix });
  await events.waitUntilReady();
  let executions = 0;
  const worker = new Worker(
    queueName,
    async (job) => {
      executions += 1;
      const inserted = await database.recordEffect(
        mode,
        operationKey,
        `exception-attempt-${executions}`,
      );
      emit("exception-worker-run", {
        mode,
        jobId: job.id,
        attemptsMade: job.attemptsMade,
        execution: executions,
        sideEffectInserted: inserted,
      });
      if (job.attemptsMade === 0)
        throw new Error("controlled failure after committed effect");
      return { operationKey };
    },
    { connection, prefix },
  );

  const job = await queue.add(
    "apply-credit",
    { operationKey },
    { attempts: 2, backoff: { type: "fixed", delay: 100 } },
  );
  await job.waitUntilFinished(events, 15_000);
  const result = {
    scenario: "exception-after-effect",
    protection: mode,
    jobExecutions: executions,
    sideEffects: await database.countEffects(mode, operationKey),
    finalState: await job.getState(),
  };
  await closeAll(worker, events, queue);
  return result;
}

async function startCrashWorker(
  config: Record<string, unknown>,
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    let observedEffect = false;
    let buffer = "";
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve(process.cwd(), "tools/lab-crash-child.ts"),
        JSON.stringify(config),
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        const entry = JSON.parse(line) as { event?: string };
        process.stdout.write(`${line}\n`);
        if (entry.event === "terminated-worker-effect") observedEffect = true;
      }
    });
    child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 86 && observedEffect) resolvePromise();
      else
        reject(
          new Error(
            `Crash worker exited with code ${code}; effect observed: ${observedEffect}`,
          ),
        );
    });
  });
}

async function runTermination(mode: LabMode): Promise<LabResult> {
  const queueName = `termination-${mode}-${Date.now()}`;
  const operationKey = `termination-${mode}`;
  const queue = new Queue(queueName, { connection, prefix });
  const events = new QueueEvents(queueName, { connection, prefix });
  await events.waitUntilReady();
  let stalledEvents = 0;
  events.on("stalled", ({ jobId }) => {
    stalledEvents += 1;
    emit("job-stalled", { mode, jobId });
  });
  const job = await queue.add("apply-credit", { operationKey });

  await startCrashWorker({
    databaseUrl: environment.DATABASE_URL,
    redisHost: environment.REDIS_HOST,
    redisPort: environment.REDIS_PORT,
    redisPassword: environment.REDIS_PASSWORD,
    prefix,
    queueName,
    operationKey,
    mode,
  });

  let recoveryExecutions = 0;
  const recovery = new Worker(
    queueName,
    async (recoveredJob) => {
      recoveryExecutions += 1;
      const inserted = await database.recordEffect(
        mode,
        operationKey,
        "recovery-worker",
      );
      emit("recovery-worker-run", {
        mode,
        jobId: recoveredJob.id,
        attemptsMade: recoveredJob.attemptsMade,
        sideEffectInserted: inserted,
      });
    },
    { connection, prefix, lockDuration: 1_000, stalledInterval: 1_000 },
  );
  await job.waitUntilFinished(events, 20_000);
  const result = {
    scenario: "worker-termination-after-effect",
    protection: mode,
    jobExecutions: 1 + recoveryExecutions,
    stalledEvents,
    sideEffects: await database.countEffects(mode, operationKey),
    finalState: await job.getState(),
  };
  await closeAll(recovery, events, queue);
  return result;
}

async function runDuplicateProducer(
  protection: "none" | "job-id" | "ledger",
): Promise<LabResult> {
  const queueName = `producer-${protection}-${Date.now()}`;
  const operationKey = `producer-${protection}`;
  const mode: LabMode = protection === "ledger" ? "safe" : "unsafe";
  const queue = new Queue(queueName, { connection, prefix });
  const events = new QueueEvents(queueName, { connection, prefix });
  await events.waitUntilReady();
  let executions = 0;
  const worker = new Worker(
    queueName,
    async (job) => {
      executions += 1;
      await database.recordEffect(mode, operationKey, `producer-job-${job.id}`);
    },
    { connection, prefix },
  );
  const options =
    protection === "job-id" ? { jobId: `operation-${operationKey}` } : {};
  const [first, second] = await Promise.all([
    queue.add("send-notification", { operationKey }, options),
    queue.add("send-notification", { operationKey }, options),
  ]);
  await Promise.all([
    first.waitUntilFinished(events, 15_000),
    second.id === first.id
      ? Promise.resolve()
      : second.waitUntilFinished(events, 15_000),
  ]);
  const result = {
    scenario: "duplicate-producer-request",
    protection,
    distinctJobIds: new Set([first.id, second.id]).size,
    jobExecutions: executions,
    sideEffects: await database.countEffects(mode, operationKey),
  };
  await closeAll(worker, events, queue);
  return result;
}

function assertResults(results: LabResult[]): void {
  const expected = [
    [2, 2],
    [2, 1],
    [2, 2],
    [2, 1],
    [2, 2],
    [1, 1],
    [2, 1],
  ];
  results.forEach((result, index) => {
    const [executions, effects] = expected[index] ?? [];
    if (result.jobExecutions !== executions || result.sideEffects !== effects) {
      throw new Error(
        `Unexpected result at index ${index}: ${JSON.stringify(result)}`,
      );
    }
  });
}

async function main(): Promise<void> {
  await database.setup();
  try {
    const results = [
      await runRetry("unsafe"),
      await runRetry("safe"),
      await runTermination("unsafe"),
      await runTermination("safe"),
      await runDuplicateProducer("none"),
      await runDuplicateProducer("job-id"),
      await runDuplicateProducer("ledger"),
    ];
    assertResults(results);
    process.stdout.write(`RESULTS ${JSON.stringify(results, null, 2)}\n`);
  } finally {
    await database.close();
  }
}

void main();
