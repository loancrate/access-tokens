import assert from "assert";

import { DateTime } from "luxon";

import { addDurationToNow } from "../duration-parser";

describe("duration-parser", () => {
  describe("addDurationToNow", () => {
    beforeEach(() => {
      // Mock DateTime.now() to return a fixed timestamp
      // December 1, 2025 00:00:00 UTC = 1733011200 seconds
      const fixedTime = DateTime.fromSeconds(1733011200, { zone: "utc" });
      assert(fixedTime.isValid, "Fixed time should be valid");
      vi.spyOn(DateTime, "now").mockReturnValue(fixedTime);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should parse days duration (P30D)", () => {
      const result = addDurationToNow("P30D");
      // 30 days = 30 * 24 * 60 * 60 = 2592000 seconds
      expect(result).toBe(1733011200 + 2592000);
    });

    it("should parse hours duration (PT1H)", () => {
      const result = addDurationToNow("PT1H");
      // 1 hour = 3600 seconds
      expect(result).toBe(1733011200 + 3600);
    });

    it("should parse months duration (P1M)", () => {
      const result = addDurationToNow("P1M");
      // 1 month from December 1, 2025 = January 1, 2026 00:00:00 UTC = 1735689600 seconds
      expect(result).toBe(1735689600);
    });

    it("should parse years duration (P1Y)", () => {
      const result = addDurationToNow("P1Y");
      // 1 year from December 1, 2025 = December 1, 2026 00:00:00 UTC = 1764547200 seconds
      expect(result).toBe(1764547200);
    });

    it("should parse combined duration (P1DT12H)", () => {
      const result = addDurationToNow("P1DT12H");
      // 1 day + 12 hours = 36 hours = 129600 seconds
      expect(result).toBe(1733011200 + 129600);
    });

    it("should parse weeks duration (P1W)", () => {
      const result = addDurationToNow("P1W");
      // 1 week = 7 days = 604800 seconds
      expect(result).toBe(1733011200 + 604800);
    });

    it("should parse minutes duration (PT30M)", () => {
      const result = addDurationToNow("PT30M");
      // 30 minutes = 1800 seconds
      expect(result).toBe(1733011200 + 1800);
    });

    it("should parse seconds duration (PT90S)", () => {
      const result = addDurationToNow("PT90S");
      // 90 seconds
      expect(result).toBe(1733011200 + 90);
    });

    it("should throw error for invalid duration format", () => {
      expect(() => addDurationToNow("invalid")).toThrow(
        "Invalid ISO 8601 duration: invalid",
      );
    });

    it("should throw error for empty string", () => {
      expect(() => addDurationToNow("")).toThrow("Invalid ISO 8601 duration: ");
    });

    it("should throw error for malformed duration", () => {
      expect(() => addDurationToNow("PXD")).toThrow(
        "Invalid ISO 8601 duration: PXD",
      );
    });
  });
});
