import { jest } from "@jest/globals";
import type { Stats } from "fs-extra";

const mockStat = jest.fn<(path: string) => Promise<Partial<Stats>>>();

jest.mock("fs-extra", () => ({
  stat: mockStat,
}));

import { checkFilePermissions } from "../permissions";

describe("checkFilePermissions", () => {
  let consoleWarnSpy: jest.Spied<typeof console.warn>;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it("should return early if containsAdminToken is false", async () => {
    await checkFilePermissions("/path/to/file", false);

    expect(mockStat).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("should check file permissions when containsAdminToken is true", async () => {
    mockStat.mockResolvedValue({ mode: 0o644 });

    await checkFilePermissions("/path/to/file", true);

    expect(mockStat).toHaveBeenCalledWith("/path/to/file");
  });

  it("should warn when file is world-readable and contains admin token", async () => {
    // Mode 0o644 (rw-r--r--) - world readable
    mockStat.mockResolvedValue({ mode: 0o644 });

    await checkFilePermissions("/path/to/config", true);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Warning: Config file /path/to/config is world-readable and contains adminToken. " +
        "Consider running: chmod 600 /path/to/config",
    );
  });

  it("should not warn when file is not world-readable (mode 600)", async () => {
    // Mode 0o600 (rw-------) - not world readable
    mockStat.mockResolvedValue({ mode: 0o600 });

    await checkFilePermissions("/path/to/config", true);

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("should not warn when file is not world-readable (mode 640)", async () => {
    // Mode 0o640 (rw-r-----) - not world readable
    mockStat.mockResolvedValue({ mode: 0o640 });

    await checkFilePermissions("/path/to/config", true);

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("should warn for world-readable mode 777", async () => {
    // Mode 0o777 (rwxrwxrwx) - world readable
    mockStat.mockResolvedValue({ mode: 0o777 });

    await checkFilePermissions("/path/to/config", true);

    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it("should warn for world-readable mode 664", async () => {
    // Mode 0o664 (rw-rw-r--) - world readable
    mockStat.mockResolvedValue({ mode: 0o664 });

    await checkFilePermissions("/path/to/config", true);

    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it("should silently ignore errors when stat fails", async () => {
    mockStat.mockRejectedValue(new Error("ENOENT: file not found"));

    // Should not throw
    await expect(
      checkFilePermissions("/nonexistent/file", true),
    ).resolves.toBeUndefined();

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("should handle permission denied errors gracefully", async () => {
    mockStat.mockRejectedValue(new Error("EACCES: permission denied"));

    // Should not throw
    await expect(
      checkFilePermissions("/restricted/file", true),
    ).resolves.toBeUndefined();

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});
