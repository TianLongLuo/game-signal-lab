# AGENTS.md

本文件是所有在 GAME Signal Lab 仓库中工作的 Agent 的强制协作契约。

## 项目使命

GAME 是面向成年人的关系教育与成长工具。它帮助用户记录关系事件、区分事实与猜测、理解带不确定性的互动信号，并依据真实反馈复盘。它不读心、不承诺“拿下”任何人，也不提供突破拒绝、制造依赖或操控他人的方法。

项目采用双平面架构：

- 关系日记、规则引擎和复盘保持在浏览器本地；
- 账号、会员、外部 AI 同意、Agent 授权、加密 DeepSeek 配置和最小审计由可选同源服务处理。

任何变更都必须保护这条边界。

## 事实来源优先级

出现冲突时，按以下顺序处理：

1. `docs/SAFETY.md`：不可覆盖的安全、同意、Agent 与隐私边界。
2. `docs/PRD.md`：当前版本范围、FR/NFR 与验收标准。
3. `docs/DATA_MODEL.md` 与 `docs/ARCHITECTURE.md`：数据与技术约束。
4. `admin/API_CONTRACT.md` 与 `sites-runtime/API_CONTRACT.md`：平台接口契约。
5. `docs/CONTENT_EVALUATION.md`：原始 GAME 术语与安全产品语言之间的映射。
6. `docs/PRODUCT_BRIEF.md`：商业、品牌与视觉方向。
7. 讨论记录、历史材料和个人经验：仅作为研究输入，不自动成为产品要求。

任何原始材料若与 `docs/SAFETY.md` 冲突，必须隔离或改写，不能直接进入 UI、规则、Agent 提示词、训练任务或案例库。

## 必跑命令

```bash
npm ci
npm run check
npm run build:sites
```

按变更范围补充：

```bash
npm run serve   # 静态本地模式
npm start       # Node / SQLite 模式；需要安全运行时环境
```

提交前至少完成：

- 规则引擎与本地 schema/迁移单元测试；
- Node 后端与 Sites Worker 安全测试；
- `npm run check`；
- `npm run build:sites` 并检查部署产物；
- Chrome 中的年龄门、建档、事件分析、复盘、导入/导出、删除和清空；
- 平台模式的注册、登录、外部 AI 同意、Agent SSE、授权拒绝与注销；
- 管理员的会话、用户/授权、DeepSeek 配置、全局总闸和审计；
- 390px 与桌面宽度的键盘焦点检查。

## 不可违反的关系安全规则

- 明确拒绝、要求停止或表达不舒服时，`actionPolicy` 必须为 `stop`。
- 已明确要求停止联系时，不生成可复制的新消息，也不允许换账号、借他人或线下绕过。
- 持续回避、多次失约且无替代安排时，`actionPolicy` 至少为 `deescalate`。
- 积极信号不能覆盖拒绝、不舒服、停止要求或后续真实反馈。
- 隐性兴趣信号不等于同意；多个兴趣指标也只能支持一次低压力、可拒绝的沟通。
- 任何肢体或性行为都需要明确、持续、可撤回的同意，不能通过“测试”推断。
- 不实现服从性评分、可攻略程度、价值排名、间歇性强化、激怒后安抚、框架压制、跟踪或未授权聊天分析。
- 不使用 AFC、Beta、目标、高分妹等贬低或物化用户/第三方的产品语言。
- Agent 不能以模型输出覆盖本地安全状态机或现实中的明确表达。

修改信号权重、阈值、停止条件、边界文案或回应模板时，必须同步：

- `tests/signal-engine.test.mjs`
- `docs/SAFETY.md`
- `docs/PRD.md`
- 必要时更新 `docs/CONTENT_EVALUATION.md`

## 双平面数据规则

### 本地关系平面

