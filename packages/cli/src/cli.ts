import { Command, CommanderError, Option } from "commander";

import { generateCommand } from "./commands/generate";
import { issueCommand } from "./commands/issue";
import { listCommand } from "./commands/list";
import { registerCommand } from "./commands/register";
import { restoreCommand } from "./commands/restore";
import { revokeCommand } from "./commands/revoke";
import { syncCommand } from "./commands/sync";
import { updateCommand } from "./commands/update";

export type RunParameters = {
  argv: string[];
  env: NodeJS.ProcessEnv;
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
};

export async function run(params: RunParameters): Promise<number> {
  const endpointOptions = () => [
    new Option("--endpoint <name>", "Named endpoint from config"),
    new Option("--url <url>", "Direct endpoint URL"),
    new Option("--admin-token <token>", "Admin token (required with --url)"),
    new Option("--auth-path <path>", "Auth path (default: /auth)"),
    new Option("--admin-path <path>", "Admin path (default: /admin)"),
    new Option(
      "--config-dir <path>",
      "Config directory (default: ~/.access-tokens-cli)",
    ),
  ];

  const outputOptions = () => [
    new Option("--verbose", "Verbose output"),
    new Option("--quiet", "Minimal output"),
  ];

  const jsonOption = () => new Option("--json", "Output as JSON");

  let exitCode = 0;

  // Configure output streams for testing
  function configureCommandOutput(cmd: Command): void {
    cmd.configureOutput({
      writeOut: (str) => params.stdout.write(str),
      writeErr: (str) => params.stderr.write(str),
      outputError: (str, write) => write(str),
    });
  }

  // Configure exitOverride to prevent process.exit calls during tests
  function configureExitOverride(cmd: Command): void {
    cmd.exitOverride((err) => {
      exitCode = err.exitCode ?? 1;
      throw err;
    });
  }

  function addOptions(command: Command, options: Option[]): Command {
    options.forEach((opt) => command.addOption(opt));
    configureCommandOutput(command);
    configureExitOverride(command);
    return command;
  }

  const program = new Command();

  program
    .name("access-tokens-cli")
    .description("CLI for managing personal access tokens");

  addOptions(
    program
      .command("generate")
      .description("Generate a new token locally (without storing in database)")
      .option("--token-prefix <prefix>", "Token prefix (default: pat_)")
      .option("--token-id <id>", "Pre-generate with specific token ID"),
    [...outputOptions(), jsonOption()],
  ).action(async (options: Parameters<typeof generateCommand>[0]) => {
    await generateCommand(options);
  });

  addOptions(
    program
      .command("list")
      .description("List tokens")
      .option("--include-revoked", "Include revoked tokens")
      .option("--include-expired", "Include expired tokens")
      .option("--include-secret-phc", "Include secret PHC hashes"),
    [...endpointOptions(), ...outputOptions(), jsonOption()],
  ).action(async (options: Parameters<typeof listCommand>[0]) => {
    await listCommand(options);
  });

  addOptions(
    program
      .command("issue")
      .description("Issue a new token")
      .requiredOption("--owner <email>", "Token owner (usually email)")
      .option("--admin", "Make token an admin token")
      .option(
        "--expires-at <date>",
        "Expiration date (ISO 8601 or Unix timestamp)",
      ),
    [...endpointOptions(), ...outputOptions(), jsonOption()],
  ).action(async (options: Parameters<typeof issueCommand>[0]) => {
    await issueCommand(options);
  });

  addOptions(
    program
      .command("register")
      .description("Register a token with pre-generated ID and secret hash")
      .requiredOption("--token-id <id>", "Token ID")
      .requiredOption("--secret-phc <phc>", "Secret PHC hash")
      .requiredOption("--owner <email>", "Token owner (usually email)")
      .option("--admin", "Make token an admin token")
      .option(
        "--expires-at <date>",
        "Expiration date (ISO 8601 or Unix timestamp)",
      ),
    [...endpointOptions(), ...outputOptions(), jsonOption()],
  ).action(async (options: Parameters<typeof registerCommand>[0]) => {
    await registerCommand(options);
  });

  addOptions(
    program
      .command("update")
      .description("Update token properties")
      .requiredOption("--token-id <id>", "Token ID")
      .option("--owner <email>", "Update owner")
      .option(
        "--admin <boolean>",
        "Update admin status (true/false)",
        (val) => val === "true",
      )
      .option("--secret-phc <phc>", "Update secret PHC hash")
      .option(
        "--expires-at <date>",
        "Update expiration (ISO 8601, Unix timestamp, or 'null')",
      ),
    [...endpointOptions(), ...outputOptions()],
  ).action(async (options: Parameters<typeof updateCommand>[0]) => {
    await updateCommand(options);
  });

  addOptions(
    program
      .command("revoke")
      .description("Revoke a token")
      .requiredOption("--token-id <id>", "Token ID")
      .option(
        "--expires-at <date>",
        "Expiration date for revocation (ISO 8601 or Unix timestamp)",
      ),
    [...endpointOptions(), ...outputOptions()],
  ).action(async (options: Parameters<typeof revokeCommand>[0]) => {
    await revokeCommand(options);
  });

  addOptions(
    program
      .command("restore")
      .description("Restore a revoked token")
      .requiredOption("--token-id <id>", "Token ID"),
    [...endpointOptions(), ...outputOptions()],
  ).action(async (options: Parameters<typeof restoreCommand>[0]) => {
    await restoreCommand(options);
  });

  addOptions(
    program
      .command("sync")
      .description("Sync tokens from YAML config to endpoints")
      .requiredOption("--config <path>", "Path to sync config YAML file")
      .option(
        "--endpoint <name>",
        "Target specific endpoint(s) (comma-separated or multiple flags)",
      )
      .option("--url <url>", "Direct endpoint URL (overrides config endpoints)")
      .option("--admin-token <token>", "Admin token (required with --url)")
      .option("--auth-path <path>", "Auth path (default: /auth)")
      .option("--admin-path <path>", "Admin path (default: /admin)")
      .option("--dry-run", "Show what would be done without making changes")
      .option(
        "--config-dir <path>",
        "Config directory (default: ~/.access-tokens-cli)",
      ),
    outputOptions(),
  ).action(async (options: Parameters<typeof syncCommand>[0]) => {
    await syncCommand(options);
  });

  // Configure output and exit override on the main program too
  configureCommandOutput(program);
  configureExitOverride(program);

  try {
    await program.parseAsync(params.argv, { from: "user" });
  } catch (err) {
    if (err instanceof CommanderError) {
      // Commander errors are already handled by exitOverride
      // exitCode is already set
    } else {
      // Handle errors from command actions
      params.stderr.write(
        `Error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      exitCode = 1;
    }
  }

  return exitCode;
}
