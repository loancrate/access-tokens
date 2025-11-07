export function parseDate(input: string): number | null {
  if (input === "null") {
    return null;
  }

  if (/^\d+$/.test(input)) {
    return parseInt(input);
  }

  const timestamp = Date.parse(input);
  if (Number.isNaN(timestamp)) {
    throw new Error(
      `Invalid date format: ${input}. Expected ISO 8601 date or Unix timestamp in seconds`,
    );
  }
  return Math.floor(timestamp / 1000);
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}
