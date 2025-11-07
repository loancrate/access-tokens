import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import express from "express";
import rateLimit from "express-rate-limit";
import pino from "pino";

import { DynamoDBPat } from "@access-tokens/core";
import {
  buildSignerVerifier,
  createAdminTokensRouter,
  createAuthRouter,
  createRequireAdmin,
  createRequireJwt,
  ExtendedJwtPayload,
  generateKeySet,
} from "@access-tokens/express";

const logger = pino({
  level: "info",
  transport: {
    target: "pino-pretty",
    options: {
      ignore: "pid,hostname",
    },
  },
});

async function main() {
  logger.info("Starting DynamoDB PAT example application...");

  const dynamoClient = new DynamoDBClient({
    endpoint: process.env.DYNAMODB_ENDPOINT || "http://localhost:4566",
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
    },
  });

  const docClient = DynamoDBDocumentClient.from(dynamoClient);

  const tableName = process.env.TABLE_NAME || "access-tokens-example";

  // Create the DynamoDB table for storing tokens if it doesn't exist. This
  // would normally be provisioned out-of-band, but for this example we create
  // it on startup if needed.
  try {
    await dynamoClient.send(new DescribeTableCommand({ TableName: tableName }));
    logger.info(`Table ${tableName} already exists`);
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) {
      throw err;
    }

    logger.info(`Creating table ${tableName}...`);
    await dynamoClient.send(
      new CreateTableCommand({
        TableName: tableName,
        KeySchema: [
          {
            AttributeName: "tokenId",
            KeyType: "HASH",
          },
        ],
        AttributeDefinitions: [
          {
            AttributeName: "tokenId",
            AttributeType: "S",
          },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    logger.info(`Table ${tableName} created successfully`);
  }

  let bootstrapPhc = process.env.BOOTSTRAP_PHC;
  let pat = new DynamoDBPat({ tableName, docClient, bootstrapPhc });

  // The bootstrap token is normally created out-of-band and its secret hash is
  // provided via an environment variable. For this example, if no bootstrap
  // token is provided and the table is empty, we create one here and log the
  // token to the console. In a real application, you would not want to log the
  // token secret like this!
  if (!bootstrapPhc && (await pat.getCount()) === 0) {
    const bootstrap = await pat.generate();
    logger.info(`Generated bootstrap token: ${bootstrap.token}`);
    bootstrapPhc = bootstrap.secretPhc;
    pat = new DynamoDBPat({ tableName, docClient, bootstrapPhc });
  }

  // Generate a key set for signing JWTs. In a real application, you would want
  // to persist and rotate keys over time.
  const keySet = await generateKeySet("key-1");

  const signerVerifier = await buildSignerVerifier<ExtendedJwtPayload>({
    keySet,
    issuer: "example-app",
    ttl: "1h",
  });

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Validating a personal access token runs scrypt, which is CPU-intensive, so
  // we strictly limit /auth/token requests.
  const authRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    keyGenerator: (req) => req.clientIp || "unknown",
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { message: "Too many requests, try again in a minute" },
    },
  });

  // General API requests should be rate-limited, but less strictly, since they
  // use a JWT, which is much less CPU-intensive to validate.
  const apiRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 1000,
    keyGenerator: (req) => req.clientIp || "unknown",
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, try again in a minute." },
  });

  const authRouter = createAuthRouter({ pat, signerVerifier, logger });

  const adminTokensRouter = createAdminTokensRouter({
    pat,
    signerVerifier,
    logger,
  });

  app.use("/auth", authRateLimit, authRouter);
  app.use("/admin", apiRateLimit, adminTokensRouter);

  const requireJwt = createRequireJwt({ signerVerifier, logger });
  const requireAdmin = createRequireAdmin({ logger });

  app.get("/user-only", apiRateLimit, requireJwt, (req, res) => {
    res.json({
      message: "You accessed a user-only route!",
      user: req.user,
    });
  });

  app.get("/admin-only", apiRateLimit, requireJwt, requireAdmin, (req, res) => {
    res.json({
      message: "You accessed an admin-only route!",
      user: req.user,
    });
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info("Example endpoints:");
    logger.info(`  GET  http://localhost:${PORT}/health - Health check`);
    logger.info(`  POST http://localhost:${PORT}/auth/token - Get JWT token`);
    logger.info(`  GET  http://localhost:${PORT}/user-only - User-only route`);
    logger.info(
      `  GET  http://localhost:${PORT}/admin-only - Admin-only route`,
    );
    logger.info(
      `  POST http://localhost:${PORT}/admin/tokens - Create token (admin)`,
    );
    logger.info("");
    logger.info("To use the client library:");
    logger.info("  const client = new AccessTokensClient({");
    logger.info(`    endpoint: "http://localhost:${PORT}",`);
    logger.info('    apiKey: "your-pat-token"');
    logger.info("  });");
  });
}

main().catch((error) => {
  logger.error({ error }, "Failed to start application");
  process.exit(1);
});
