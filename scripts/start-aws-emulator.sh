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

# Strip the scheme and any path before reading the port, or a trailing slash
# lands in the port and we bind something other than what the clients will use.
HOST_PORT="${AWS_ENDPOINT_URL#*://}"
HOST_PORT="${HOST_PORT%%/*}"
case "$HOST_PORT" in
*:*)
  PORT="${HOST_PORT##*:}"
  # A malformed port is a typo, not a request for the default. Binding 4566
  # here would report success for an address nothing is listening on.
  case "$PORT" in
  '' | *[!0-9]*)
    echo "Error: could not read a port from AWS_ENDPOINT_URL=${AWS_ENDPOINT_URL}" >&2
    echo "Expected something like http://localhost:4699" >&2
    exit 1
    ;;
  esac
  ;;
*) PORT=4566 ;;
esac
export AWS_EMULATOR_PORT="$PORT"

if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running. Start Docker and try again." >&2
  exit 1
fi

# Refuse to adopt someone else's emulator. Reusing whatever answered on the
# port is how integration runs here ended up silently testing against another
# repo's LocalStack, so a foreign emulator is an error with a way out, not a
# convenience.
#
# `docker compose ps -q` is scoped to this checkout's compose project, since
# docker-compose.yml pins no project name. So "foreign" correctly includes
# another worktree's emulator, which would otherwise be quietly shared or, if
# the ports differed, recreated out from under a run already using it.
#
# Our own container is left to compose, which is idempotent and recreates it if
# the image, port, or environment has drifted.
if [ -z "$(docker compose ps -q aws-emulator)" ] \
  && curl -s -f "${AWS_ENDPOINT_URL}/_localstack/health" > /dev/null 2>&1; then
  echo "Error: something is already serving ${AWS_ENDPOINT_URL}, and it is not" >&2
  echo "this checkout's emulator -- another repo, or another worktree. Tests" >&2
  echo "would silently run against it." >&2
  echo >&2
  echo "Use another port:" >&2
  echo "  AWS_ENDPOINT_URL=http://localhost:4699 pnpm test-int" >&2
  echo >&2
  echo "or stop whatever holds it:" >&2
  echo "  docker ps --filter publish=${AWS_EMULATOR_PORT}" >&2
  exit 1
fi

docker compose up -d --wait aws-emulator

echo "✓ Emulator ready at ${AWS_ENDPOINT_URL}"
