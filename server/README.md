# GAME Node 后端运行说明

这个目录提供无第三方运行时依赖的 Node 后端：SQLite 迁移、账号与会员、管理员控制面、外部 AI 明示同意、加密 DeepSeek 配置、最小化审计，以及不落盘正文的 SSE 代理。

## 运行要求

- Node.js `>=22.18`，因为后端使用内置 `node:sqlite`。
- 静态站与 API 必须部署在同一公开 Origin；Node 服务通常置于 TLS 反向代理之后。
- `DATABASE_PATH` 必须位于任何静态发布目录之外，并由服务账号独占。

必需配置：

| 变量 | 用途 |
| --- | --- |
| `DATABASE_PATH` | SQLite 文件路径；不能放在公开静态目录 |
| `CONFIG_MASTER_KEY` | 32 字节的 base64/base64url 或 64 位十六进制主密钥；应来自秘密管理服务 |
| `PUBLIC_ORIGIN` | 浏览器访问的精确 Origin，例如 `https://game.example`，不能带路径 |
| `ADMIN_BOOTSTRAP_PASSWORD` | 仅空数据库首次启动时创建固定管理员 `Drac`；成功创建后从运行环境移除 |

Linux/Node 生产环境还必须配置 Qdrant 向量库：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `VECTOR_DB_URL` | 空（测试回退） | 私有 Qdrant 地址，例如 `http://127.0.0.1:6333` |
| `VECTOR_DB_COLLECTION` | `game_signal_lab` | 所有用户共享的 collection；每个 point 通过 `user_id` payload 隔离 |
| `VECTOR_DB_API_KEY` | 空 | Qdrant API Key（若实例启用鉴权） |
| `VECTOR_DIMENSIONS` | `384` | collection 向量维度，必须与 embedding provider 一致 |
| `EMBEDDING_API_URL` | 空 | 可选的内部 OpenAI-compatible embedding endpoint |
| `EMBEDDING_API_KEY` | 空 | embedding endpoint 的运行时秘密 |
| `EMBEDDING_MODEL` | 空 | embedding 模型名 |

应用第一次同步档案时会创建 collection。每次向量写入、搜索、删除都由服务端
强制带当前会话 `user_id` payload filter，并二次校验返回 payload；客户端不能
指定 owner。没有 `VECTOR_DB_URL` 只允许本地测试使用 SQLite 关键词回退，不应
作为生产部署。

常用可选配置：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `NODE_ENV` | 未设置 | 生产设为 `production` |
| `HOST` | `127.0.0.1` | 监听地址 |
| `PORT` | `8787` | 监听端口 |
| `COOKIE_SECURE` | 生产为 `true` | 生产环境不能关闭 Secure Cookie |
| `TRUSTED_PROXY_ADDRESSES` | 空 | 逗号分隔的反向代理精确 IP；只有这些对端提供的 `X-Forwarded-For` 才会用于限流 |

不要把秘密写进仓库、命令示例、日志或前端运行时配置。首次启动可由部署平台的秘密管理功能临时注入引导密码；数据库已有管理员后，该变量不会重置 `Drac` 密码。

## 启动与检查

在项目根目录运行：

```sh
npm start
```

发布前运行完整质量门：

```sh
npm run check
```

只验证 Node 后端：

```sh
node --test tests/backend.test.mjs
```

## 生产边界

- 反向代理负责 HTTPS，并应保持同源 `/api` 与 `/runtime-config.js` 路由。
- `/robots.txt` 与 `/sitemap.xml` 由后端根据已校验的 `PUBLIC_ORIGIN` 动态生成；首页 HTML 的相对 canonical 会在部署域名下解析。
- 若代理终止 TLS，配置其精确地址到 `TRUSTED_PROXY_ADDRESSES`；后端不会无条件信任 `X-Forwarded-For`。
- SSE 路由需要关闭代理缓冲，并允许至少 120 秒的上游响应窗口。
- DeepSeek 上游固定为 `https://api.deepseek.com/`，只允许 `deepseek-v4-flash` 与 `deepseek-v4-pro`；默认使用 Flash，并由服务端关闭 thinking 模式。
- API Key 使用 AES-256-GCM 加密后存入 SQLite；管理员读取接口只返回是否已配置。
- Agent 仅发送用户本次明确提交的消息。客户端 `system` 消息会被拒绝，服务端固定注入安全提示词。
- prompt、模型正文与自由文本审批理由均不写入数据库；审计只保存动作、资源、结果、固定 reason code、请求 ID 和时间。
- Agent 同时受当前外部 AI 同意、相互独立的 provider 开关与全局开关、会员状态、个人授权、每用户频率与并发、全局并发约束。
- 个人 RAG 只来自用户显式同步的匿名文档；Node 生产检索走 Qdrant 向量库，
  撤回同意或清空档案会删除该用户的 SQLite 缓存和 Qdrant points。

管理员前端使用 `/api/admin/v1`。登录前先获取 `/api/auth/csrf`，随后以用户名 `Drac` 和首次引导时设置的密码创建管理员会话；普通会员即使密码正确也不能通过管理员会话接口登录。
