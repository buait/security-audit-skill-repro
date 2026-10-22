#!/usr/bin/env node
// risk-score.cjs
// Aggregates confirmed findings into a prioritised risk report.
// Usage: node risk-score.cjs <path-to-findings.json> [--json]
// Outputs a Markdown report by default; pass --json for machine-readable output.

"use strict";

const fs = require("fs");
const path = require("path");

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const SEVERITY_RANK = Object.freeze({
  informational: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
});

const SEVERITY_LABEL = Object.freeze([
  "informational",
  "low",
  "medium",
  "high",
  "critical",
]);

function severityRank(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, Math.min(4, Math.floor(value))) : 0;
  }
  if (typeof value === "string") {
    const key = value.trim().toLowerCase();
    return hasOwn(SEVERITY_RANK, key) ? SEVERITY_RANK[key] : 0;
  }
  return 0;
}

function confidenceScore(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
  }
  return 0;
}

function safeString(value, fallback) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function firstScope(finding) {
  const trace = Array.isArray(finding.trace) ? finding.trace : [];
  for (const entry of trace) {
    if (entry && typeof entry === "object" && typeof entry.scope === "string" && entry.scope.length > 0) {
      return entry.scope;
    }
  }
  return "unclassified";
}

function normalizeFindings(input) {
  if (!Array.isArray(input)) {
    throw new Error("findings root must be an array");
  }
  return input.filter((finding) => finding && typeof finding === "object" && finding.verdict === "confirmed");
}

function analyze(findings) {
  const records = findings.map((finding, index) => {
    const severity = finding.severity && typeof finding.severity === "object" ? finding.severity : {};
    const confidenceObj = finding.confidence && typeof finding.confidence === "object" ? finding.confidence : {};
    const likelihood = severityRank(severity.likelihood);
    const impact = severityRank(severity.impact);
    const overall = severityRank(severity.overall_severity);
    const confidence = confidenceScore(confidenceObj.score);
    const remediation = finding.remediation && typeof finding.remediation === "object"
      ? safeString(finding.remediation.strategy, "not specified")
      : "not specified";
    return {
      index: index + 1,
      fingerprint: safeString(finding.fingerprint, `finding-${index + 1}`),
      title: safeString(finding.title, "(untitled)"),
      scope: firstScope(finding),
      likelihood,
      impact,
      overall,
      confidence,
      remediation,
      root_cause: safeString(finding.root_cause, ""),
    };
  });

  const matrix = Array.from({ length: 5 }, () => Array(5).fill(0));
  const byScope = new Map();
  const bySeverity = new Map([0, 1, 2, 3, 4].map((rank) => [rank, 0]));

  for (const record of records) {
    matrix[record.likelihood][record.impact] += 1;
    bySeverity.set(record.overall, bySeverity.get(record.overall) + 1);
    const scopeCount = byScope.get(record.scope) || 0;
    byScope.set(record.scope, scopeCount + 1);
  }

  const overallRisk = records.length === 0
    ? 0
    : Math.round(
        (100 * records.reduce((sum, record) => sum + (record.overall / 4) * (record.confidence / 100), 0)) /
          records.length,
      );

  const priority = records
    .slice()
    .sort((a, b) => b.overall - a.overall || b.confidence - a.confidence || a.fingerprint.localeCompare(b.fingerprint));

  return { records, matrix, byScope, bySeverity, overallRisk, priority };
}

function renderMarkdown(report, sourceName) {
  const lines = [];
  lines.push(`# Risk Score Report`);
  lines.push(``);
  lines.push(`- **Source**: \`${sourceName}\``);
  lines.push(`- **Confirmed findings**: ${report.records.length}`);
  lines.push(`- **Overall risk score**: ${report.overallRisk} / 100`);
  lines.push(``);
  lines.push(`## Severity distribution`);
  lines.push(``);
  lines.push(`| Severity | Count |`);
  lines.push(`| --- | --- |`);
  for (let rank = 4; rank >= 0; rank -= 1) {
    const count = report.bySeverity.get(rank) || 0;
    if (count > 0 || rank === 0) {
      lines.push(`| ${SEVERITY_LABEL[rank]} | ${count} |`);
    }
  }
  lines.push(``);
  lines.push(`## Risk matrix (likelihood x impact)`);
  lines.push(``);
  lines.push(`| likelihood \\ impact | informational | low | medium | high | critical |`);
  lines.push(`| --- | --- | --- | --- | --- | --- |`);
  for (let likelihood = 4; likelihood >= 0; likelihood -= 1) {
    const cells = report.matrix[likelihood].map((count) => String(count)).join(" | ");
    lines.push(`| ${SEVERITY_LABEL[likelihood]} | ${cells} |`);
  }
  lines.push(``);
  lines.push(`## Findings by scope`);
  lines.push(``);
  if (report.byScope.size === 0) {
    lines.push(`_No confirmed findings._`);
  } else {
    lines.push(`| Scope | Count |`);
    lines.push(`| --- | --- |`);
    for (const [scope, count] of [...report.byScope.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${scope} | ${count} |`);
    }
  }
  lines.push(``);
  lines.push(`## Remediation priority`);
  lines.push(``);
  if (report.priority.length === 0) {
    lines.push(`_Nothing to remediate._`);
  } else {
    lines.push(`| # | Severity | Confidence | Title | Scope | Remediation |`);
    lines.push(`| --- | --- | --- | --- | --- | --- |`);
    for (const record of report.priority) {
      lines.push(
        `| ${record.index} | ${SEVERITY_LABEL[record.overall]} | ${record.confidence}% | ${record.title} | ${record.scope} | ${record.remediation} |`,
      );
    }
  }
  lines.push(``);
  return lines.join("\n");
}

function renderJson(report) {
  return JSON.stringify(
    {
      finding_count: report.records.length,
      overall_risk: report.overallRisk,
      severity_distribution: Object.fromEntries([...report.bySeverity.entries()].map(([k, v]) => [SEVERITY_LABEL[k], v])),
      matrix: report.matrix,
      by_scope: Object.fromEntries(report.byScope),
      priority: report.priority.map((record) => ({
        fingerprint: record.fingerprint,
        title: record.title,
        scope: record.scope,
        severity: SEVERITY_LABEL[record.overall],
        confidence: record.confidence,
        remediation: record.remediation,
      })),
    },
    null,
    2,
  );
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    process.stderr.write("Usage: node risk-score.cjs <path-to-findings.json> [--json]\n");
    process.exit(2);
  }
  const inputPath = args[0];
  const asJson = args.includes("--json");
  const sourceName = path.basename(inputPath);
  let raw;
  try {
    raw = fs.readFileSync(inputPath, "utf8");
  } catch (error) {
    process.stderr.write(`Cannot read input file: ${error.message}\n`);
    process.exit(2);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    process.stderr.write(`Invalid JSON: ${error.message}\n`);
    process.exit(2);
  }
  const report = analyze(normalizeFindings(parsed));
  process.stdout.write(asJson ? `${renderJson(report)}\n` : `${renderMarkdown(report, sourceName)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { analyze, normalizeFindings, severityRank, confidenceScore };
