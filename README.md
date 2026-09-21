> **2026-09-06 伴侣模式更新：** Linux/Node 首页新增成年虚拟角色与恋爱故事模式；以下原有关系分析内容仍适用于 `/legacy/`。新版的数据边界、分期范围、图片配置和迁移步骤见 [Companion alpha 发布说明](docs/COMPANION_RELEASE.md)。新模式的私有对话保存在服务端，不沿用旧版“全部仅本地”的承诺。

# GAME · Signal Lab

一个面向成年人的本地优先关系事件记录与信号分析系统。它帮助用户区分事实与猜测、理解带不确定性的互动证据、准备低压力回应，并用真实结果修正原来的判断。

> 看懂信号，保留自己。明确表达和双方同意始终高于任何推断。

## 双平面产品

GAME 把高度敏感的关系记录与可选在线能力分开：

| 平面 | 处理内容 | 存储与出站边界 |
|---|---|---|
| 本地关系平面 | 个人表达、匿名关系档案、事件、复盘、规则分析 | 仅保存在当前浏览器的 `localStorage`；可由用户手动导入/导出明文 JSON；应用不会把这些内容自动发送到服务器 |
| 可选平台平面 | 账号、会员、Agent 授权、外部 AI 明示同意、管理员配置、最小审计与账号隔离的个人 RAG | 由同源 Node/SQLite + Qdrant 或 Sites Worker/D1 服务处理；用户确认同意并提交 Agent 问题时，匿名档案先更新到当前账号的 RAG，再由 DeepSeek 只检索该账号资料 |

本地规则引擎不依赖账号或 AI。即使平台服务未启用，关系日记、双轴分析和复盘仍可在浏览器中使用。

## 当前能力

### 本地关系平面

- 18+ 使用确认与版本化条款记录；
- 个人目标、表达风格、焦虑触发点与自身边界；
- 匿名关系档案与已知边界；
- 结构化事件：事实、解释、感受、回应与边界状态；
- 双轴规则引擎：
  - 证据等级：弱 / 中 / 强；
  - 行动策略：观察 / 自然回应 / 降级 / 停止；
- 明确拒绝和不舒服不可被积极信号覆盖；
- 持续回避只能降级，不能生成普通邀约；
- 证据依据、替代解释、不确定性和三个个性化回应；
- 真实结果复盘覆盖旧的行动策略；
- 本地 JSON 导入/导出、事件删除、档案级联删除和全量清空；
- schema v2 迁移、损坏数据恢复保护与存储失败提示。

### 可选平台平面

- 用户名/密码账号、每个新用户默认 50 次 AI 调用额度、个人持续 Agent 授权和全局总闸；
- 当前版本的外部 AI 数据处理明示同意，可随时撤回；
- 服务端固定安全提示词与 DeepSeek V4 流式 Agent；
- 仅允许 `deepseek-v4-flash`（默认）和 `deepseek-v4-pro`；
- DeepSeek API Key 由服务端使用 AES-256-GCM 加密，浏览器永远读不到密钥；
- 用户确认当前外部 AI 条款并提交 Agent 问题时，客户端会更新自己的匿名资料到个人 RAG；Linux/Node 生产检索使用 Qdrant，始终按服务端会话 `user_id` 隔离，管理员看不到正文；
- 管理员控制台：用户与授权、服务配置、全局开关、最小化行为审计，以及加密的 Agent/故事消息记录；
- Agent/故事消息和模型回复以 AES-256-GCM 加密归档，SSE 只向当前会话转发经过清洗的 assistant 内容与终止状态；
- 动态 `robots.txt`、`sitemap.xml`，管理员与 API 路径禁止索引。

Agent 最终可用条件为：

```text
provider configured and enabled
AND globalEnabled
AND (
  administrator
  OR (active account AND (included AI calls remaining OR per-user ongoing Agent grant))
)
AND current explicit external-AI consent
```

会员或管理员身份都不能替代用户对外部 AI 数据处理的明示同意。

## 本地预览

需要 Node.js `>=22.18` 与 Python 3。不要直接双击 `index.html`；`file://` 下的模块和 `localStorage` 行为不稳定。

```bash
npm ci
npm run serve
```

打开 `http://localhost:4173`。这个模式使用仓库内的 `runtime-config.js`，平台 API 关闭，所有关系功能保持本地运行。

## Node / SQLite + Qdrant 运行

Node 适配器会同时提供静态站、同源 API、动态 SEO 和管理员控制台：

```bash
npm start
```

