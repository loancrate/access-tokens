import type { KeySet } from "../../buildSignerVerifier";
import type { AlgorithmType } from "../../generateKeySet";

const { mockGenerateKeySet } = vi.hoisted(() => ({
  mockGenerateKeySet:
    vi.fn<(kid: string, algorithm?: AlgorithmType) => Promise<KeySet>>(),
}));

vi.mock("../../generateKeySet.js", () => ({
  generateKeySet: mockGenerateKeySet,
}));

describe("genkey tool", () => {
  it("should generate and log EdDSA keyset", async () => {
    const mockKeySet: KeySet = {
      active_kid: "1",
      private_keys: [
        {
          kty: "OKP",
          crv: "Ed25519",
          d: "mock-private-key",
          x: "mock-public-key",
          kid: "1",
          alg: "EdDSA",
          use: "sig",
        },
      ],
      public_keys: [
        {
          kty: "OKP",
          crv: "Ed25519",
          x: "mock-public-key",
          kid: "1",
          alg: "EdDSA",
          use: "sig",
        },
      ],
    };

    mockGenerateKeySet.mockResolvedValue(mockKeySet);

    const consoleLogSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    const processExitSpy = vi
      .spyOn(process, "exit")
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      .mockImplementation(() => undefined as never);

    // Import and execute the genkey module
    await import("../genkey");

    // Wait for async operations to complete
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockGenerateKeySet).toHaveBeenCalledWith("1", "EdDSA");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      JSON.stringify(mockKeySet, null, 2),
    );
    expect(processExitSpy).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it("should handle errors and exit with code 1", async () => {
    const mockError = new Error("Key generation failed");
    mockGenerateKeySet.mockClear();
    mockGenerateKeySet.mockRejectedValue(mockError);

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const processExitSpy = vi
      .spyOn(process, "exit")
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      .mockImplementation(() => undefined as never);

    // Reset module cache to force re-evaluation of the genkey module
    vi.resetModules();
    await import("../genkey");

    // Wait for async operations to complete
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockGenerateKeySet).toHaveBeenCalledWith("1", "EdDSA");
    expect(consoleErrorSpy).toHaveBeenCalledWith(mockError);
    expect(processExitSpy).toHaveBeenCalledWith(1);

    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });
});
