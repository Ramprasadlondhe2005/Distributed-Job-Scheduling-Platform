import axios from "axios";

export function getAxiosErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown worker execution error";
}

export function getAttemptStatus(error: unknown) {
  if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
    return "TIMED_OUT" as const;
  }

  return "FAILED" as const;
}

export function calculateBackoffDelayMs(
  job: {
    backoffType: "FIXED" | "EXPONENTIAL" | "LINEAR";
    retryInitialDelayMs: number;
    retryMaxDelayMs: number;
  },
  nextAttemptNumber: number,
) {
  let delay: number;
  if (job.backoffType === "EXPONENTIAL") {
    delay = job.retryInitialDelayMs * 2 ** Math.max(nextAttemptNumber - 2, 0);
  } else if (job.backoffType === "LINEAR") {
    delay = job.retryInitialDelayMs * nextAttemptNumber;
  } else {
    delay = job.retryInitialDelayMs;
  }

  return Math.min(delay, job.retryMaxDelayMs);
}
