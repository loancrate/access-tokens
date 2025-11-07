export class MockResponse {
  public readonly ok: boolean;
  public readonly status: number;
  public readonly statusText: string;
  public readonly headers: Map<string, string>;
  public readonly body: ReadableStream | null;
  private readonly jsonData: unknown;

  constructor(
    init: {
      ok?: boolean;
      status?: number;
      statusText?: string;
      headers?: Record<string, string>;
      body?: ReadableStream | null;
      json?: unknown;
    } = {},
  ) {
    this.ok = init.ok ?? true;
    this.status = init.status ?? 200;
    this.statusText = init.statusText ?? "OK";
    this.headers = new Map(Object.entries(init.headers || {}));
    this.body = init.body || null;
    this.jsonData = init.json || {};
  }

  async json(): Promise<unknown> {
    return Promise.resolve(this.jsonData);
  }
}
