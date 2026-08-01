# 数据模型

GAME 使用两套彼此隔离的数据模型：

- **本地关系模型**：浏览器 `localStorage` 中的匿名关系源数据；
- **平台模型**：账号、会员、授权、同意、加密配置和最小审计。

本地关系模型没有服务端映射表。注册、登录或使用管理员控制台不会上传它。

## 1. 本地关系模型

### 1.1 版本

- 本地键：`game-signal-lab:v2`
- `state.version`: `2`
- 旧键 `game-signal-lab:v1` 在读取时迁移，成功保存后移除。
- 最大备份：20 MB。
- 最多 500 个档案和 5000 条事件。

### 1.2 State

```text
State
├── version
├── adultConfirmed
├── adultConfirmedAt
├── agePolicyVersion
├── profile
├── contacts[]
└── events[]
    ├── source fields
    ├── review?
    └── analysis (runtime derived, not serialized)
```

### 1.3 Profile

| 字段 | 类型 | 最大长度 | 敏感级别 | 用途 |
|---|---|---:|---|---|
| `name` | string | 40 | 中 | 本地称呼 |
| `goal` | string | 1000 | 高 | 当前关系目标 |
| `voice` | enum | — | 低 | `natural / gentle / direct / humor` |
| `boundaries` | string | 1000 | 高 | 用户希望坚持的边界 |
| `anxiety` | string | 1000 | 高 | 焦虑触发点 |

### 1.4 Contact

| 字段 | 类型 | 最大长度 | 说明 |
|---|---|---:|---|
| `id` | safe id | 120 | 本地关联键 |
| `alias` | string | 40 | 必填匿名代号，不应是真名/账号 |
| `stage` | string | 40 | 当前阶段 |
| `context` | string | 1200 | 最少必要的认识背景 |
| `goal` | string | 600 | 对方已公开表达的目标 |
| `boundary` | string | 600 | 对方已明确的边界 |
| `createdAt` | ISO datetime | — | 创建时间 |

匿名代号在本地大小写归一后唯一。删除 Contact 必须级联删除关联 Event。

### 1.5 Event

| 字段 | 类型 | 最大长度 | 说明 |
|---|---|---:|---|
| `id` | safe id | 120 | 事件主键 |
| `contactId` | safe id | 120 | Contact 外键 |
| `date` | ISO date | 10 | 发生日期 |
| `stage` | string | 40 | 当时阶段 |
| `scene` | string | 300 | 场景 |
| `fact` | string | 3000 | 可观察事实 |
| `interpretation` | string | 1500 | 用户解释 |
| `feeling` | string | 300 | 用户感受 |
| `reply` | string | 600 | 用户回应 |
| `signals` | enum[] | — | 可确认的证据线索 |
| `boundaryStatus` | enum | — | `clear / uncertain / stop` |
| `createdAt` | ISO datetime | — | 创建时间 |
| `review` | object/null | — | 真实结果 |
| `analysis` | object | — | 当前引擎运行时派生值 |

允许的 `signals`：

- `directInterest`
- `futurePlan`
- `repeatedInitiative`
- `detailedFollowup`
- `politeOnly`
- `delayAvoidance`
- `explicitDecline`
- `discomfort`

### 1.6 Review

| 字段 | 类型 | 最大长度 | 说明 |
|---|---|---:|---|
| `actionTaken` | string | 1200 | 用户实际行动 |
| `result` | string | 2000 | 对方真实回应 |
| `learning` | string | 1200 | 判断调整 |
| `naturalness` | string | 40 | 行动是否符合本人 |
| `nextStep` | string | 40 | 当前下一步 |
| `outcome` | enum | — | `unknown / continued / avoidance / declined / discomfort` |
| `updatedAt` | ISO datetime | — | 最后复盘时间 |

`declined` 和 `discomfort` 强制当前策略为 `stop`；`avoidance` 强制至少为 `deescalate`。

### 1.7 Analysis

Analysis 不是事实，不写入 `localStorage` 或导出备份，也不作为导入时可信字段。导入或加载后由当前引擎重建。

核心字段：

- `engineVersion`
- `generatedAt`
- `score`：内部解释性分数，不是概率
- `strength`：兼容展示值；停止状态为 `stop`
- `evidenceLevel`: `weak / medium / strong`
- `actionPolicy`: `observe / engage / deescalate / stop`
- `stopReason`: `no_contact / discomfort / decline / boundary / ""`
- `responseMode`: `message / action`
- `boundaryStatus`
- `informationQuality`
- `evidenceReasons[]`
- `summary`
- `alternatives[]`
- `uncertainties[]`
- `personalNotes[]`
- `responses[]`
- `stopCondition`