- 测试、Issue、PR、日志和截图只能使用虚构数据。
- 不粘贴真实聊天记录、姓名、账号、手机号、定位或第三方隐私。
- 数据结构变化必须提高 schema 版本并提供向前迁移；不能要求用户清空数据完成升级。
- 所有导入数据必须经过 allowlist、长度、数量、版本和重新分析。
- 损坏或未来版本数据必须进入恢复保护；用户明确导入或清空前禁止覆盖。
- 导出只保存源数据；导入不得通过静默截断丢失记录。
- 分析是当前引擎的派生视图；真实事件、用户解释和复盘结果才是源数据。
- 删除档案必须级联删除其事件、分析和复盘。

### 平台平面

- 平台表不得在账号、会员或审计实体上混入 profile、Contact、Event、Review 或 Analysis 字段；如用户明确同步个人资料，必须使用独立的 `user_rag_documents` 表，并在每行强制保存当前 `user_id` owner。
- Agent 请求不得自动读取本地 state、localStorage、导出文件、剪贴板或第三方聊天。
- 只有用户在当前外部 AI 同意下明确点击同步的最少必要 profile/contact/event 文档，才可以进入自己的个人 RAG；其他本地内容不得进入请求。
- Agent prompt/reply、系统提示、provider 原始响应与 reasoning 不得持久化；个人 RAG 文档可由用户清空，撤回外部 AI 同意时必须清空。
- 审计只保存 actor、action、resource、result、固定 reason code、request ID 和时间。
- 审计不得保存正文、自由文本理由、密码、API Key、IP 或 User-Agent。
- 管理员只能看到平台元数据和不含正文的知识库同步/清空审计，不能看到本地关系内容、个人 RAG 正文/检索片段或 Agent 正文。

任何跨平面数据流变更必须先更新 PRD、威胁模型、同意文案、数据模型和测试；不能以“个性化”或“方便管理员”为由绕过。

## 账号、授权与同意规则

- 注册、用户登录和管理员登录前必须使用 pre-auth CSRF。
- 所有不安全方法必须校验精确同源 `Origin`；登录后变更还必须校验会话 CSRF。
- 普通用户不能使用管理员会话接口。
- 会员状态、到期、个人 Agent grant、全局总闸和 provider 配置均由服务端判断。
- 外部 AI 同意必须明确、版本化、可撤回，并在每次 Agent 调用时重新验证。
- 发送 prompt 不得自动创建同意。
- 管理员角色、会员、个人 grant 均不能替代外部 AI 同意。
- 授权变更每次只改一个字段，使用 `expectedVersion` 与固定 `reasonCode`。
- 授权、配置、全局策略与关键会话变更必须和对应审计原子提交；审计失败不能留下半完成状态。

最终 Agent 可用条件保持为：

```text
provider configured and enabled
AND globalEnabled
AND (
  administrator
  OR (active, unexpired member AND per-user Agent grant)
)
AND current explicit external-AI consent
```

任何授权逻辑变更都必须同时添加允许与拒绝两侧的真值表测试。

## DeepSeek 与 SSE 规则

- provider endpoint 固定为 `https://api.deepseek.com/`，不能由浏览器或管理员修改。
- 只允许 `deepseek-v4-flash` 和 `deepseek-v4-pro`；默认 Flash。
- 旧模型名和未知模型必须关闭失败。
- API Key 使用 AES-256-GCM 认证加密；读取接口只返回 `apiKeyConfigured`。
- 客户端 `system` 消息必须拒绝；安全 system prompt 只在服务端维护。
- 上游 SSE 必须解析后按字段 allowlist 重发，禁止原始流直通。
- 只允许 assistant role/content、已知结束原因和 `[DONE]`。
- 畸形帧、未知角色、超大帧、输出超限、超时、取消或缺少 `[DONE]` 时关闭失败。
- 公共错误不得包含 provider 原文、内部堆栈、密钥、prompt 或 reply。

修改 provider、模型、提示词、SSE schema、大小限制或超时策略时，必须同步 Node 与 Sites 测试以及 `docs/SAFETY.md`。

## 秘密与管理员规则

