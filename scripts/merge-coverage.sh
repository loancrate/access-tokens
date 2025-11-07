#!/bin/bash
set -e

echo "Merging coverage reports..."

mkdir -p coverage/packages

for package in packages/*; do
  if [ -d "$package/coverage" ]; then
    ./node_modules/.bin/nyc merge "$package/coverage" "coverage/packages/$(basename "$package").json"
  fi
done

echo "Combining all package coverage..."
./node_modules/.bin/nyc merge coverage/packages coverage/combined/coverage.json

echo "Generating HTML report..."
./node_modules/.bin/nyc report \
  --reporter=html \
  --report-dir=coverage/html \
  --temp-dir=coverage/combined

echo "✓ Coverage reports merged successfully!"
