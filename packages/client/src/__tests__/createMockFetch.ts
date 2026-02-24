import { vi } from "vitest";

import { Fetch } from "../fetchRetryPolicy";

import { MockResponse } from "./MockResponse";

type MockFetchCall = {
  url: string;
  options?: RequestInit;
};

type CreateMockFetchReturn = {
  mockFetch: ReturnType<typeof vi.fn<Fetch>>;
  addResponse: (response: MockResponse) => void;
  getCalls: () => MockFetchCall[];
  reset: () => void;
};

export function createMockFetch(): CreateMockFetchReturn {
  const calls: MockFetchCall[] = [];
  const responses: MockResponse[] = [];
  let currentResponseIndex = 0;

  const mockFetch = vi
    .fn<Fetch>()
    .mockImplementation(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === "string" || input instanceof URL
            ? input.toString()
            : input.url;
        calls.push({ url, options: init });

        if (currentResponseIndex >= responses.length) {
          throw new Error(
            `No mock response configured for call ${currentResponseIndex + 1}`,
          );
        }

        const response = responses[currentResponseIndex++];
        // MockResponse is a test helper that implements Response interface
        // but isn't recognized by TypeScript as compatible. The double cast
        // through 'unknown' is necessary to satisfy jest's mock type system.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        return Promise.resolve(response as unknown as Response);
      },
    );

  const addResponse = (response: MockResponse) => {
    responses.push(response);
  };

  const getCalls = () => calls;

  const reset = () => {
    calls.length = 0;
    responses.length = 0;
    currentResponseIndex = 0;
    mockFetch.mockClear();
  };

  return { mockFetch, addResponse, getCalls, reset };
}
