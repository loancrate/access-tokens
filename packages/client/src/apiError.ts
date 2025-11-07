import * as z from "zod";

const apiErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
    details: z
      .union([z.string(), z.record(z.string(), z.unknown())])
      .optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export function isApiError(obj: unknown): obj is ApiError {
  const parsed = apiErrorSchema.safeParse(obj);
  return parsed.success;
}

async function extractApiError(
  response: Response,
): Promise<ApiError | undefined> {
  if (
    !response.ok &&
    response.headers.get("content-type") === "application/json"
  ) {
    const json = await response.json();
    const parsed = apiErrorSchema.safeParse(json);
    if (parsed.success) {
      return parsed.data;
    }
  }
  return undefined;
}

export async function createApiResponseError(
  response: Response,
  message: string,
): Promise<Error> {
  let cause;
  try {
    cause = await extractApiError(response);
  } catch {
    // Ignore errors parsing the error response
  }
  if (!cause) {
    cause = response.statusText;
  }
  return new Error(message, { cause });
}