当 `stopReason` 为 `no_contact` 时，`responseMode` 为 `action`，`responses[]` 只包含不发送消息、不绕过边界等行动。

### 1.8 删除语义

- 删除 Event：删除其 Analysis 和 Review。
- 删除 Contact：级联删除所有关联 Event。
- 清空全部：移除 v2 与旧版 `localStorage` 键，清空年龄确认并重新显示年龄门。

### 1.9 导入导出

- 导出是 UTF-8 明文 JSON，不加密。
- 导出只包含源数据，不包含可重建的 `analysis`。
- 导入前验证 allowlist、枚举、ID、长度、数量、别名唯一性、日期和版本。
- 任何会造成记录丢弃或字段截断的输入都明确拒绝。
- 未知字段和旧 `analysis` 丢弃。
- 导入替换当前本地数据，并使用当前引擎重新分析。
- v1 重复匿名代号按稳定后缀迁移，并保留 ID 与事件关联。
- 未来 schema 版本不会被降级或自动覆盖。

## 2. 平台模型

平台模型存在两个适配器：

- Node：SQLite，递增整数主键，`server/database.js` 管理迁移；
- Sites：D1，字符串主键，`db/schema.ts` 与 `drizzle/` 管理迁移。

列名和密码派生细节可能不同，但下面的数据分类和禁止项必须一致。

### 2.1 平台实体

| 实体 | 典型字段 | 用途 |
|---|---|---|
| `users` | id、username/norm、password hash、role、version、disabled、timestamps | 登录身份和乐观锁 |
| `memberships` | user id、plan、status、expiresAt、timestamps | 会员有效性 |
| `sessions` | session token hash、CSRF hash、expiresAt、lastSeen | 服务端会话 |
| `external_ai_consents` | user id、policyVersion、consentedAt、revokedAt、updatedAt | 当前外部 AI 明示同意 |
| `agent_access_policy` | singleton、globalEnabled、updatedBy/At | Agent 全局总闸 |
| `agent_member_grants` | user id、enabled、updatedBy/At | 每用户 Agent grant |
| `provider_configs` | provider、encrypted key parts、algorithm/key version、model、enabled、updatedBy/At | DeepSeek 配置 |
| `audit_events` | actor、action、resource、result、reasonCode、requestId、occurredAt | 最小行为审计 |
| `user_rag_documents` | user id、external id、kind、title、content、content hash、timestamps | 用户明确同步后的个人知识库文档；严格按 owner 隔离 |
| `auth_rate_limits`（Sites） | 不可逆 key hash、scope、窗口/过期、count | 有界认证频率控制，不属于审计 |

`user_rag_documents` 不是管理员可见的行为日志。Linux/Node 生产适配器把文档
向量写入 Qdrant 的私有 collection，并在 upsert、search、delete 的每一个请求
中强制使用当前会话的 `user_id` payload filter；SQLite 表只作为事务性同步
缓存与恢复锚点。Node 测试环境未配置 Qdrant 时才使用 SQLite FTS5/关键词回退。
Sites/D1 受运行时能力限制，保留 owner + 时间索引和有界关键词回退；若需要
生产级语义检索，应使用 Linux/Node + Qdrant 部署。服务端不会接受客户端传入
的 owner ID，也不会把个人知识库内容写入审计。

个人知识库的生命周期：

1. 用户在当前外部 AI 同意下明确点击同步，提交经过 allowlist、长度、数量和匿名 ID 校验的 profile/contact/event 文档；
2. 服务端以当前会话用户替换其自己的文档集合，并写入一条不含正文的 `knowledge.sync` 审计元数据；
3. Agent 请求只按当前用户最后一条问题检索自己的文档，并把有界片段作为服务端私有上下文发送给 DeepSeek；
4. 用户删除知识库或撤回外部 AI 同意时，服务端删除该用户全部 RAG 文档；本机 localStorage 不受影响。

Sites `users` 可包含部署适配器使用的可选 email、盐、迭代数与 `mustChangePassword`；主产品身份仍以用户名为准。管理员列表只返回契约允许的脱敏/空值字段。

### 2.2 账号与会话

