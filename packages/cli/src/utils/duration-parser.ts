import { DateTime, Duration } from "luxon";

/**
 * Parses an ISO 8601 duration string and adds it to the current time
 * @param isoDuration ISO 8601 duration string (e.g., "P30D", "PT1H", "P1M")
 * @returns Unix timestamp in seconds
 * @throws Error if the duration format is invalid
 */
export function addDurationToNow(isoDuration: string): number {
  const duration = Duration.fromISO(isoDuration);
  if (!duration.isValid) {
    throw new Error(
      `Invalid ISO 8601 duration: ${isoDuration}. Expected format like P30D, PT1H, P1M`,
    );
  }
  return DateTime.now().plus(duration).toUnixInteger();
}
