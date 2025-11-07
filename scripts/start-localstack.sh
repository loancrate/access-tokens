#!/bin/bash
set -e

echo "Checking for LocalStack..."

# Port can be overridden via environment variable
LOCALSTACK_PORT="${LOCALSTACK_PORT:-4566}"

AWS_ENDPOINT="http://localhost:${LOCALSTACK_PORT}"

# Check if LocalStack is already running
if curl -s -f "${AWS_ENDPOINT}/_localstack/health" > /dev/null 2>&1; then
  echo "✓ LocalStack already running at ${AWS_ENDPOINT}"
  exit 0
fi

echo "LocalStack not detected. Starting LocalStack Docker container..."

# Start LocalStack container in detached mode
# Note: Pinned to version 4.10 for consistent behavior across environments.
# This version has been tested with our integration tests.
docker run -d \
  --name access-tokens-localstack \
  -p ${LOCALSTACK_PORT}:4566 \
  localstack/localstack:4.10

echo "Waiting for LocalStack to be ready..."

# Wait for LocalStack health check
MAX_RETRIES=30
RETRY_COUNT=0

until curl -s -f "${AWS_ENDPOINT}/_localstack/health" > /dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "Error: LocalStack failed to start within timeout"
    exit 1
  fi
  echo "Waiting for LocalStack... (attempt $RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

echo "✓ LocalStack is ready at ${AWS_ENDPOINT}"
