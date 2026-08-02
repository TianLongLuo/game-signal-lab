# GAME Admin REST API Contract

管理控制台统一访问同源前缀 `/api/admin/v1`。除 `204 No Content` 外，响应为 JSON，且所有管理响应均使用 `Cache-Control: no-store` 与 `X-Robots-Tag: noindex, nofollow, noarchive`。

## 会话、安全与错误

登录前必须先请求 `GET /api/auth/csrf`，保留服务端设置的登录前 Cookie，并在 `POST /api/admin/v1/session` 的 `X-CSRF-Token` 中原样回送响应里的 `csrfToken`。所有 `POST`、`PUT`、`PATCH`、`DELETE` 请求必须带与当前站点完全一致的 `Origin`。

登录后由服务端设置 `Secure; HttpOnly; SameSite=Strict` 会话 Cookie。所有变更接口还必须回送登录响应中的会话 `csrfToken`。前端不得保存 Bearer Token，不得把密码、CSRF Token 或 API Key 写入 URL、日志或本地存储。

统一错误格式：

```json
{
  "error": {
    "code": "ADMIN_FORBIDDEN",
    "message": "当前管理员无权执行此操作。"
  },
  "requestId": "req_01..."
}
```

错误不得包含密码、API Key、关系事件正文、Agent 输入或回复、系统提示词、上游原始响应或内部堆栈。

## 会话

### `POST /session`

```json
{
  "username": "管理员用户名",
  "password": "仅在 HTTPS 请求正文中提交"
}
```

成功响应：

```json
{
  "admin": {
    "id": "adm_01...",
    "displayName": "Drac",
    "role": "security_admin",
    "permissions": [
      "overview:read",
      "users:read",
      "entitlements:write",
      "audit:read",
      "deepseek:write"
    ]
  },
  "csrfToken": "仅保存在当前页面内存"
}
```

失败统一返回 `401`，不得暴露账号是否存在。初始管理员账号由服务端运行时环境引导创建；真实密码不得进入源码、迁移、构建产物或文档。

### `GET /session`

恢复有效管理会话，响应与登录相同。无有效会话返回 `401`。

### `DELETE /session`

撤销当前服务端会话并清除 Cookie，成功返回 `204`。需要会话 CSRF。

## 概览

### `GET /overview`

只返回汇总指标与服务状态，不返回用户内容：

```json
{
  "metrics": [
    {
      "label": "有效会员",
      "value": 128,
      "note": "当前未过期"
    }
  ],
  "overallStatus": "healthy",
  "services": [
    {
      "label": "审计写入",
      "status": "正常",
      "level": "good"
    }
  ]
}
```

`overallStatus` 为 `healthy | degraded`。

## 用户与授权

### `GET /users`

查询参数：

- `query`：用户 ID 或匿名别名；运行时若保存了邮箱，也可匹配其脱敏显示值；
- `entitlement`：`all | member | agent | none`；
- `limit`：`1..100`；
- `cursor`：预留的游标分页参数。

```json
{
  "items": [
    {
      "id": "usr_01...",
      "alias": "匿名代号",
      "maskedEmail": "",
      "joinedAt": "2026-07-30T09:00:00.000Z",
      "membershipEnabled": true,
      "expiresAt": null,
      "agentEnabled": false,
      "version": 4
    }
  ],
  "total": 1,
  "nextCursor": null
}
```

`membershipEnabled` 只有在会员计划有效、状态为 active 且未过期时才为 `true`。接口不得返回关系档案、事件、分析、Agent 正文或第三方内容。
`maskedEmail` 是可选展示字段；不保存邮箱的运行时返回空字符串。`total` 表示完整筛选结果数，前端必须沿 `nextCursor` 加载后续页面，不能把首个 100 条误当作全部用户。

管理员可以看到用户账户、授权与最小操作审计，但不能读取任何用户个人
RAG 文档、档案正文、检索片段或 Agent 对话。个人知识库接口只对当前登录
用户开放，服务端始终以会话 `user_id` 做所有权过滤。

### `PATCH /users/{userId}/entitlements`

每次只能改变一个授权字段，并带乐观锁版本及固定原因代码：

```json
{
  "agentEnabled": true,
  "expectedVersion": 4,
  "reasonCode": "agent_approved"
}
```

固定原因：

- `membership_approved` / `membership_revoked`
- `agent_approved` / `agent_revoked`
- `security_review`
- `account_request`

