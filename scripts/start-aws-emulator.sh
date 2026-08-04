#!/bin/bash
set -e

# Bring up the local AWS emulator defined in docker-compose.yml.
#
# Compose does nearly all of it: `up -d --wait` recreates the container
# whenever the image, published port, or environment drifts from that file,
# blocks on the healthcheck, and costs nothing when it is already healthy. This
# script exists for the two things compose cannot express -- deriving the port
# from AWS_ENDPOINT_URL so there is one knob rather than two, and refusing to
# run against an emulator that is not ours.

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# AWS_ENDPOINT_URL is the AWS SDK's own override variable, and the integration
# tests and example app both honor it, so
#
#   AWS_ENDPOINT_URL=http://localhost:4699 pnpm test-int
#
# starts an emulator there and points everything at it. Overrides must also be
# declared under the tasks' `env` keys in turbo.json -- turbo runs tasks with a
# filtered environment and drops anything undeclared.
AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://localhost:4566}"
PORT="${AWS_ENDPOINT_URL##*:}"
case "$PORT" in
'' | *[!0-9]*) PORT=4566 ;;
esac
export AWS_EMULATOR_PORT="$PORT"

if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running. Start Docker and try again." >&2
  exit 1
fi

# Refuse to adopt someone else's emulator. Reusing whatever answered on the
# port is how integration runs here ended up silently testing against another
# repo's LocalStack, so a foreign emulator is an error with a way out, not a
# convenience. Our own container is left to compose, which is idempotent.
if [ -z "$(docker compose ps -q aws-emulator)" ] \
  && curl -s -f "${AWS_ENDPOINT_URL}/_localstack/health" > /dev/null 2>&1; then
  echo "Error: something is already serving ${AWS_ENDPOINT_URL}, and it is not" >&2
  echo "this repo's emulator. Tests would silently run against it." >&2
  echo >&2
  echo "Stop it, or use another port:" >&2
  echo "  AWS_ENDPOINT_URL=http://localhost:4699 pnpm test-int" >&2
  exit 1
fi

docker compose up -d --wait aws-emulator

echo "✓ Emulator ready at ${AWS_ENDPOINT_URL}"
