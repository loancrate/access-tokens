import { jest } from "@jest/globals";

import { run } from "../cli";
import * as generateModule from "../commands/generate";
import * as issueModule from "../commands/issue";
import * as listModule from "../commands/list";
import * as registerModule from "../commands/register";
import * as restoreModule from "../commands/restore";
import * as revokeModule from "../commands/revoke";
import * as syncModule from "../commands/sync";
import * as updateModule from "../commands/update";

import { createTestStreams } from "./test-utils";

jest.mock("../utils/logger");

describe("CLI", () => {
  beforeAll(() => {
    // Ensure consistent terminal behavior for help output snapshots.
    // This causes helpWidth to default to 80 columns.
    process.stdout.isTTY = false;
  });

  describe("command parsing", () => {
    it("should show help output", async () => {
      const streams = createTestStreams();

      const exitCode = await run({
        argv: ["--help"],
        env: process.env,
        ...streams,
      });

      expect(exitCode).toBe(0);
      const output = streams.getStdout();
      expect(output).toMatchInlineSnapshot(`
        "Usage: access-tokens-cli [options] [command]

        CLI for managing personal access tokens

        Options:
          -h, --help          display help for command

        Commands:
          generate [options]  Generate a new token locally (without storing in database)
          list [options]      List tokens
          issue [options]     Issue a new token
          register [options]  Register a token with pre-generated ID and secret hash
          update [options]    Update token properties
          revoke [options]    Revoke a token
          restore [options]   Restore a revoked token
          sync [options]      Sync tokens from YAML config to endpoints
          help [command]      display help for command
        "
      `);
    });

    it("should return exit code 1 for unknown command", async () => {
      const streams = createTestStreams();

      const exitCode = await run({
        argv: ["unknown-command"],
        env: process.env,
        ...streams,
      });

      expect(exitCode).toBe(1);
      const error = streams.getStderr();
      expect(error).toMatchInlineSnapshot(`
        "error: unknown command 'unknown-command'
        "
      `);
    });

    it("should fail for missing required option", async () => {
      const streams = createTestStreams();

      const exitCode = await run({
        argv: ["issue"],
        env: process.env,
        ...streams,
      });

      expect(exitCode).toBe(1);
      const error = streams.getStderr();
      expect(error).toMatchInlineSnapshot(`
        "error: required option '--owner <email>' not specified
        "
      `);
    });
  });

  describe("command help", () => {
    it("should show list command help", async () => {
      const streams = createTestStreams();

      const exitCode = await run({
        argv: ["list", "--help"],
        env: process.env,
        ...streams,
      });

      expect(exitCode).toBe(0);
      const output = streams.getStdout();
      expect(output).toMatchInlineSnapshot(`
       "Usage: access-tokens-cli list [options]

       List tokens

       Options:
         --include-revoked      Include revoked tokens
         --include-expired      Include expired tokens
         --include-secret-phc   Include secret PHC hashes
         --has-role <role>      Filter tokens that have this role
         --endpoint <name>      Named endpoint from config
         --url <url>            Direct endpoint URL
         --admin-token <token>  Admin token (required with --url)
         --auth-path <path>     Auth path (default: /auth)
         --admin-path <path>    Admin path (default: /admin)
         --config-dir <path>    Config directory (default: ~/.access-tokens-cli)
         --verbose              Verbose output
         --quiet                Minimal output
         --json                 Output as JSON
         -h, --help             display help for command
       "
      `);
    });

    it("should show issue command help", async () => {
      const streams = createTestStreams();

      const exitCode = await run({
        argv: ["issue", "--help"],
        env: process.env,
        ...streams,
      });

      expect(exitCode).toBe(0);
      const output = streams.getStdout();
      expect(output).toMatchInlineSnapshot(`
       "Usage: access-tokens-cli issue [options]

       Issue a new token

       Options:
         --owner <email>        Token owner (usually email)
         --admin                Make token an admin token
         --roles <roles>        Comma-separated list of roles
         --expires-at <date>    Expiration date (ISO 8601 or Unix timestamp)
         --endpoint <name>      Named endpoint from config
         --url <url>            Direct endpoint URL
         --admin-token <token>  Admin token (required with --url)
         --auth-path <path>     Auth path (default: /auth)
         --admin-path <path>    Admin path (default: /admin)
         --config-dir <path>    Config directory (default: ~/.access-tokens-cli)
         --verbose              Verbose output
         --quiet                Minimal output
         --json                 Output as JSON
         -h, --help             display help for command
       "
      `);
    });

    it("should show register command help", async () => {
      const streams = createTestStreams();

      const exitCode = await run({
        argv: ["register", "--help"],
        env: process.env,
        ...streams,
      });

      expect(exitCode).toBe(0);
      const output = streams.getStdout();
      expect(output).toMatchInlineSnapshot(`
        "Usage: access-tokens-cli register [options]

        Register a token with pre-generated ID and secret hash

        Options:
          --token-id <id>        Token ID
          --secret-phc <phc>     Secret PHC hash
          --owner <email>        Token owner (usually email)
          --admin                Make token an admin token
          --expires-at <date>    Expiration date (ISO 8601 or Unix timestamp)
          --endpoint <name>      Named endpoint from config
          --url <url>            Direct endpoint URL
          --admin-token <token>  Admin token (required with --url)
          --auth-path <path>     Auth path (default: /auth)
          --admin-path <path>    Admin path (default: /admin)
          --config-dir <path>    Config directory (default: ~/.access-tokens-cli)
          --verbose              Verbose output
          --quiet                Minimal output
          --json                 Output as JSON
          -h, --help             display help for command
        "
      `);
    });

    it("should show update command help", async () => {
      const streams = createTestStreams();

      const exitCode = await run({
        argv: ["update", "--help"],
        env: process.env,
        ...streams,
      });

      expect(exitCode).toBe(0);
      const output = streams.getStdout();
      expect(output).toMatchInlineSnapshot(`
       "Usage: access-tokens-cli update [options]

       Update token properties

       Options:
         --token-id <id>         Token ID
         --owner <email>         Update owner
         --admin <boolean>       Update admin status (true/false)
         --secret-phc <phc>      Update secret PHC hash
         --roles <roles>         Replace all roles (comma-separated)
         --add-roles <roles>     Add roles (comma-separated)
         --remove-roles <roles>  Remove roles (comma-separated)
         --expires-at <date>     Update expiration (ISO 8601, Unix timestamp, or
                                 'null')
         --endpoint <name>       Named endpoint from config
         --url <url>             Direct endpoint URL
         --admin-token <token>   Admin token (required with --url)
         --auth-path <path>      Auth path (default: /auth)
         --admin-path <path>     Admin path (default: /admin)
         --config-dir <path>     Config directory (default: ~/.access-tokens-cli)
         --verbose               Verbose output
         --quiet                 Minimal output
         -h, --help              display help for command
       "
      `);
    });

    it("should show revoke command help", async () => {
      const streams = createTestStreams();

      const exitCode = await run({
        argv: ["revoke", "--help"],
        env: process.env,
        ...streams,
      });

      expect(exitCode).toBe(0);
      const output = streams.getStdout();
      expect(output).toMatchInlineSnapshot(`
        "Usage: access-tokens-cli revoke [options]

        Revoke a token

        Options:
          --token-id <id>        Token ID
          --expires-at <date>    Expiration date for revocation (ISO 8601 or Unix
                                 timestamp)
          --endpoint <name>      Named endpoint from config
          --url <url>            Direct endpoint URL
          --admin-token <token>  Admin token (required with --url)
          --auth-path <path>     Auth path (default: /auth)
          --admin-path <path>    Admin path (default: /admin)
          --config-dir <path>    Config directory (default: ~/.access-tokens-cli)
          --verbose              Verbose output
          --quiet                Minimal output
          -h, --help             display help for command
        "
      `);
    });

    it("should show restore command help", async () => {
      const streams = createTestStreams();

      const exitCode = await run({
        argv: ["restore", "--help"],
        env: process.env,
        ...streams,
      });

      expect(exitCode).toBe(0);
      const output = streams.getStdout();
      expect(output).toMatchInlineSnapshot(`
        "Usage: access-tokens-cli restore [options]

        Restore a revoked token

        Options:
          --token-id <id>        Token ID
          --endpoint <name>      Named endpoint from config
          --url <url>            Direct endpoint URL
          --admin-token <token>  Admin token (required with --url)
          --auth-path <path>     Auth path (default: /auth)
          --admin-path <path>    Admin path (default: /admin)
          --config-dir <path>    Config directory (default: ~/.access-tokens-cli)
          --verbose              Verbose output
          --quiet                Minimal output
          -h, --help             display help for command
        "
      `);
    });

    it("should show sync command help", async () => {
      const streams = createTestStreams();

      const exitCode = await run({
        argv: ["sync", "--help"],
        env: process.env,
        ...streams,
      });

      expect(exitCode).toBe(0);
      const output = streams.getStdout();
      expect(output).toMatchInlineSnapshot(`
        "Usage: access-tokens-cli sync [options]

        Sync tokens from YAML config to endpoints

        Options:
          --config <path>        Path to sync config YAML file
          --endpoint <name>      Target specific endpoint(s) (comma-separated or
                                 multiple flags)
          --url <url>            Direct endpoint URL (overrides config endpoints)
          --admin-token <token>  Admin token (required with --url)
          --auth-path <path>     Auth path (default: /auth)
          --admin-path <path>    Admin path (default: /admin)
          --dry-run              Show what would be done without making changes
          --config-dir <path>    Config directory (default: ~/.access-tokens-cli)
          --verbose              Verbose output
          --quiet                Minimal output
          -h, --help             display help for command
        "
      `);
    });
  });

  describe("error handling and exit codes", () => {
    it("should return exit code 0 for successful command", async () => {
      const streams = createTestStreams();

      const generateSpy = jest
        .spyOn(generateModule, "generateCommand")
        .mockResolvedValue(undefined);

      const exitCode = await run({
        argv: ["generate"],
        env: process.env,
        ...streams,
      });

      expect(exitCode).toBe(0);
      expect(generateSpy).toHaveBeenCalled();

      generateSpy.mockRestore();
    });

    it("should return exit code 1 and write error to stderr for command errors", async () => {
      const streams = createTestStreams();
      const mockError = new Error("Something went wrong in command");

      const generateSpy = jest
        .spyOn(generateModule, "generateCommand")
        .mockRejectedValue(mockError);

      const exitCode = await run({
        argv: ["generate"],
        env: process.env,
        ...streams,
      });

      expect(exitCode).toBe(1);
      expect(generateSpy).toHaveBeenCalled();
      expect(streams.getStderr()).toBe(
        "Error: Something went wrong in command\n",
      );
      expect(streams.getStdout()).toBe("");

      generateSpy.mockRestore();
    });

    it("should handle non-Error thrown values", async () => {
      const streams = createTestStreams();

      const generateSpy = jest
        .spyOn(generateModule, "generateCommand")
        .mockRejectedValue("string error");

      const exitCode = await run({
        argv: ["generate"],
        env: process.env,
        ...streams,
      });

      expect(exitCode).toBe(1);
      expect(streams.getStderr()).toBe("Error: string error\n");

      generateSpy.mockRestore();
    });

    it("should return exit code 1 for CommanderError without duplicate output", async () => {
      const streams = createTestStreams();

      const exitCode = await run({
        argv: ["issue"], // missing required --owner
        env: process.env,
        ...streams,
      });

      expect(exitCode).toBe(1);
      // CommanderError should only output once (by Commander), not duplicated by our error handler
      expect(streams.getStderr()).toMatchInlineSnapshot(`
        "error: required option '--owner <email>' not specified
        "
      `);
    });

    it("should return exit code 1 for invalid options", async () => {
      const streams = createTestStreams();

      const exitCode = await run({
        argv: ["generate", "--invalid-option"],
        env: process.env,
        ...streams,
      });

      expect(exitCode).toBe(1);
      expect(streams.getStderr()).toContain("error: unknown option");
    });
  });

  describe("command action coverage", () => {
    it("should call list command action", async () => {
      const streams = createTestStreams();
      const listSpy = jest
        .spyOn(listModule, "listCommand")
        .mockResolvedValue(undefined);

      await run({
        argv: ["list", "--url", "http://localhost", "--admin-token", "token"],
        env: process.env,
        ...streams,
      });

      expect(listSpy).toHaveBeenCalled();
      listSpy.mockRestore();
    });

    it("should call issue command action", async () => {
      const streams = createTestStreams();
      const issueSpy = jest
        .spyOn(issueModule, "issueCommand")
        .mockResolvedValue(undefined);

      await run({
        argv: [
          "issue",
          "--owner",
          "test@example.com",
          "--url",
          "http://localhost",
          "--admin-token",
          "token",
        ],
        env: process.env,
        ...streams,
      });

      expect(issueSpy).toHaveBeenCalled();
      issueSpy.mockRestore();
    });

    it("should call register command action", async () => {
      const streams = createTestStreams();
      const registerSpy = jest
        .spyOn(registerModule, "registerCommand")
        .mockResolvedValue(undefined);

      await run({
        argv: [
          "register",
          "--token-id",
          "test-id",
          "--secret-phc",
          "test-phc",
          "--owner",
          "test@example.com",
          "--url",
          "http://localhost",
          "--admin-token",
          "token",
        ],
        env: process.env,
        ...streams,
      });

      expect(registerSpy).toHaveBeenCalled();
      registerSpy.mockRestore();
    });

    it("should call update command action", async () => {
      const streams = createTestStreams();
      const updateSpy = jest
        .spyOn(updateModule, "updateCommand")
        .mockResolvedValue(undefined);

      await run({
        argv: [
          "update",
          "--token-id",
          "test-id",
          "--admin",
          "true",
          "--url",
          "http://localhost",
          "--admin-token",
          "token",
        ],
        env: process.env,
        ...streams,
      });

      expect(updateSpy).toHaveBeenCalled();
      updateSpy.mockRestore();
    });

    it("should call revoke command action", async () => {
      const streams = createTestStreams();
      const revokeSpy = jest
        .spyOn(revokeModule, "revokeCommand")
        .mockResolvedValue(undefined);

      await run({
        argv: [
          "revoke",
          "--token-id",
          "test-id",
          "--url",
          "http://localhost",
          "--admin-token",
          "token",
        ],
        env: process.env,
        ...streams,
      });

      expect(revokeSpy).toHaveBeenCalled();
      revokeSpy.mockRestore();
    });

    it("should call restore command action", async () => {
      const streams = createTestStreams();
      const restoreSpy = jest
        .spyOn(restoreModule, "restoreCommand")
        .mockResolvedValue(undefined);

      await run({
        argv: [
          "restore",
          "--token-id",
          "test-id",
          "--url",
          "http://localhost",
          "--admin-token",
          "token",
        ],
        env: process.env,
        ...streams,
      });

      expect(restoreSpy).toHaveBeenCalled();
      restoreSpy.mockRestore();
    });

    it("should call sync command action", async () => {
      const streams = createTestStreams();
      const syncSpy = jest
        .spyOn(syncModule, "syncCommand")
        .mockResolvedValue(undefined);

      await run({
        argv: ["sync", "--config", "/path/to/config.yml"],
        env: process.env,
        ...streams,
      });

      expect(syncSpy).toHaveBeenCalled();
      syncSpy.mockRestore();
    });
  });
});
