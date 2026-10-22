# security-audit（中文版）

> 复现自 [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill)（MIT License）

一个把编码代理（coding agent）变成**安全审计员**的 Skill：通过侦察、覆盖驱动狩猎、候选验证、结构化输出、独立复核与目标中立报告六阶段，产出可追溯源码证据、可复现、机器可读的安全审计结果。

## 它能做什么

该 Skill 以六个阶段组织一次结构化审计：

1. **侦察（Reconnaissance）** — 在 `architecture.md` 与 `coverage-ledger.json` 中映射架构、信任边界、输入面、既有证据与确定性覆盖单元。
2. **覆盖驱动狩猎（Coverage-led hunting）** — 按账本单元分派隔离的猎人，记录其检查项，由覆盖评审（coverage critic）寻找缺口。
3. **候选验证（Candidate validation）** — 每个唯一候选交给一个全新验证者，尝试证伪它。
4. **结构化输出（Structured output）** — 将 `confirmed` / `needs_validation` / `rejected` 记录写入 `findings.json`，并用 `report-schema.json` 校验。
5. **独立记录复核（Independent record verification）** — 全新代理复核最终源码声明；发生实质替换时再增加一个独立验证者。
6. **目标中立报告（Target-neutral reporting）** — 由已核实的记录与覆盖账本生成 `REPORT.md`、`FINDINGS-DETAIL.md`、`NEEDS-VALIDATION.md`。

三种结论互相独立：`confirmed` 有完整源码溯源与有界的可观测结果；`needs_validation` 是存在精确未决事实、无严重度等级的阻塞候选；`rejected` 是被证伪的候选。

## 目录结构

| 文件/目录 | 用途 |
|-----------|------|
| `skills/security-audit/SKILL.md` | 安装、核心原则、工作流总览与反模式 |
| `skills/security-audit/RECONNAISSANCE.md` | 阶段 1 侦察提示词与综合指引 |
| `skills/security-audit/HUNTING.md` | 阶段 2 编排、狩猎方法与验证规则 |
| `skills/security-audit/ATTACK-CLASSES.md` 等 | 各领域攻击类别提示词（内存安全、LLM、Web、客户端、供应链、云、协议、资源耗尽、数据隔离、桌面/移动） |
| `skills/security-audit/report-schema.json` | 三种 verdict 的 JSON Schema |
| `skills/security-audit/validate-findings.cjs` | 零依赖 `findings.json` 校验器 |
| `skills/security-audit/validate-coverage-ledger.cjs` | 零依赖覆盖账本校验器 |
| `audit-cli.mjs` | **本复现新增**：零依赖工作流编排 CLI |

## 快速开始

### 安装 Skill

```bash
npx skills add https://github.com/cloudflare/security-audit-skill \
  --skill security-audit
```

全局安装请追加 `--global`。

### 使用

让编码代理在目标代码库中执行：

```
security audit this codebase
find security vulnerabilities in ./src
do a security review, output to ~/audits/my-project
```

请求命中安全审计/漏洞检索等触发词时，Skill 会自动激活。

## 本复现的优化内容

在保留原仓库全部能力的基础上，新增了一个**可执行的编排层** `audit-cli.mjs`，将"提示词编排 + JSON 校验"升级为命令行流水线：

| 命令 | 作用 |
|------|------|
| `node audit-cli.mjs init <dir> [--repo <name>] [--profile quick\|standard\|deep]` | 一键初始化审计运行目录（run-metadata / architecture / coverage-ledger / findings 骨架） |
| `node audit-cli.mjs scaffold findings <dir>` | 按 `report-schema.json` 生成空白发现模板，杜绝手写字段错漏 |
| `node audit-cli.mjs validate findings <file>` | 复用原仓库 `validate-findings.cjs` 做 schema 校验 |
| `node audit-cli.mjs validate ledger <file>` | 复用原仓库 `validate-coverage-ledger.cjs` 做覆盖账本校验 |
| `node audit-cli.mjs summary <findings.json>` | 终端输出审计摘要（verdict 计数 + 严重度分布 + 逐条指纹） |

设计要点：保持零第三方依赖、复用原仓库校验器保证口径一致、`run-metadata.json` 与三份运行产物骨架符合原 Skill 的写隔离约定。

```bash
# 示例
node audit-cli.mjs init ./audits/my-app --repo my-app --profile standard
node audit-cli.mjs validate findings ./audits/my-app/findings.json
node audit-cli.mjs summary ./audits/my-app/findings.json
```

## 设计原则

- **只确认已确立的边界失效。** 有源码依据但被阻塞的线索记为 `needs_validation`。
- **对抗式验证。** 检查发现的代理绝不是发现它的代理。
- **严重度需要影响。** 似然 × 影响，而不是偏离检查清单。
- **纵深防御缺口不是漏洞。** 第一层已阻止攻击时，缺第二层只是加固建议。
- **多轮运行提升覆盖。** 测试运行中，单轮约发现重复轮次总漏洞数的一半。

## 许可

MIT — 见 [LICENSE](LICENSE)。更多信息见 [REPRODUCTION-NOTES.md](REPRODUCTION-NOTES.md)。
