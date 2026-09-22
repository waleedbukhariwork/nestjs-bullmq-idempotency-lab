import { creditJobId, creditJobSchema } from "./credit-job";
import { describe, expect, it } from "vitest";

describe("credit job contract", () => {
  it("builds one stable BullMQ-safe ID for a business operation", () => {
    const first = creditJobId("apply-credit-registration-731");
    const second = creditJobId("apply-credit-registration-731");

    expect(first).toBe(second);
    expect(first).toMatch(/^credit-[a-f0-9]{40}$/);
    expect(first).not.toContain(":");
  });

  it("rejects an unversioned payload", () => {
    expect(() =>
      creditJobSchema.parse({
        commandId: "00000000-0000-4000-8000-000000000001",
        operationKey: "operation-123",
        traceId: "trace-123",
        queuedAt: new Date().toISOString(),
      }),
    ).toThrow();
  });
});
