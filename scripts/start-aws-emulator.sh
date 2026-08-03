#!/bin/bash
set -e

# Ensure the local AWS emulator is running and ready.
#
# The container spec lives in docker-compose.yml. This script only decides
# whether to start it, because compose cannot express the one thing we need
# first: reuse whatever is already listening. CI depends on that -- it provides
# its own emulator as a GitHub Actions service container -- and locally it lets
# you point at a shared emulator instead of running a second one.
#
# Everything else is compose's job. It recreates the container whenever the
# image, published port, or environment drifts from this file, and --wait
# blocks on the healthcheck, so there is no reconciliation or polling here.

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# One knob for "where is the emulator". AWS_ENDPOINT_URL is the AWS SDK's own
# override variable, and the integration tests and example app both honor it:
#
#   AWS_ENDPOINT_URL=http://localhost:4699 pnpm test-int
#
# starts an emulator there and points everything at it.
AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://localhost:4566}"
PORT="${AWS_ENDPOINT_URL##*:}"
case "$PORT" in
'' | *[!0-9]*) PORT=4566 ;;
esac
export AWS_EMULATOR_PORT="$PORT"

if curl -s -f "${AWS_ENDPOINT_URL}/_localstack/health" > /dev/null 2>&1; then
  # Say what answered. Reuse used to be silent, which is how a run could end up
  # testing against an unrelated emulator with nothing in the output to say so.
  echo "✓ Reusing the emulator already running at ${AWS_ENDPOINT_URL}"
  curl -s "${AWS_ENDPOINT_URL}/_localstack/health" | head -c 200
  echo
  exit 0
fi

if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running. Start Docker and try again." >&2
  exit 1
fi

echo "Starting the local AWS emulator on port ${AWS_EMULATOR_PORT}..."
docker compose up -d --wait aws-emulator

echo "✓ Emulator ready at ${AWS_ENDPOINT_URL}"
