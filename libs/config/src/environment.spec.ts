import { validateEnvironment } from "./environment";
import { describe, expect, it } from "@jest/globals";

describe("environment validation", () => {
  it("parses typed values and safe defaults", () => {
    const environment = validateEnvironment({
      DATABASE_URL: "postgres://app:app@localhost:5432/idempotency_lab",
      ENABLE_SWAGGER: "false",
      REDIS_PORT: "6380",
    });

    expect(environment.ENABLE_SWAGGER).toBe(false);
    expect(environment.REDIS_PORT).toBe(6380);
    expect(environment.WORKER_CONCURRENCY).toBe(10);
  });

  it("fails before startup when a required value is invalid", () => {
    expect(() =>
      validateEnvironment({ DATABASE_URL: "not-a-postgres-url" }),
    ).toThrow("Invalid environment configuration");
  });
});
