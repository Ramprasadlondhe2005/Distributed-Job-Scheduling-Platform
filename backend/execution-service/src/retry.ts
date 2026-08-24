export function calculateBackoffDelayMs(
  job: {
    backoffType: "FIXED" | "EXPONENTIAL" | "LINEAR";
    retryInitialDelayMs: number;
    retryMaxDelayMs: number;
  },
  nextAttemptNumber: number,
) {
  const baseDelay = job.retryInitialDelayMs;
  let delay: number;
  if (job.backoffType === "EXPONENTIAL") {
    delay = baseDelay * 2 ** Math.max(nextAttemptNumber - 2, 0);
  } else if (job.backoffType === "LINEAR") {
    delay = baseDelay * nextAttemptNumber;
  } else {
    delay = baseDelay;
  }

  return Math.min(delay, job.retryMaxDelayMs);
}
