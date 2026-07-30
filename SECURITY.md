# Security Policy

GAME Signal Lab 处理高度敏感的关系记录与账号安全数据。请通过 GitHub 的私密漏洞报告功能报告安全问题，不要在公开 Issue、PR、日志或截图中粘贴真实聊天、姓名、账号、联系方式、定位、导出 JSON、密码、Cookie、CSRF Token、API Key 或任何第三方个人信息。

## Supported scope

当前 `main` 分支及其可部署产物是受支持范围：

- 浏览器本地关系日记、schema、迁移、导入导出与规则引擎；
- Node.js `>=22.18` + SQLite 适配器；
- Sites Worker + D1 适配器；
- 管理员控制台；
- DeepSeek V4 SSE 代理；
- 构建与部署配置。

旧 commit、未经修改的 fork、第三方反向代理和部署平台自身不在本仓库直接控制范围，但如果仓库默认配置会诱发风险，仍欢迎私密报告。

## Data boundary

### Local relationship plane

以下数据只应存在于当前浏览器的 `localStorage` 或用户手动导出的明文 JSON：

- 个人表达和边界；
- 匿名关系档案；
- 关系事件、解释与感受；
- 真实结果复盘；
- 规则引擎派生分析。

应用不会自动把这些数据上传到账号 API、管理员后台或 Agent。

### Optional platform plane

服务端只持久化：

- 账号、会员、Agent grant；
- 会话/CSRF 哈希；
- 当前外部 AI 同意元数据；
- 全局访问策略；
- 加密的 DeepSeek 配置；
- 最小审计元数据；
- 部署适配器需要的有界认证频率计数。

服务端和审计不得持久化关系正文、Agent prompt/reply、系统提示、密码明文、API Key 明文、自由文本审批理由、IP 地址或 User-Agent。管理员只能查看平台操作元数据，不能查看本地关系内容或 Agent 对话正文。

## Security controls

- 精确同源 `Origin` 校验；
- 登录前签名 CSRF 与登录后会话 CSRF；
- 生产环境 Secure、HttpOnly、SameSite=Strict 会话 Cookie；
- 密码强哈希、登录/注册频率限制和有界密码工作量；
- 角色、会员状态、到期、个人 grant、全局总闸和当前外部 AI 同意的服务端授权；
- DeepSeek endpoint 固定为 `https://api.deepseek.com/`；
- 只允许 `deepseek-v4-flash` 与 `deepseek-v4-pro`；
- API Key 使用 AES-256-GCM 认证加密，读取接口只返回是否已配置；
- 客户端 `system` 消息拒绝，服务端注入固定安全提示词；
- 上游 SSE 解析和字段 allowlist，限制帧、总输出、超时和取消；
- 安全敏感变更与审计原子提交；
- 管理页面/API noindex、公共错误脱敏和同源 CSP；
- 本地导入 allowlist、大小/数量/版本限制与恢复保护。

Agent 最终可用条件为：

```text
provider configured and enabled
AND globalEnabled
AND (
  administrator
  OR (active, unexpired member AND per-user Agent grant)
)
AND current explicit external-AI consent
```

任何单一角色、会员状态或 grant 都不能绕过其余条件。

## Secrets and deployment

禁止提交或写入静态产物：

- `ADMIN_BOOTSTRAP_PASSWORD`
- `CONFIG_MASTER_KEY`
- DeepSeek API Key
- 生产数据库文件、备份或绑定凭据
- 真实用户导出

管理员用户名默认为 `Drac`；其引导密码必须由运行时秘密管理注入，不得写入源码、迁移、文档、测试夹具或日志。首次创建成功后应移除引导秘密，并按部署适配器的策略轮换密码。

Node 部署必须：

- 将 `DATABASE_PATH` 放在任何公开静态目录之外；
- 在生产使用 HTTPS `PUBLIC_ORIGIN`；
- 只信任明确列出的反向代理地址；
- 关闭 SSE 响应缓冲；
- 保护 SQLite 文件、WAL 和备份。

Sites 部署必须：

- 使用 Sites 环境控制配置秘密；
- 保持 `.openai/hosting.json` 的 D1 绑定与部署项目一致；
- 应用 `drizzle/` 迁移；
- 在生产 URL 上复核 Origin、CSRF、Cookie、robots/sitemap 和管理 noindex。

## Known limitations

- `localStorage` 与导出 JSON 都是明文，不是保险箱。
- 共享设备、浏览器同步/清理、无痕模式和下载备份可能造成泄露或丢失。
- 平台账号元数据不是端到端加密；服务端必须能验证授权。
- 用户明确提交给 Agent 的文本会发送给 DeepSeek。服务端“不落库”不代表外部 provider 不处理该文本；使用前必须阅读当前数据处理说明。
- API Key 加密安全依赖 `CONFIG_MASTER_KEY` 的保密、备份和轮换纪律。
- 关系安全规则不能替代医疗、心理、法律、人身安全或紧急服务。

## Report a vulnerability

私密报告请包含：

- 受影响版本、commit 与部署适配器；
- 使用完全虚构数据的最小复现；
- 预期与实际行为；
- 是否可能导致越权读取、持久 XSS、CSRF/Origin 绕过、会话固定、秘密泄漏、授权真值表绕过、Agent 正文落库、SSE 注入、数据丢失或不安全关系建议；
- 在不泄漏真实数据的前提下提供必要请求/响应结构；
- 已知影响和可能的缓解建议。

请不要：

- 访问、修改或删除其他真实用户的数据；
- 批量扫描、压测生产服务或触发高额 provider 调用；
- 尝试获取真实 API Key、密码或关系正文；
- 将问题公开后再要求私密处理。

安全与同意策略见 [`docs/SAFETY.md`](docs/SAFETY.md)，架构和数据边界见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) 与 [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)。
