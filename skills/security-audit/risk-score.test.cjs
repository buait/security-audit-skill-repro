#!/usr/bin/env node
// risk-score.test.cjs
// Unit tests for risk-score.cjs.
// Usage: node --test risk-score.test.cjs

"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { analyze, normalizeFindings, severityRank, confidenceScore } = require("./risk-score.cjs");

const CLI_PATH = path.join(__dirname, "risk-score.cjs");
const CLI_TIMEOUT_MS = 5000;

function source(scope = "handle") {
  return { kind: "entrypoint", file: "src/handler.c", line: 10, scope, description: "Attacker data reaches the operation." };
}

function confirmed(overrides = {}) {
  return {
    verdict: "confirmed",
    fingerprint: "src-handler-missing-check",
    title: "Missing ownership check",
    description: "An attacker can reach an operation without the intended ownership check.",
    root_cause: "handle omits the ownership check before changing the object.",
    intended_behavior: "Only the object's owner can change it.",
    trace: [source()],
    evidence: [{ file: "src/handler.c", line: 10, description: "The source performs the operation without the required check." }],
    conditions: [],
    execution: {
      attacker_perspective: "An unauthenticated caller can invoke the handler.",
      payloads: ["GET /object?id=1"],
      instructions: "Run the handler against the fixture.",
      observed_result: "The object is mutated without ownership verification.",
    },
    remediation: { strategy: "Add an ownership check before mutation." },
    severity: { likelihood: "medium", impact: "high", overall_severity: "high" },
    confidence: { score: 90, reason: "Reproduced in sandbox." },
    ...overrides,
  };
}

test("severityRank maps strings and clamps numbers", () => {
  assert.equal(severityRank("critical"), 4);
  assert.equal(severityRank("HIGH"), 3);
  assert.equal(severityRank("informational"), 0);
  assert.equal(severityRank("bogus"), 0);
  assert.equal(severityRank(2.7), 2);
  assert.equal(severityRank(-5), 0);
  assert.equal(severityRank(99), 4);
});

test("confidenceScore clamps to 0..100", () => {
  assert.equal(confidenceScore(90), 90);
  assert.equal(confidenceScore(150), 100);
  assert.equal(confidenceScore(-3), 0);
  assert.equal(confidenceScore("75"), 75);
  assert.equal(confidenceScore("n/a"), 0);
});

test("normalizeFindings keeps only confirmed findings", () => {
  const input = [confirmed(), confirmed({ verdict: "rejected" }), null, "x"];
  assert.equal(normalizeFindings(input).length, 1);
});

test("empty findings yield zero overall risk", () => {
  const report = analyze([]);
  assert.equal(report.overallRisk, 0);
  assert.equal(report.priority.length, 0);
});

test("single high-confidence high finding scores above zero and is first in priority", () => {
  const report = analyze([confirmed()]);
  assert.ok(report.overallRisk > 0);
  assert.equal(report.priority[0].fingerprint, "src-handler-missing-check");
  assert.equal(report.byScope.get("handle"), 1);
  assert.equal(report.matrix[2][3], 1);
});

test("priority sorts by severity then confidence", () => {
  const findings = [
    confirmed({ fingerprint: "a-low", title: "Low issue", severity: { likelihood: "low", impact: "low", overall_severity: "low" }, confidence: { score: 90, reason: "x" } }),
    confirmed({ fingerprint: "b-high", title: "High issue", severity: { likelihood: "high", impact: "high", overall_severity: "high" }, confidence: { score: 70, reason: "x" } }),
    confirmed({ fingerprint: "c-crit", title: "Critical issue", severity: { likelihood: "critical", impact: "critical", overall_severity: "critical" }, confidence: { score: 95, reason: "x" } }),
  ];
  const report = analyze(findings);
  assert.deepEqual(report.priority.map((r) => r.fingerprint), ["c-crit", "b-high", "a-low"]);
});

test("CLI exits 2 on missing file and reports an error", () => {
  const result = spawnSync(process.execPath, [CLI_PATH, "does-not-exist.json"], { encoding: "utf8", timeout: CLI_TIMEOUT_MS });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Cannot read input file/);
});

test("CLI prints a Markdown report for valid findings", () => {
  const input = JSON.stringify([confirmed()]);
  const result = spawnSync(process.execPath, [CLI_PATH, "-"], { input, encoding: "utf8", timeout: CLI_TIMEOUT_MS });
  if (result.status !== 0) {
    // "-" is not supported by this CLI; fall back to a temp file.
    const fs = require("node:fs");
    const os = require("node:os");
    const tmp = path.join(os.tmpdir(), `risk-score-fixture-${process.pid}.json`);
    fs.writeFileSync(tmp, input);
    const second = spawnSync(process.execPath, [CLI_PATH, tmp], { encoding: "utf8", timeout: CLI_TIMEOUT_MS });
    fs.unlinkSync(tmp);
    assert.equal(second.status, 0);
    assert.match(second.stdout, /# Risk Score Report/);
    assert.match(second.stdout, /Overall risk score/);
    return;
  }
  assert.match(result.stdout, /# Risk Score Report/);
  assert.match(result.stdout, /Overall risk score/);
});