首次启动前，通过部署平台的秘密管理功能配置：

- `DATABASE_PATH`：位于公开静态目录之外的 SQLite 文件；
- `CONFIG_MASTER_KEY`：32 字节 base64/base64url 或 64 位十六进制主密钥；
- `PUBLIC_ORIGIN`：精确的公开 Origin；
- `ADMIN_BOOTSTRAP_PASSWORD`：仅空数据库首次创建管理员 `Drac` 时使用的强密码。

不要把真实密码、主密钥或 API Key 写入仓库、命令历史、日志或前端配置。管理员创建成功后应从运行环境移除引导密码；Node 适配器要求普通密码至少 12 个字符。完整说明见 [`server/README.md`](server/README.md)。

Linux/Node 生产环境还需要一个私有 Qdrant 实例（默认 `127.0.0.1:6333`）。
通过 `VECTOR_DB_URL`、`VECTOR_DB_COLLECTION` 和可选的 embedding provider
配置运行时向量化。每次 upsert、search、delete 都带当前会话 `user_id` 的
payload filter；未配置 Qdrant 时的 SQLite 关键词回退仅用于本地测试，不能
作为生产 RAG 部署。

## Sites / Worker / D1 构建

```bash
npm run build:sites
```

构建产物写入 `dist/`：

- `dist/server/index.js`：Worker 入口；
- `dist/static/`：主站与管理员控制台；
- `dist/.openai/hosting.json`：Sites 绑定；
- `dist/.openai/drizzle/`：D1 迁移。

Sites 的运行时秘密同样只能通过平台配置注入。部署说明见 [`sites-runtime/README.md`](sites-runtime/README.md)。

## 质量门

```bash
npm run check
```

质量门覆盖：

- 浏览器、Node 后端、Sites Worker 与构建脚本语法；
- 规则引擎安全真值表；
- schema、迁移、导入与恢复保护；
- 账号、CSRF、Origin、会员/授权/同意真值表；
- DeepSeek 配置加密、模型 allowlist 与清洗后的 SSE；
- 审计最小化、事务原子性和正文不落库；
- 项目结构与本地/平台数据边界。

发布前还应完成 Chrome 桌面与 390px 核心流程验收。

## 目录

```text
.
├── index.html / styles.css / app.js
├── src/                    # 本地 schema、规则引擎与平台客户端
├── admin/                  # 管理员控制台
├── server/                 # Node + SQLite 适配器
├── sites-runtime/          # Sites Worker + D1 适配器
├── db/ / drizzle/          # D1 schema 与迁移
├── build-sites/            # Sites 构建
├── tests/
├── docs/
├── AGENTS.md
└── .openai/hosting.json
```

## 隐私限制

本地关系记录和导出的 JSON 都是明文：

- 共享设备或同一浏览器账户的其他人可能访问；
- 浏览器清理、无痕模式和设备故障可能造成数据丢失；
- 下载、同步或备份工具可能复制导出文件；
- 请使用匿名代号，不保存真实姓名、地址、定位、身份证明或不必要的完整聊天记录。

平台审计只记录账号/管理/Agent 操作的最小元数据：动作、资源、结果、固定原因代码、请求 ID 和时间。用户明确发送的 Agent/故事消息与模型回复另行使用 AES-256-GCM 加密存档，授权管理员可为支持与排障查看，且读取行为会被审计。系统不保存系统提示词、密码、API Key、IP 地址或 User-Agent；本地关系日记与对象档案 RAG 正文不在管理页面展示。

## 文档

- [正式 PRD](docs/PRD.md)
- [产品战略简报](docs/PRODUCT_BRIEF.md)
- [架构](docs/ARCHITECTURE.md)
- [数据模型](docs/DATA_MODEL.md)
- [安全、同意与隐私](docs/SAFETY.md)
- [Linux 部署与更新](docs/DEPLOY_LINUX.md)
- [原始 GAME 资料评审与安全转换](docs/CONTENT_EVALUATION.md)
- [管理员 API 契约](admin/API_CONTRACT.md)
- [Agent 协作契约](AGENTS.md)
- [安全报告](SECURITY.md)

## 贡献边界

任何规则、回应、Agent 提示词、授权或数据处理变更都必须遵守 `AGENTS.md` 和 `docs/SAFETY.md`。Issue、PR、测试、日志和截图禁止使用真实关系数据或秘密。

## 免责声明

本项目用于关系教育、记录与自我复盘，不提供医疗、心理、法律或人身安全专业意见，也不承诺建立或维持任何具体关系。
