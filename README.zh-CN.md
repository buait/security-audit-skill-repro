# security-audit-skill-repro（中文说明）

> 本仓库是 [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) 的独立复现与增强版。
> 原项目为 Cloudflare 官方出品的 coding-agent 安全审计技能包，本文档提供中文说明；英文原版见 [README.md](README.md)。

## 这是什么

一套给 AI coding agent（如 Claude）使用的**安全审计技能**：以源码为第一证据，按
「侦察 → 猎杀 → 验证 → 汇总」的流程，帮助审计代码库、API、服务、CLI 工具的安全漏洞，
并产出可机器校验的 findings 报告。

- **引导模式（Guidance mode）**：用于安全问答、定向审查、方法论咨询，不自动跑完整流程。
- **完整审计模式（Full audit mode）**：用户明确要求全量审计 / 渗透测试时，执行六阶段完整工作流并产出报告文件。

## 目录结构

```
skills/security-audit/
├── SKILL.md                  # 技能主入口：模式、流程、隔离规则
├── report-schema.json        # findings.json 数据规范
├── validate-findings.cjs     # findings.json 格式校验器（原项目）
├── validate-coverage-ledger.cjs  # 覆盖台账校验器（原项目）
├── risk-score.cjs            # 【新增】风险评分器：聚合为风险矩阵与修复优先级
├── QUICK-CHECKLIST.zh-CN.md  # 【新增】中文快速核查清单
├── *.md                      # 各攻击面领域文档（侦察/认证/客户端/云/数据/供应链等）
└── *.test.cjs                # 配套单元测试
```

## 新增能力（相对原项目）

1. **风险评分器 `risk-score.cjs`**
   - 读取符合 report-schema 的 findings.json，输出：
     - 总体风险分（0–100，按严重度 × 置信度加权）
     - likelihood × impact 风险矩阵
     - 按攻击面（scope）的发现分布
     - 按严重度 + 置信度排序的修复优先级清单
   - 支持 `--json` 输出，便于 CI 集成。
   - 用法：`node risk-score.cjs findings.json` 或 `node risk-score.cjs findings.json --json`
2. **中文快速核查清单 `QUICK-CHECKLIST.zh-CN.md`**
   - 十个领域 + AI/LLM 专项的速查项，适合快速自查与审计起步。
3. **中文说明**：本文件。

## 快速上手

```bash
# 1. 校验发现报告格式
node validate-findings.cjs findings.json

# 2. 生成风险评分与修复优先级
node risk-score.cjs findings.json

# 3. 运行单元测试（Node 18+）
node --test risk-score.test.cjs
node --test validate-findings.test.cjs
```

## 说明

- 原仓库 LICENSE 已完整保留（见 [LICENSE](LICENSE)）。
- 复现与优化细节见 [REPRODUCTION-NOTES.md](REPRODUCTION-NOTES.md)。
