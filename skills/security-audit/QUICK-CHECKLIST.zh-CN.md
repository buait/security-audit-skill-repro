# 安全审计快速核查清单（中文版）

> 本清单由 security-audit skill 各攻击面文档提炼而成，供快速自查与审计起步使用。
> 完整方法论请阅读 [SKILL.md](SKILL.md) 及各领域文档；本清单不替代完整审计流程。

## 一、侦察与信息暴露（RECONNAISSANCE）

- [ ] 是否存在调试接口、内部端点、硬编码密钥或敏感配置被提交到仓库
- [ ] 错误信息是否泄露堆栈、SQL、内部路径或版本细节
- [ ] 日志是否记录凭据、Token、Cookie 等敏感数据
- [ ] 未使用的依赖与开发依赖是否被打入生产包

## 二、Web 协议与认证（WEB-PROTOCOL-AND-AUTH）

- [ ] 会话 Cookie 是否设置 Secure、HttpOnly、SameSite
- [ ] 登录/鉴权是否对暴力破解与撞库有速率限制
- [ ] 密码重置、两步验证、会话失效流程是否存在绕过
- [ ] JWT / Token 的签名算法、过期时间、吊销机制是否健全
- [ ] 是否依赖客户端可控参数做权限判断（如 role 字段）

## 三、客户端与浏览器侧（CLIENT-SIDE）

- [ ] 前端是否将敏感逻辑或密钥直接暴露给用户
- [ ] 是否存在存储型/反射型 XSS 的输入点
- [ ] 是否校验外部跳转 URL（open redirect）
- [ ] 文件上传的类型、大小、内容是否双重校验

## 四、云与部署（CLOUD-AND-DEPLOYMENT）

- [ ] 云存储桶 / 对象存储 ACL 是否最小化
- [ ] 部署配置中是否包含明文密钥或过度授权角色
- [ ] 容器镜像是否以非 root 运行、基础镜像是否更新
- [ ] 公网端口与安全组是否只暴露必要服务

## 五、数据隔离与生命周期（DATA-ISOLATION-AND-LIFECYCLE）

- [ ] 多租户数据是否通过租户 ID 隔离，而非仅靠前端过滤
- [ ] 删除接口是否真正删除（软删/硬删语义是否一致）
- [ ] 备份、归档、导出过程是否含未授权数据
- [ ] PII 数据的保留期限与删除策略是否明确

## 六、桌面 / 移动 / 本地 IPC（DESKTOP-MOBILE-AND-LOCAL-IPC）

- [ ] 本地存储是否加密，密钥是否硬编码
- [ ] IPC / RPC 通道是否校验对端身份
- [ ] 导出/分享功能是否剥离元数据与敏感信息

## 七、协议、RPC 与消息（PROTOCOLS-RPC-AND-MESSAGING）

- [ ] 消息协议是否校验长度、类型、来源（反序列化攻击）
- [ ] 消息队列 / 事件总线的鉴权与授权
- [ ] WebSocket / gRPC 等长连接是否做过认证与限流

## 八、资源耗尽与可用性（RESOURCE-EXHAUSTION-AND-AVAILABILITY）

- [ ] 上传、解析、渲染是否设置大小/复杂度上限
- [ ] 正则、递归、解压是否存在 ReDoS / 解压炸弹风险
- [ ] 外部调用是否设置超时与重试上限
- [ ] 是否存在未限流的公开昂贵操作（如导出、批量查询）

## 九、供应链与发布（SUPPLY-CHAIN-AND-RELEASE）

- [ ] 依赖锁定（lockfile）是否入库，依赖来源是否可信
- [ ] CI/CD 是否校验产物签名与来源
- [ ] 发布流程是否有人工审批与回滚预案
- [ ] 是否被已知 CVE 影响的依赖版本

## 十、内存安全与二进制（MEMORY-SAFETY-AND-BINARY）

- [ ] 原生代码是否在边界处做长度/索引校验
- [ ] 是否使用不安全函数（strcpy、sprintf 等）处理外部输入
- [ ] 解析器/解码器对畸形输入是否健壮

## AI / LLM 专项（AI-AND-LLM）

- [ ] 提示注入是否被当作代码/指令执行
- [ ] 模型输出是否经过安全过滤后进入系统命令或渲染
- [ ] 训练数据 / RAG 数据是否含敏感或个人数据

## 使用提示

- 勾选完成后，将确认的发现按 [report-schema.json](report-schema.json) 写入 findings.json。
- 使用 `node risk-score.cjs findings.json` 生成风险矩阵与修复优先级。
- 使用 `node validate-findings.cjs findings.json` 校验格式合规。
