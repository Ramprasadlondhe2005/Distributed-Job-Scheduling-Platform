import assert from "node:assert/strict";
import test from "node:test";
import { calculateBackoffDelayMs } from "./retry.js";

test("calculateBackoffDelayMs uses a fixed delay for fixed backoff", () => {
  const delay = calculateBackoffDelayMs(
    {
      backoffType: "FIXED",
      retryInitialDelayMs: 1000,
      retryMaxDelayMs: 10000,
    },
    5,
  );

  assert.equal(delay, 1000);
});

test("calculateBackoffDelayMs doubles exponential delays after the second attempt", () => {
  const job = {
    backoffType: "EXPONENTIAL" as const,
    retryInitialDelayMs: 1000,
    retryMaxDelayMs: 10000,
  };

  assert.equal(calculateBackoffDelayMs(job, 2), 1000);
  assert.equal(calculateBackoffDelayMs(job, 3), 2000);
  assert.equal(calculateBackoffDelayMs(job, 4), 4000);
});

test("calculateBackoffDelayMs caps delays at retryMaxDelayMs", () => {
  const delay = calculateBackoffDelayMs(
    {
      backoffType: "EXPONENTIAL",
      retryInitialDelayMs: 5000,
      retryMaxDelayMs: 6000,
    },
    5,
  );

  assert.equal(delay, 6000);
});

test("calculateBackoffDelayMs supports capped linear delays", () => {
  const job = {
    backoffType: "LINEAR" as const,
    retryInitialDelayMs: 2000,
    retryMaxDelayMs: 9000,
  };

  assert.equal(calculateBackoffDelayMs(job, 1), 2000);
  assert.equal(calculateBackoffDelayMs(job, 3), 6000);
  assert.equal(calculateBackoffDelayMs(job, 5), 9000); // 10000 capped to 9000
});