- 密码只保存强密码哈希和适配器需要的参数，不保存明文。
- session token 与 CSRF token 只保存哈希。
- 浏览器 Cookie 不保存到 `localStorage`；生产会话使用 Secure、HttpOnly、SameSite=Strict。
- 普通用户角色为 member，管理员角色为 admin。
- 管理员 `Drac` 仅在首次引导创建；引导密码来自运行时秘密，不写入表或迁移。

### 2.3 会员与授权

管理端 `membershipEnabled` 展示条件：

```text
plan is member
AND status is active
AND expiresAt is null or in the future
AND user is not disabled
```

Agent 的服务端业务授权按普通用户角色、会员记录状态、到期时间和个人 grant 判断；它不使用前端展示布尔值作为授权依据：

```text
globalEnabled
AND (
  role is admin
  OR (
    role is member
    AND membership status is active
    AND membership is unexpired
    AND member grant enabled
  )
)
```

实际 Agent 可用还必须同时满足 provider 已配置并启用、模型受支持、API Key 可解密以及当前外部 AI 同意。

授权变更使用用户 `version` / `expectedVersion` 乐观锁。每次只改变一个授权字段，并使用固定 `reasonCode`：

- `membership_approved`
- `membership_revoked`
- `agent_approved`
- `agent_revoked`
- `security_review`
- `account_request`

不保存自由文本审批理由。

### 2.4 外部 AI 同意

当前政策版本由服务端常量维护。有效同意要求：

- `policyVersion` 等于当前版本；
- `consentedAt` 存在；
- `revokedAt` 不存在。

同意与 prompt 分开写入。发送 Agent 消息不能创建、刷新或推断同意；撤回后历史记录只保留同意元数据，新调用立即被拒绝。

### 2.5 Provider 配置

持久化内容：

- 固定 provider 名 `deepseek`；
- 模型：`deepseek-v4-flash` 或 `deepseek-v4-pro`；
- enabled；
- AES-256-GCM 密文及适配器所需的 IV/tag 表示；
- algorithm、keyVersion、updatedBy、timestamps。

不持久化/不返回：

- 明文 API Key；
- 可用于猜测密钥的尾号或掩码；
- 可编辑 base URL；
- provider 原始响应。

读取接口只返回 `apiKeyConfigured: boolean` 和非秘密配置。

### 2.6 审计事件

允许字段：

- actor user id；
- action；
- target/resource type 与 id；
- success/failure；
- 固定 reason code；
- request id；
- occurred/created time。

禁止字段：

- profile、Contact、Event、Review、Analysis；
- Agent prompt/reply、系统提示或 reasoning；
- 密码、API Key、Cookie/CSRF；
- 自由文本理由；
- IP 地址或 User-Agent；
- 任意正文摘要或 metadata JSON。

Node schema v2 会重建旧审计表并移除历史 `ip_hash`、`user_agent_hash` 和自由 metadata 列。Sites 的审计 schema 从创建开始就不包含这些网络指纹字段。

### 2.7 Agent 请求生命周期

Agent 消息是短生命周期的请求数据：

1. 浏览器在用户明确提交后发送受限消息数组；
2. 服务端在内存中加入固定 system prompt；
3. 服务端解密 API Key 并调用 provider；
4. 服务端解析、清洗并流式返回输出；
5. 请求结束、超时或取消后释放正文和密钥引用；
6. 数据库只记录不含正文的调用结果审计事件。

任何 platform 表都不得增加 `prompt`、`response`、`conversation`、`system_prompt` 或关系内容字段。

## 3. 跨平面不变量

- `State`、`Profile`、`Contact`、`Event`、`Review`、`Analysis` 没有平台外键。
- 用户 ID 不写入本地关系对象。
- 管理员查询不返回本地关系或 Agent 正文。
- 平台客户端不导入本地 state schema，也不接收本地 state 参数。
- 本地导出不包含账号、Cookie、CSRF、会员、同意、grant 或 provider 配置。
- 平台数据库备份不应包含任何关系正文或 Agent 正文。

## 4. 隐私说明

`localStorage` 不是保险箱。共享设备、同源脚本、浏览器同步/清理、无痕窗口和下载文件都可能造成泄露或丢失。

平台数据库也不是端到端加密保险箱：账号和授权元数据由服务端可用形式处理；用户明确提交给 Agent 的文本会由 DeepSeek 接收。使用 Agent 前必须展示当前数据处理说明，并建议只提交最少必要的匿名内容。
