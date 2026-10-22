#!/usr/bin/env node
/**
 * audit-cli.mjs — 零依赖安全审计工作流编排 CLI
 *
 * 本工具是对 cloudflare/security-audit-skill 的复现优化层：
 * 原仓库以"提示词编排 + JSON 校验器"驱动六阶段审计，本 CLI 将其升级为
 * 可直接执行的命令行流水线，让审计运行目录的初始化、报告骨架生成、
 * schema 校验与结果摘要在一行命令内完成。
 *
 * 依赖：Node.js >= 16（无需安装任何第三方包）
 *
 * 用法：
 *   node audit-cli.mjs init <output-dir> [--repo <name>] [--profile quick|standard|deep]
 *   node audit-cli.mjs scaffold findings <dir>
 *   node audit-cli.mjs validate findings <findings.json>
 *   node audit-cli.mjs validate ledger <coverage-ledger.json>
 *   node audit-cli.mjs summary <findings.json>
 *   node audit-cli.mjs help
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.join(__dirname, "skills", "security-audit");
const VALIDATE_FINDINGS = path.join(SKILL_DIR, "validate-findings.cjs");
const VALIDATE_LEDGER = path.join(SKILL_DIR, "validate-coverage-ledger.cjs");
const REPORT_SCHEMA = path.join(SKILL_DIR, "report-schema.json");

const PROFILES = new Set(["quick", "standard", "deep"]);

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function fail(message) {
  console.error(`[audit-cli] 错误: ${message}`);
  process.exit(1);
}

function note(message) {
  console.log(`[audit-cli] ${message}`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    fail(`无法读取 JSON 文件 ${file}: ${err.message}`);
  }
}

function nowIso() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// init — 初始化审计运行目录
// ---------------------------------------------------------------------------

function cmdInit(args) {
  const dir = args[0];
  if (!dir) fail("用法: node audit-cli.mjs init <output-dir> [--repo <name>] [--profile quick|standard|deep]");
  const repo = flagValue(args, "--repo") || "unknown-repo";
  const profile = flagValue(args, "--profile") || "standard";
  if (!PROFILES.has(profile)) fail(`未知 profile: ${profile}（可选 ${[...PROFILES].join("/")}）`);

  fs.mkdirSync(dir, { recursive: true });

  const runId = `run-${Date.now()}`;
  const metadata = {
    run_id: runId,
    repo,
    target: null,
    source_ref: null,
    profile,
    scope_paths: [],
    budget: null,
    execution_policy: "sandboxed-source-and-local-only",
    companion_files: [],
    prior_run_paths: [],
    shared_file_owners: {},
    run_status: "in_progress",
    created_at: nowIso(),
  };

  const architecture = `# Architecture Notes (${repo})\n\n<!-- Phase 1 侦察结果：映射信任边界、输入面、组件与数据流 -->\n`;
  const ledger = { schema_version: 1, units: [], updated_at: nowIso() };
  const findings = { schema_version: 1, findings: [], updated_at: nowIso() };

  write(metadata, path.join(dir, "run-metadata.json"));
  write(architecture, path.join(dir, "architecture.md"), { raw: true });
  write(ledger, path.join(dir, "coverage-ledger.json"));
  write(findings, path.join(dir, "findings.json"));

  note(`已在 ${dir} 初始化审计运行目录`);
  note(`  - run-metadata.json   (run_id=${runId}, profile=${profile})`);
  note(`  - architecture.md    (Phase 1 侦察占位)`);
  note(`  - coverage-ledger.json (空覆盖账本骨架)`);
  note(`  - findings.json      (空发现骨架)`);
}

function write(content, file, opts = {}) {
  const payload = opts.raw ? content : JSON.stringify(content, null, 2);
  fs.writeFileSync(file, payload + "\n", "utf8");
}

function flagValue(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}

// ---------------------------------------------------------------------------
// scaffold — 按 report-schema.json 生成空白发现骨架
// ---------------------------------------------------------------------------

function cmdScaffold(args) {
  const dir = args[0];
  if (!dir) fail("用法: node audit-cli.mjs scaffold findings <dir>");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "findings.json");
  const sample = {
    schema_version: 1,
    run_id: "run-<fill-me>",
    findings: [],
    _template: {
      verdict: "confirmed | needs_validation | rejected",
      fingerprint: "唯一指纹，如 CVE-2026-0001 风格或 short-id",
      title: "一句话标题",
      description: "漏洞描述",
      trace: [{ kind: "entrypoint|propagation|sink", file: "", line: 0, scope: "", description: "" }],
      evidence: [{ file: "", line: 0, description: "" }],
      conditions: [{ kind: "authentication_level|authorization_role|...", description: "" }],
      execution: { attacker_perspective: "", payloads: [], instructions: [], observed_result: "" },
      remediation: { strategy: "", code_changes: [] },
      severity: { likelihood: { score: "medium", reason: "" }, impact: { score: "medium", reason: "" }, overall_severity: "medium" },
      confidence: { score: "medium", reason: "" },
    },
    _schema_ref: REPORT_SCHEMA,
    created_at: nowIso(),
  };
  write(sample, out);
  note(`已生成空白发现骨架: ${out}`);
  note(`请参照 report-schema.json 填充 findings 数组，随后运行 validate findings <file>`);
}

// ---------------------------------------------------------------------------
// validate — 调用原仓库零依赖校验器
// ---------------------------------------------------------------------------

function cmdValidate(args) {
  const [kind, file] = args;
  if (!file) fail("用法: node audit-cli.mjs validate <findings|ledger> <file>");
  const script = kind === "ledger" ? VALIDATE_LEDGER : VALIDATE_FINDINGS;
  if (!fs.existsSync(script)) fail(`未找到校验器: ${script}`);
  if (!fs.existsSync(file)) fail(`目标文件不存在: ${file}`);

  const proc = spawnSync(process.execPath, [script, path.resolve(file)], {
    encoding: "utf8",
  });

  if (proc.stdout) process.stdout.write(proc.stdout);
  if (proc.stderr) process.stderr.write(proc.stderr);
  if (proc.status !== 0) {
    fail(`校验未通过（exit=${proc.status}）: ${file}`);
  }
  note(`校验通过: ${kind} → ${file}`);
}

// ---------------------------------------------------------------------------
// summary — 从 findings.json 生成终端摘要
// ---------------------------------------------------------------------------

function cmdSummary(args) {
  const file = args[0];
  if (!file) fail("用法: node audit-cli.mjs summary <findings.json>");
  const data = readJson(file);
  const list = Array.isArray(data.findings) ? data.findings : [];

  const byVerdict = { confirmed: 0, needs_validation: 0, rejected: 0 };
  const bySeverity = {};
  for (const f of list) {
    byVerdict[f.verdict] = (byVerdict[f.verdict] || 0) + 1;
    if (f.verdict === "confirmed" && f.severity?.overall_severity) {
      const s = f.severity.overall_severity;
      bySeverity[s] = (bySeverity[s] || 0) + 1;
    }
  }

  console.log("=".repeat(56));
  console.log("  安全审计结果摘要");
  console.log("=".repeat(56));
  console.log(`  总记录数       : ${list.length}`);
  console.log(`  confirmed      : ${byVerdict.confirmed}`);
  console.log(`  needs_validation: ${byVerdict.needs_validation}`);
  console.log(`  rejected       : ${byVerdict.rejected}`);
  if (Object.keys(bySeverity).length) {
    console.log("-".repeat(56));
    console.log("  严重度分布 (confirmed):");
    for (const [s, n] of Object.entries(bySeverity)) {
      console.log(`    ${s.padEnd(14)} ${n}`);
    }
  }
  console.log("-".repeat(56));
  for (const f of list) {
    const sev = f.verdict === "confirmed" ? ` [${f.severity?.overall_severity}]` : "";
    console.log(`  ${f.verdict.padEnd(16)} ${f.fingerprint}${sev}  ${f.title}`);
  }
  console.log("=".repeat(56));
}

// ---------------------------------------------------------------------------
// help
// ---------------------------------------------------------------------------

function cmdHelp() {
  console.log(`audit-cli — security-audit-skill 工作流编排 CLI（零依赖）

用法:
  node audit-cli.mjs init <output-dir> [--repo <name>] [--profile quick|standard|deep]
      初始化审计运行目录（run-metadata.json / architecture.md /
      coverage-ledger.json / findings.json）

  node audit-cli.mjs scaffold findings <dir>
      按 report-schema.json 生成空白 findings.json 模板

  node audit-cli.mjs validate findings <findings.json>
      调用 validate-findings.cjs 校验发现记录

  node audit-cli.mjs validate ledger <coverage-ledger.json>
      调用 validate-coverage-ledger.cjs 校验覆盖账本

  node audit-cli.mjs summary <findings.json>
      输出审计结果终端摘要（verdict 计数 + 严重度分布）

示例:
  node audit-cli.mjs init ./audits/my-app --repo my-app --profile standard
  node audit-cli.mjs validate findings ./audits/my-app/findings.json
  node audit-cli.mjs summary ./audits/my-app/findings.json
`);
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case "init":
    cmdInit(rest);
    break;
  case "scaffold":
    if (rest[0] !== "findings") fail("scaffold 目前仅支持: findings <dir>");
    cmdScaffold(rest.slice(1));
    break;
  case "validate":
    cmdValidate(rest);
    break;
  case "summary":
    cmdSummary(rest);
    break;
  case "help":
  case "--help":
  case "-h":
  case undefined:
    cmdHelp();
    break;
  default:
    fail(`未知命令: ${cmd}（运行 node audit-cli.mjs help 查看用法）`);
}
