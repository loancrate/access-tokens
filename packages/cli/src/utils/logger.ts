import chalk from "chalk";

export type LogLevel = "quiet" | "normal" | "verbose";

export type LogOptions = {
  verbose?: boolean;
  quiet?: boolean;
};

export class Logger {
  private readonly level: LogLevel;

  constructor(level: LogLevel | LogOptions = "normal") {
    if (typeof level === "string") {
      this.level = level;
    } else if (level.quiet) {
      this.level = "quiet";
    } else if (level.verbose) {
      this.level = "verbose";
    } else {
      this.level = "normal";
    }
  }

  error(message: string, ...args: unknown[]): void {
    console.error(chalk.red(message), ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.level !== "quiet") {
      console.warn(chalk.yellow(message), ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.level !== "quiet") {
      // eslint-disable-next-line no-console
      console.log(message, ...args);
    }
  }

  success(message: string, ...args: unknown[]): void {
    if (this.level !== "quiet") {
      // eslint-disable-next-line no-console
      console.log(chalk.green(message), ...args);
    }
  }

  verbose(message: string, ...args: unknown[]): void {
    if (this.level === "verbose") {
      // eslint-disable-next-line no-console
      console.log(chalk.gray(message), ...args);
    }
  }

  dryRun(message: string, ...args: unknown[]): void {
    if (this.level !== "quiet") {
      // eslint-disable-next-line no-console
      console.log(chalk.cyan("[DRY RUN]"), message, ...args);
    }
  }

  json(data: unknown): void {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(data, null, 2));
  }
}