专用原因必须与本次动作匹配。授权变更、版本推进与审计写入必须位于同一事务或同一原子批次。版本冲突返回 `409`。

## 行为审计

### `GET /audit-events`

查询参数 `page` 从 1 开始，`pageSize` 为 `1..50`。

```json
{
  "items": [
    {
      "id": "evt_01...",
      "occurredAt": "2026-07-30T10:42:12.000Z",
      "actorId": "adm_01...",
      "action": "user.agent.enable",
      "resourceType": "user",
      "resourceId": "usr_01...",
      "result": "success",
      "reasonCode": "agent_approved",
      "requestId": "req_01..."
    }
  ],
  "page": 1,
  "pageSize": 5,
  "total": 1,
  "pageCount": 1
}
```

审计只保存最少必要的身份、动作、资源、结果、固定原因和请求关联元数据。不保存关系正文、Agent 输入/回复、系统提示、API Key、自由文本理由、IP 地址或 User-Agent。

## DeepSeek 模型服务

供应商地址固定为 `https://api.deepseek.com/`，浏览器不可修改。

### `GET /integrations/deepseek`

```json
{
  "enabled": false,
  "baseUrl": "https://api.deepseek.com/",
  "model": "deepseek-v4-flash",
  "apiKeyConfigured": true,
  "updatedAt": "2026-07-30T10:42:12.000Z"
}
```

`baseUrl` 仅供显示。服务端只能返回 `apiKeyConfigured`，不得返回密钥、掩码值或尾号。

### `PATCH /integrations/deepseek`

```json
{
  "enabled": true,
  "model": "deepseek-v4-flash",
  "apiKey": "仅在新增或替换密钥时出现"
}
```

- 模型只允许 `deepseek-v4-flash` 或 `deepseek-v4-pro`；
- 请求包含 `baseUrl` 时必须拒绝；
- `apiKey` 省略表示保留现有密钥；
- API Key 必须使用服务端密钥加密后持久化，且永不回传；
- `enabled: true` 但没有可用密钥时返回 `422`；
- 配置变更与不含秘密的审计元数据原子写入。

## MiMo V2.5 TTS + ASR 语音服务

语音供应商地址固定为 `https://token-plan-cn.xiaomimimo.com/v1/`，同一把 Token Plan MiMo Key 用于 Agent 的可选语音回应（TTS）和更准确的语音转文字（ASR）。密钥只在后台提交并以密文保存。

浏览器录音统一转换为单声道 16 kHz WAV，再调用 `mimo-v2.5-asr`；不向上游发送 WebM、OGG 或 MP4。录音过程中按节流策略实时校正，停止后再做最终校正；超时会保留浏览器实时文本，不会让界面停在“校正中”。TTS 使用 `茉莉` 预置女声并通过风格指令生成成熟、知性、温暖的御姐表达。

### `GET /integrations/mimo-tts`

返回 `enabled`、允许的 `model`、固定 `baseUrl`、`apiKeyConfigured` 和更新时间；不返回密钥或掩码。

### `PATCH /integrations/mimo-tts`

接受 `{ "enabled": boolean, "model": "mimo-v2.5-tts" | "mimo-v2-tts", "apiKey"?: string }`。省略 `apiKey` 表示保留现有密钥；启用但没有密钥时返回 `422`。配置使用与 DeepSeek 相同的服务端 AES-256-GCM 加密和管理员审计。

## Agent 全局访问

模型服务配置与 Agent 授权总闸相互独立。

### `GET /integrations/deepseek/access`

```json
{
  "globalEnabled": false
}
```

### `PATCH /integrations/deepseek/access`

```json
{
  "globalEnabled": true
}
```

变更需要管理员会话、CSRF 与同源校验，并与 `agent.global.enable | agent.global.disable` 审计原子写入。

最终 Agent 可用条件为：

```text
provider configured and enabled
AND globalEnabled
AND (
  administrator
  OR (active, unexpired member AND per-user Agent grant)
)
AND current explicit external-AI consent
```

## 状态码

- `200`：查询或更新成功；
- `204`：注销成功；
- `400`：字段或请求格式错误；
- `401`：会话不存在、过期或登录失败；
- `403`：角色、Origin 或 CSRF 校验失败；
- `409`：版本或同意政策冲突；
- `422`：业务规则不满足；
- `429`：触发限流；
- `500/502/503`：服务异常，公共响应不得泄漏内部信息。
