import * as fs from "fs-extra";

export async function checkFilePermissions(
  filePath: string,
  containsAdminToken: boolean,
): Promise<void> {
  if (!containsAdminToken) {
    return;
  }

  try {
    const stats = await fs.stat(filePath);
    const mode = stats.mode & parseInt("777", 8);
    const worldReadable = (mode & parseInt("004", 8)) !== 0;
    if (worldReadable) {
      console.warn(
        `Warning: Config file ${filePath} is world-readable and contains adminToken. ` +
          `Consider running: chmod 600 ${filePath}`,
      );
    }
  } catch {
    // Ignore permission check errors
  }
}
