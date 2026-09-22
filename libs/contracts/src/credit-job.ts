import { createHash } from "node:crypto";
import { z } from "zod";

export const CREDIT_QUEUE = "credit-commands";
export const APPLY_CREDIT_JOB = "credit.apply.v1";

export const creditJobSchema = z.object({
  version: z.literal(1),
  commandId: z.uuid(),
  operationKey: z.string().min(8).max(128),
  traceId: z.string().min(8).max(128),
  queuedAt: z.iso.datetime(),
});

export type CreditJob = z.infer<typeof creditJobSchema>;

export function creditJobId(operationKey: string): string {
  const digest = createHash("sha256").update(operationKey).digest("hex");
  return `credit-${digest.slice(0, 40)}`;
}
