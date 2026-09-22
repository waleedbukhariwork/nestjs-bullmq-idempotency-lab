export type CreditCommandStatus = "pending" | "completed" | "failed";

export type CreditCommand = {
  id: string;
  operationKey: string;
  accountId: string;
  amountCents: number;
  reason: string;
  requestHash: string;
  status: CreditCommandStatus;
  result: Record<string, unknown> | null;
  createdAt: Date;
  completedAt: Date | null;
};

export type CreateCreditCommandInput = {
  operationKey: string;
  accountId: string;
  amountCents: number;
  reason: string;
  traceId: string;
};

export type CreateCreditCommandResult = {
  commandId: string;
  operationKey: string;
  status: CreditCommandStatus;
  duplicate: boolean;
};
