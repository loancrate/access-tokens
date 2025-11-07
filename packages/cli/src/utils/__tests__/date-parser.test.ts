import { formatDate, parseDate } from "../date-parser";

describe("parseDate", () => {
  it("should parse ISO 8601 date string", () => {
    const result = parseDate("2024-01-15T10:30:00.000Z");
    expect(result).toBe(
      Math.floor(new Date("2024-01-15T10:30:00.000Z").getTime() / 1000),
    );
  });

  it("should parse ISO date without milliseconds", () => {
    const result = parseDate("2024-01-15T10:30:00Z");
    expect(result).toBe(
      Math.floor(new Date("2024-01-15T10:30:00Z").getTime() / 1000),
    );
  });

  it("should parse date-only string", () => {
    const result = parseDate("2024-01-15");
    expect(result).toBe(Math.floor(new Date("2024-01-15").getTime() / 1000));
  });

  it("should return null for 'null' string", () => {
    const result = parseDate("null");
    expect(result).toBeNull();
  });

  it("should throw error for invalid date format", () => {
    expect(() => parseDate("not-a-date")).toThrow(
      "Invalid date format: not-a-date",
    );
  });

  it("should throw error for empty string", () => {
    expect(() => parseDate("")).toThrow("Invalid date format: ");
  });

  it("should throw error for invalid month", () => {
    expect(() => parseDate("2024-13-01")).toThrow(
      "Invalid date format: 2024-13-01",
    );
  });

  it("should parse Unix timestamp in seconds as string", () => {
    const result = parseDate("1704067200");
    expect(result).toBe(1704067200);
  });
});

describe("formatDate", () => {
  it("should format Unix timestamp to ISO string", () => {
    const timestamp = Math.floor(
      new Date("2024-01-15T10:30:00.000Z").getTime() / 1000,
    );
    const result = formatDate(timestamp);
    expect(result).toBe("2024-01-15T10:30:00.000Z");
  });

  it("should format timestamp with milliseconds", () => {
    const timestamp = Math.floor(
      new Date("2024-01-15T10:30:00.123Z").getTime() / 1000,
    );
    const result = formatDate(timestamp);
    expect(result).toBe("2024-01-15T10:30:00.000Z");
  });

  it("should format epoch timestamp", () => {
    const result = formatDate(0);
    expect(result).toBe("1970-01-01T00:00:00.000Z");
  });

  it("should handle negative timestamps", () => {
    const timestamp = Math.floor(
      new Date("1969-12-31T23:59:59.000Z").getTime() / 1000,
    );
    const result = formatDate(timestamp);
    expect(result).toBe("1969-12-31T23:59:59.000Z");
  });
});
