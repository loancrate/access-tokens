import chalk from "chalk";

import { Logger } from "../logger";

describe("Logger", () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe("constructor", () => {
    it("should default to normal level when no argument provided", () => {
      const logger = new Logger();
      logger.verbose("test");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("should accept string 'quiet'", () => {
      const logger = new Logger("quiet");
      logger.info("test");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("should accept string 'normal'", () => {
      const logger = new Logger("normal");
      logger.info("test");
      expect(consoleLogSpy).toHaveBeenCalledWith("test");
    });

    it("should accept string 'verbose'", () => {
      const logger = new Logger("verbose");
      logger.verbose("test");
      expect(consoleLogSpy).toHaveBeenCalledWith(chalk.gray("test"));
    });

    it("should accept LogOptions with quiet: true", () => {
      const logger = new Logger({ quiet: true });
      logger.info("test");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("should accept LogOptions with verbose: true", () => {
      const logger = new Logger({ verbose: true });
      logger.verbose("test");
      expect(consoleLogSpy).toHaveBeenCalledWith(chalk.gray("test"));
    });

    it("should default to normal when LogOptions is empty", () => {
      const logger = new Logger({});
      logger.verbose("test");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("should prioritize quiet over verbose in LogOptions", () => {
      const logger = new Logger({ quiet: true, verbose: true });
      logger.info("test");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe("error", () => {
    it("should always log errors regardless of level", () => {
      const quietLogger = new Logger("quiet");
      const normalLogger = new Logger("normal");
      const verboseLogger = new Logger("verbose");

      quietLogger.error("error1");
      normalLogger.error("error2");
      verboseLogger.error("error3");

      expect(consoleErrorSpy).toHaveBeenCalledTimes(3);
      expect(consoleErrorSpy).toHaveBeenCalledWith(chalk.red("error1"));
      expect(consoleErrorSpy).toHaveBeenCalledWith(chalk.red("error2"));
      expect(consoleErrorSpy).toHaveBeenCalledWith(chalk.red("error3"));
    });

    it("should pass additional arguments", () => {
      const logger = new Logger();
      logger.error("error", { code: 123 }, "extra");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        chalk.red("error"),
        { code: 123 },
        "extra",
      );
    });
  });

  describe("warn", () => {
    it("should log warnings in normal mode", () => {
      const logger = new Logger("normal");
      logger.warn("warning");
      expect(consoleWarnSpy).toHaveBeenCalledWith(chalk.yellow("warning"));
    });

    it("should log warnings in verbose mode", () => {
      const logger = new Logger("verbose");
      logger.warn("warning");
      expect(consoleWarnSpy).toHaveBeenCalledWith(chalk.yellow("warning"));
    });

    it("should not log warnings in quiet mode", () => {
      const logger = new Logger("quiet");
      logger.warn("warning");
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("should pass additional arguments", () => {
      const logger = new Logger("normal");
      logger.warn("warning", { detail: "info" });
      expect(consoleWarnSpy).toHaveBeenCalledWith(chalk.yellow("warning"), {
        detail: "info",
      });
    });
  });

  describe("info", () => {
    it("should log info messages in normal mode", () => {
      const logger = new Logger("normal");
      logger.info("info message");
      expect(consoleLogSpy).toHaveBeenCalledWith("info message");
    });

    it("should log info messages in verbose mode", () => {
      const logger = new Logger("verbose");
      logger.info("info message");
      expect(consoleLogSpy).toHaveBeenCalledWith("info message");
    });

    it("should not log info messages in quiet mode", () => {
      const logger = new Logger("quiet");
      logger.info("info message");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("should pass additional arguments", () => {
      const logger = new Logger("normal");
      logger.info("info", 1, 2, 3);
      expect(consoleLogSpy).toHaveBeenCalledWith("info", 1, 2, 3);
    });
  });

  describe("success", () => {
    it("should log success messages in normal mode", () => {
      const logger = new Logger("normal");
      logger.success("success!");
      expect(consoleLogSpy).toHaveBeenCalledWith(chalk.green("success!"));
    });

    it("should log success messages in verbose mode", () => {
      const logger = new Logger("verbose");
      logger.success("success!");
      expect(consoleLogSpy).toHaveBeenCalledWith(chalk.green("success!"));
    });

    it("should not log success messages in quiet mode", () => {
      const logger = new Logger("quiet");
      logger.success("success!");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("should pass additional arguments", () => {
      const logger = new Logger("normal");
      logger.success("done", { count: 5 });
      expect(consoleLogSpy).toHaveBeenCalledWith(chalk.green("done"), {
        count: 5,
      });
    });
  });

  describe("verbose", () => {
    it("should log verbose messages only in verbose mode", () => {
      const logger = new Logger("verbose");
      logger.verbose("verbose message");
      expect(consoleLogSpy).toHaveBeenCalledWith(chalk.gray("verbose message"));
    });

    it("should not log verbose messages in normal mode", () => {
      const logger = new Logger("normal");
      logger.verbose("verbose message");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("should not log verbose messages in quiet mode", () => {
      const logger = new Logger("quiet");
      logger.verbose("verbose message");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("should pass additional arguments", () => {
      const logger = new Logger("verbose");
      logger.verbose("details", { nested: true });
      expect(consoleLogSpy).toHaveBeenCalledWith(chalk.gray("details"), {
        nested: true,
      });
    });
  });

  describe("dryRun", () => {
    it("should log dry run messages in normal mode", () => {
      const logger = new Logger("normal");
      logger.dryRun("would do something");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.cyan("[DRY RUN]"),
        "would do something",
      );
    });

    it("should log dry run messages in verbose mode", () => {
      const logger = new Logger("verbose");
      logger.dryRun("would do something");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.cyan("[DRY RUN]"),
        "would do something",
      );
    });

    it("should not log dry run messages in quiet mode", () => {
      const logger = new Logger("quiet");
      logger.dryRun("would do something");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("should pass additional arguments", () => {
      const logger = new Logger("normal");
      logger.dryRun("action", "arg1", "arg2");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.cyan("[DRY RUN]"),
        "action",
        "arg1",
        "arg2",
      );
    });
  });

  describe("json", () => {
    it("should output JSON regardless of log level (quiet)", () => {
      const logger = new Logger("quiet");
      const data = { foo: "bar", count: 42 };
      logger.json(data);
      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
    });

    it("should output JSON regardless of log level (normal)", () => {
      const logger = new Logger("normal");
      const data = { foo: "bar" };
      logger.json(data);
      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
    });

    it("should output JSON regardless of log level (verbose)", () => {
      const logger = new Logger("verbose");
      const data = { foo: "bar" };
      logger.json(data);
      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
    });

    it("should format complex objects", () => {
      const logger = new Logger();
      const data = {
        nested: {
          array: [1, 2, 3],
          boolean: true,
        },
      };
      logger.json(data);
      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
    });
  });
});
