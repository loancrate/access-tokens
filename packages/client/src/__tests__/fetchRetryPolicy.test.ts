import { fetchRetryPolicy } from "../fetchRetryPolicy";

describe("fetchRetryPolicy", () => {
  it("should configure 3 retries", () => {
    expect(fetchRetryPolicy.retries).toBe(3);
  });

  it("should retry on specific HTTP status codes", () => {
    expect(fetchRetryPolicy.retryOn).toEqual([408, 429, 500, 502, 503, 504]);
  });

  describe("retryDelay", () => {
    const retryDelay = fetchRetryPolicy.retryDelay;

    if (typeof retryDelay !== "function") {
      throw new Error("retryDelay is not defined");
    }

    describe("429 status with Retry-After header", () => {
      it("should use numeric Retry-After header (seconds)", () => {
        const response = new Response(null, {
          status: 429,
          headers: { "Retry-After": "5" },
        });

        const delay = retryDelay(0, null, response);
        expect(delay).toBe(5000); // 5 seconds in milliseconds
      });

      it("should use date-format Retry-After header", () => {
        const futureDate = new Date(Date.now() + 10000); // 10 seconds from now
        const response = new Response(null, {
          status: 429,
          headers: { "Retry-After": futureDate.toUTCString() },
        });

        const delay = retryDelay(0, null, response);
        // Allow generous tolerance for test execution time and parsing overhead
        expect(delay).toBeGreaterThanOrEqual(9000);
        expect(delay).toBeLessThanOrEqual(10500);
      });

      it("should handle past date in Retry-After header (return 0)", () => {
        const pastDate = new Date(Date.now() - 5000); // 5 seconds ago
        const response = new Response(null, {
          status: 429,
          headers: { "Retry-After": pastDate.toUTCString() },
        });

        const delay = retryDelay(0, null, response);
        expect(delay).toBe(0);
      });

      it("should fall back to exponential backoff for invalid Retry-After header", () => {
        const response = new Response(null, {
          status: 429,
          headers: { "Retry-After": "invalid" },
        });

        const delay = retryDelay(0, null, response);
        expect(delay).toBe(1000); // First attempt: 1000 * 2^0 = 1000ms
      });

      it("should fall back to exponential backoff when Retry-After is missing", () => {
        const response = new Response(null, {
          status: 429,
        });

        const delay = retryDelay(0, null, response);
        expect(delay).toBe(1000); // First attempt: 1000 * 2^0 = 1000ms
      });
    });

    describe("exponential backoff", () => {
      it("should use exponential backoff for non-429 errors", () => {
        const response = new Response(null, { status: 500 });

        expect(retryDelay(0, null, response)).toBe(1000); // 1000 * 2^0
        expect(retryDelay(1, null, response)).toBe(2000); // 1000 * 2^1
        expect(retryDelay(2, null, response)).toBe(4000); // 1000 * 2^2
        expect(retryDelay(3, null, response)).toBe(8000); // 1000 * 2^3
      });

      it("should use exponential backoff when response is undefined", () => {
        expect(retryDelay(0, null, null)).toBe(1000);
        expect(retryDelay(1, null, null)).toBe(2000);
        expect(retryDelay(2, null, null)).toBe(4000);
      });

      it("should cap exponential backoff at 30 seconds", () => {
        const response = new Response(null, { status: 500 });

        // 2^5 = 32, so 1000 * 32 = 32000, which should be capped at 30000
        expect(retryDelay(5, null, response)).toBe(30000);
        expect(retryDelay(6, null, response)).toBe(30000);
        expect(retryDelay(10, null, response)).toBe(30000);
      });
    });

    describe("edge cases", () => {
      it("should handle Retry-After header with leading/trailing spaces", () => {
        const response = new Response(null, {
          status: 429,
          headers: { "Retry-After": "  10  " },
        });

        const delay = retryDelay(0, null, response);
        expect(delay).toBe(10000);
      });

      it("should handle Retry-After: 0", () => {
        const response = new Response(null, {
          status: 429,
          headers: { "Retry-After": "0" },
        });

        const delay = retryDelay(0, null, response);
        expect(delay).toBe(0);
      });

      it("should handle negative Retry-After values", () => {
        const response = new Response(null, {
          status: 429,
          headers: { "Retry-After": "-5" },
        });

        const delay = retryDelay(0, null, response);
        // The code treats negative numbers as valid finite numbers
        // and multiplies by 1000 to convert to milliseconds
        expect(delay).toBe(-5000);
      });

      it("should handle decimal Retry-After values", () => {
        const response = new Response(null, {
          status: 429,
          headers: { "Retry-After": "2.5" },
        });

        const delay = retryDelay(0, null, response);
        expect(delay).toBe(2500);
      });
    });
  });
});
