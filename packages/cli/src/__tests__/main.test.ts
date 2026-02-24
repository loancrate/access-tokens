import type { RunParameters } from "../cli";

const { mockRun } = vi.hoisted(() => ({
  mockRun: vi.fn<(args: RunParameters) => Promise<number>>(),
}));

vi.mock("../cli", () => ({ run: mockRun }));

describe("main entry point", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should call run and exit with success code", async () => {
    mockRun.mockResolvedValue(0);

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const processExitSpy = vi
      .spyOn(process, "exit")
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      .mockImplementation(() => undefined as never);

    // Load the main module
    await import("../main");

    // Wait for async operations to complete
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockRun).toHaveBeenCalledWith(
      /* eslint-disable @typescript-eslint/no-unsafe-assignment */
      {
        argv: expect.any(Array),
        env: expect.any(Object),
        stdin: expect.any(Object),
        stdout: expect.any(Object),
        stderr: expect.any(Object),
      },
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    );
    expect(processExitSpy).toHaveBeenCalledWith(0);
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    processExitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("should handle errors and exit with code 1", async () => {
    const mockError = new Error("CLI execution failed");
    mockRun.mockRejectedValue(mockError);

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const processExitSpy = vi
      .spyOn(process, "exit")
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      .mockImplementation(() => undefined as never);

    // Load the main module
    await import("../main");

    // Wait for async operations to complete
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockRun).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith("Fatal error:", mockError);
    expect(processExitSpy).toHaveBeenCalledWith(1);

    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });
});
