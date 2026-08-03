#!/bin/bash
set -e

# Starts the local AWS emulator that the integration tests and the example app
# run against, reusing one if it is already listening.
#
# Floci is a drop-in replacement for LocalStack Community: same port, same
# test/test credentials, same /_localstack/health endpoint, no auth token.
# Pinned by digest because Floci ships a release every week or two and we have
# been burned by floating tags before.
#
# ROLLBACK: AWS_EMULATOR_IMAGE=localstack/localstack:4.10 pnpm test-int
AWS_EMULATOR_IMAGE="${AWS_EMULATOR_IMAGE:-floci/floci:1.5.34@sha256:b3b3a70a294b8ba8095385b8571ea1e4d44d494950d98de5e812cd9de02f506b}"

# One knob for "where is the emulator". AWS_ENDPOINT_URL is the AWS SDK's own
# override variable, and the integration tests honor it too, so
#
#   AWS_ENDPOINT_URL=http://localhost:4699 pnpm test-int
#
# both starts an emulator on that port and points the tests at it. This
# replaces LOCALSTACK_PORT, which moved only the container -- the tests
# hardcoded 4566, so changing it silently broke them.
AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://localhost:4566}"
HOST_PORT="${AWS_ENDPOINT_URL##*:}"
case "$HOST_PORT" in
'' | *[!0-9]*) HOST_PORT=4566 ;;
esac

CONTAINER_NAME=access-tokens-aws-emulator
LEGACY_CONTAINER_NAME=access-tokens-localstack

echo "Checking for a local AWS emulator at ${AWS_ENDPOINT_URL}..."

# Reconcile our own containers before probing. A container left over from an
# earlier emulator would otherwise answer the health check forever, silently
# keeping this repo on whatever image it was created with. The same pass clears
# the `docker run --name` collision against a stopped container.
docker rm -f "$LEGACY_CONTAINER_NAME" > /dev/null 2>&1 || true

EXISTING_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$CONTAINER_NAME" 2> /dev/null || true)"
if [ -n "$EXISTING_IMAGE" ] && [ "$EXISTING_IMAGE" != "$AWS_EMULATOR_IMAGE" ]; then
  echo "Removing ${CONTAINER_NAME}, which runs a different image (${EXISTING_IMAGE})"
  docker rm -f "$CONTAINER_NAME" > /dev/null
  EXISTING_IMAGE=
fi

if curl -s -f "${AWS_ENDPOINT_URL}/_localstack/health" > /dev/null 2>&1; then
  # Say what answered. Reuse is deliberate -- it is what keeps the suite fast,
  # and it lets you point at a shared emulator or real DynamoDB -- but it used
  # to be invisible, so an unrelated emulator on this port would quietly serve
  # the tests with nothing in the output to say so.
  echo "✓ Emulator already running at ${AWS_ENDPOINT_URL}"
  curl -s "${AWS_ENDPOINT_URL}/_localstack/health" | head -c 200
  echo
  exit 0
fi

if [ -n "$EXISTING_IMAGE" ]; then
  echo "Starting existing ${CONTAINER_NAME} container..."
  docker start "$CONTAINER_NAME" > /dev/null
else
  echo "Starting ${AWS_EMULATOR_IMAGE}..."
  # Keep the container's internal port at 4566 and remap host-side. Emulators
  # build the endpoints they hand out from their own base URL, which no port
  # variable updates, so moving the internal port breaks those silently.
  docker run -d \
    --name "$CONTAINER_NAME" \
    -p "${HOST_PORT}:4566" \
    "$AWS_EMULATOR_IMAGE" > /dev/null
fi

echo "Waiting for the emulator to be ready..."

MAX_RETRIES=60
RETRY_COUNT=0

until curl -s -f "${AWS_ENDPOINT_URL}/_localstack/health" > /dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "Error: emulator failed to start within timeout"
    docker logs --tail 50 "$CONTAINER_NAME" || true
    exit 1
  fi
  sleep 1
done

echo "✓ Emulator ready at ${AWS_ENDPOINT_URL}"
