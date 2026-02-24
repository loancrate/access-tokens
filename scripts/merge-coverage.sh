#!/bin/bash
set -e

echo "Merging coverage reports..."

node -e '
const fs = require("fs");
const path = require("path");
const libCoverage = require("istanbul-lib-coverage");
const libReport = require("istanbul-lib-report");
const reports = require("istanbul-reports");

// Merge all Istanbul JSON coverage files from all packages
const map = libCoverage.createCoverageMap({});
const packagesDir = path.resolve("packages");

for (const pkg of fs.readdirSync(packagesDir)) {
  const coverageDir = path.join(packagesDir, pkg, "coverage");
  if (!fs.existsSync(coverageDir)) continue;

  for (const file of fs.readdirSync(coverageDir)) {
    if (!file.endsWith(".json")) continue;
    const filePath = path.join(coverageDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      map.merge(data);
    } catch {}
  }
}

const context = libReport.createContext({
  dir: "coverage",
  coverageMap: map,
});

// Terminal summary
reports.create("text").execute(context);

// Browsable HTML report
reports.create("html", { subdir: "html" }).execute(context);

// Machine-readable JSON
reports.create("json", { file: "coverage-merged.json" }).execute(context);

console.log("\nCoverage reports written to coverage/");
'
