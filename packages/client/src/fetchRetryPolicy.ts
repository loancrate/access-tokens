import type { RequestInitRetryParams } from "fetch-retry";

export type Fetch = typeof global.fetch;

export const fetchRetryPolicy: RequestInitRetryParams<Fetch> = {
  retries: 3,
  retryOn: [408, 429, 500, 502, 503, 504],
  retryDelay: (attempt, _error, response) => {
    if (response && response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      if (retryAfter) {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds)) {
          return seconds * 1000;
        }
        const time = Date.parse(retryAfter);
        if (Number.isFinite(time)) {
          return Math.max(0, time - Date.now());
        }
      }
    }
    return Math.min(1000 * Math.pow(2, attempt), 30e3);
  },
};
