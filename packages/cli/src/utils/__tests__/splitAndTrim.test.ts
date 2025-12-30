import { splitAndTrim } from "../splitAndTrim";

describe("splitAndTrim", () => {
  it("should split by comma and trim whitespace", () => {
    expect(splitAndTrim("a, b, c")).toEqual(["a", "b", "c"]);
  });

  it("should filter out empty strings", () => {
    expect(splitAndTrim("a,,b")).toEqual(["a", "b"]);
    expect(splitAndTrim(",a,")).toEqual(["a"]);
  });

  it("should handle single value", () => {
    expect(splitAndTrim("admin")).toEqual(["admin"]);
  });

  it("should return empty array for empty input", () => {
    expect(splitAndTrim("")).toEqual([]);
  });
});