- 管理员用户名默认为 `Drac`；真实引导密码只能来自运行时秘密。
- 不得把 `ADMIN_BOOTSTRAP_PASSWORD`、`CONFIG_MASTER_KEY`、DeepSeek API Key 或生产数据库写入源码、文档、迁移、fixture、截图或构建产物。
- 示例只能使用明显的占位符，不能复制用户在对话中提供的秘密。
- 管理员创建成功后应移除引导秘密并按适配器策略轮换。
- API Key 不得回显尾号、掩码或其他可猜测信息。
- 日志和错误不得输出 Cookie、CSRF、Authorization header 或解密失败的内部材料。

## 部署规则

### Node

- 需要 Node.js `>=22.18`。
- `DATABASE_PATH` 必须位于公开静态目录之外。
- 生产必须使用 HTTPS `PUBLIC_ORIGIN` 和 Secure Cookie。
- 只信任显式列出的反向代理地址。
- SSE 代理必须关闭缓冲并有上游超时。
- SQLite 迁移只能向前追加；不得修改已发布迁移后假装为新版本。

### Sites

- `.openai/hosting.json` 的 `project_id`、绑定名和其他 ID 都是不透明值，禁止推导或伪造。
- 同一项目不得重复调用 create-site。
- `npm run build:sites` 产物必须来自将要发布的精确源码状态。
- D1 迁移、Worker、静态资源和运行时秘密必须在生产部署前验证。
- 每个 Sites deployment URL 都是生产环境；默认使用私有访问，除非用户明确选择更广访问。

### SEO

- Node 的 robots/sitemap 使用已校验的 `PUBLIC_ORIGIN`。
- Sites 的 robots/sitemap 使用部署请求 Origin。
- 管理页面与 API 必须保持 noindex。
- sitemap 不得列出账号、管理、API 或私密内容。

## 前端与视觉规则

- 视觉方向是“人文叙事 × 电子杂志”，但工具清晰度和安全信息优先。
- 衬线用于叙事标题，无衬线用于控件与正文，等宽用于状态和审计元数据。
- 不使用视觉诱导隐藏取消、撤回同意、拒绝或退出。
- 外部 AI 同意不得预选、捆绑会员购买或使用模糊按钮。
- 管理员界面可以高密度，但必须明确区分 provider 开关、global 总闸、会员和个人 grant。
- 新增第三方字体、分析 SDK、广告或外部脚本需要新的安全、隐私和性能评审。

## 多 Agent 分工

- **产品 Agent**：维护 PRD、验收标准、指标和非目标。
- **安全 Agent**：维护安全真值表、Agent 防护、威胁模型与隐私边界。
- **架构/数据 Agent**：维护本地 schema、数据库迁移、导入导出与跨平面不变量。
- **后端 Agent**：维护 Node/Sites 账号、授权、同意、加密、审计和 SSE。
- **前端 Agent**：维护主应用、管理员 UI、无障碍与视觉系统。
- **集成 Agent**：唯一负责共享文件整合、最终 diff、检查与发布。

并行工作约束：

- 不得让多个 Agent 同时修改同一共享文件。
- Agent 先报告发现，再由集成 Agent 分配文件所有权。
- 文档 Agent 可以并行处理互不重叠的文档，但不得自行改变安全真值表。
- 子 Agent 完成后必须报告修改文件、测试和未解决风险，不得自行发布。

## 变更完成定义

一次变更只有在以下条件全部满足时才算完成：

- 有明确的用户问题、FR/NFR 与验收标准；
- 安全不变量在 Node 和/或 Sites 的相关适配器中有测试；
- 本地/平台数据边界没有隐式扩张；
- 错误、空状态、损坏数据和外部服务失败不会造成白屏或半完成敏感变更；
- 键盘和读屏用户可以完成核心流程；
- README、PRD、架构、数据、安全与 API 文档和代码一致；
- `npm run check` 与 `npm run build:sites` 通过；
- PR 中没有真实个人数据、密码、密钥、网络指纹、未说明的遥测或正文日志；
- 发布分支、GitHub PR 与部署产物来自同一已验证源码状态。
