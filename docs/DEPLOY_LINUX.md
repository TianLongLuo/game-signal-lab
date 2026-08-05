# GAME Signal Lab：Linux 部署与更新

这份说明适用于一台运行 Ubuntu/Debian、Node.js `>=22.18` 的 Linux
服务器。生产站点必须使用 HTTPS；SQLite 数据库必须放在静态资源目录之外。

## 1. 准备运行用户与目录

```bash
sudo useradd --system --home /var/lib/game-signal-lab --shell /usr/sbin/nologin game
sudo mkdir -p /opt/game-signal-lab/releases /var/lib/game-signal-lab /etc/game-signal-lab
sudo chown -R game:game /var/lib/game-signal-lab /opt/game-signal-lab
sudo chmod 700 /var/lib/game-signal-lab /etc/game-signal-lab
```

把仓库检出到一个版本目录，例如：

```bash
sudo -u game git clone https://github.com/TianLongLuo/game-signal-lab.git \
  /opt/game-signal-lab/releases/initial
cd /opt/game-signal-lab/releases/initial
sudo -u game npm ci
sudo -u game npm run check
```

不要把 `.env`、SQLite 文件、备份或真实用户数据放进仓库。

## 2. 运行时秘密

创建 `/etc/game-signal-lab/game.env`，权限设为 `600`：

```dotenv
NODE_ENV=production
PUBLIC_ORIGIN=https://game.example.com
DATABASE_PATH=/var/lib/game-signal-lab/game.sqlite
COOKIE_SECURE=true
CONFIG_MASTER_KEY=<32-byte-base64url-or-64-hex-value>
ADMIN_BOOTSTRAP_PASSWORD=<one-time-random-password-at-least-12-chars>
ADMIN_BOOTSTRAP_USERNAME=Drac
VECTOR_DB_URL=http://127.0.0.1:6333
VECTOR_DB_COLLECTION=game_signal_lab
VECTOR_DB_API_KEY=<optional-qdrant-api-key>
VECTOR_DIMENSIONS=384
# Optional OpenAI-compatible embedding endpoint. Leave blank to use the
# deterministic local hash embedder; use a real embedding model in production.
EMBEDDING_API_URL=http://127.0.0.1:11434/v1/embeddings
EMBEDDING_API_KEY=<optional-embedding-api-key>
EMBEDDING_MODEL=<embedding-model-name>
# Optional local-first ASR. Keep the endpoint on loopback; MiMo remains the fallback.
FUNASR_BASE_URL=http://127.0.0.1:8000
FUNASR_MODEL=sensevoice
FUNASR_TIMEOUT_MS=30000
FUNASR_MAX_CONCURRENCY=1
```

`CONFIG_MASTER_KEY` 用于加密 DeepSeek/MiMo Key，必须长期保管并单独备份；
`ADMIN_BOOTSTRAP_PASSWORD` 只用于第一次创建管理员，首次成功登录后应从
运行时环境移除并改用管理员密码。不要把任何真实 Key 或密码写入 GitHub、
systemd 文件、构建产物、日志或 issue。

## 3. 启动本地 FunASR（推荐）

仓库包含固定版本的 FunASR 容器定义。默认的 `SenseVoiceSmall + CPU` 比把完整
MP3 发往外部 API 少一段公网往返，并保留 MiMo 作为故障回退：

```bash
cd /opt/game-signal-lab/current/deploy/funasr
cp .env.example .env
docker compose -f compose.yml up -d --build
docker compose -f compose.yml logs -f funasr
curl -fsS http://127.0.0.1:8000/health
```

首次启动需要下载并加载模型，健康检查变绿后再启动 Node 服务。模型缓存在
Docker volume `funasr-cache`，更新 GAME release 不会重复下载。FunASR 端口只绑定
`127.0.0.1`；不要把它加入 Nginx 公网路由。详细配置见
[`deploy/funasr/README.md`](../deploy/funasr/README.md)。

应用只在配置 `FUNASR_BASE_URL` 时启用本地识别，并且只接受 loopback HTTP URL。
FunASR 不可用、超时或拒绝音频时，应用会自动回退到后台配置的 MiMo ASR；两者
都不可用时才向用户返回错误。

对于 2 核 4G 轻量服务器，仓库默认把 FunASR 限制为 1.75 核、2.5G 内存、
2 个计算线程和单并发。建议额外配置至少 2G swap，并确保 Node、Qdrant、FunASR
合计仍有余量。这里不能使用“高并发”配置：第二路本地 ASR 会自动回退 MiMo。
官方 ONNX WebSocket 镜像支持 `--decoder-thread-num`，但本项目当前使用的是
OpenAI-compatible HTTP 入口，两套启动参数不能混用。

## 4. systemd 服务

创建 `/etc/systemd/system/game-signal-lab.service`：

```ini
[Unit]
Description=GAME Signal Lab
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=game
Group=game
WorkingDirectory=/opt/game-signal-lab/current
EnvironmentFile=/etc/game-signal-lab/game.env
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/game-signal-lab
UMask=0077

[Install]
WantedBy=multi-user.target
```

切换 `current` 并启动：

```bash
sudo ln -sfn /opt/game-signal-lab/releases/initial /opt/game-signal-lab/current
sudo systemctl daemon-reload
sudo systemctl enable --now game-signal-lab
curl -fsS https://game.example.com/api/health
sudo journalctl -u game-signal-lab -f
```

## 5. Nginx 反向代理与 HTTPS

Nginx 只代理到本机 Node 端口（默认 `127.0.0.1:8787`，也可以通过
`PORT` 调整），并保留 SSE 的实时性：

```nginx
server {
    listen 443 ssl http2;
    server_name game.example.com;

    ssl_certificate     /etc/letsencrypt/live/game.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/game.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_buffering off;
        proxy_read_timeout 150s;
    }
}
```

只把明确的代理地址加入 `TRUSTED_PROXY_ADDRESSES`；不要盲目信任任意
`X-Forwarded-For`。

## 6. 后台配置 DeepSeek 与 MiMo

1. 使用一次性管理员秘密登录 `/admin/`。
2. 在“DeepSeek 配置”中输入 Key、选择允许的模型并启用 provider。
3. 在“Agent 访问”中打开全局总闸，再为需要的会员启用 Agent grant。
4. 在“语音配置”中输入 Token Plan MiMo V2.5 Key、选择声音并启用语音服务。Node 默认使用 `https://token-plan-cn.xiaomimimo.com/v1/`；如需覆盖，设置运行时环境变量 `MIMO_BASE_URL`，不要把密钥写入 `.env` 示例、代码或 Git。启用本地 FunASR 后，MiMo ASR 只在本地服务失败时回退使用。
5. 普通用户注册后，必须单独确认外部 AI 数据处理说明。

两种 Key 都只在服务端使用 AES-256-GCM 加密保存；接口只返回是否已配置，
管理员页面不会显示 Key 尾号。若要轮换 Key，直接在后台重新保存，不要改代码。

若后台登录页提示“后台运行时尚未完成配置”，优先检查 `DATABASE_PATH`、
`CONFIG_MASTER_KEY` 和同源 `/api/auth/csrf` 是否可访问；若提示“还没有管理员账号”，
说明这是空数据库，需临时配置 `ADMIN_BOOTSTRAP_PASSWORD` 后首次登录。已有数据库时，
引导密码不会重置现有 `Drac` 密码。登录页会把 401、CSRF、限流和服务端 5xx 分开提示，
便于定位问题；前端会携带同源证明以兼容省略 `Origin` 的浏览器/嵌入式 WebView，
服务端仍拒绝带有跨站 `Origin` 或 `Sec-Fetch-Site` 的请求。不要把密码或 Key 粘贴到
GitHub、日志或前端配置。

## 7. Qdrant 向量库与个人 RAG

Linux/Node 生产路径使用 Qdrant，不把个人文档的向量塞进 SQLite。下面是一个
只监听本机、数据落在受限目录的最小 Docker Compose 示例；生产环境请按你的
基础设施锁定镜像版本并为 Qdrant 设置 API Key：

```yaml
services:
  qdrant:
    image: qdrant/qdrant:v1.15.1
    restart: unless-stopped
    ports:
      - "127.0.0.1:6333:6333"
    volumes:
      - /var/lib/game-signal-lab/qdrant:/qdrant/storage
```

启动后检查 `curl -fsS http://127.0.0.1:6333/collections`。应用第一次同步
个人档案时会创建 `VECTOR_DB_COLLECTION`，把每个文档嵌入成向量，并在每次
upsert/search/delete 请求里携带精确的 `user_id` payload filter。若配置了
`EMBEDDING_API_URL`，它必须是只返回向量的内部 OpenAI-compatible 服务；否则
应用使用固定维度的本地哈希向量以保证 Qdrant 可用，但生产建议配置真正的
多语义 embedding 模型。向量库 API Key 和 embedding Key 只能放在
`/etc/game-signal-lab/game.env`，不能进入仓库或日志。

启动 Node 服务前验证：

```bash
sudo -u game curl -fsS http://127.0.0.1:6333/collections
sudo systemctl restart game-signal-lab
curl -fsS https://game.example.com/api/health
```

### 个人 RAG 数据边界

用户默认资料仍在浏览器本地。用户在“对象档案”页点击“同步我的档案”后，
服务端才会把用户选择的匿名 profile/contact/event 文档写入该用户自己的
`user_rag_documents` 缓存与 Qdrant collection。Agent 每次向量检索都由服务端
绑定当前会话 `user_id`；
管理员无法读取正文，也不能指定别人的 user ID。撤回外部 AI 同意或点击清空
服务器档案会删除该用户 RAG 文档，本机 `localStorage` 不会被删除。

## 8. 更新流程（可回滚）

```bash
set -euo pipefail
cd /opt/game-signal-lab
release="$(date +%Y%m%d%H%M%S)"
sudo -u game git fetch origin
sudo -u game git worktree add "/opt/game-signal-lab/releases/$release" \
  origin/codex/fullstack-game-signal-lab
cd "/opt/game-signal-lab/releases/$release"
sudo -u game npm ci
sudo -u game npm run check
sudo -u game npm run build:sites
sudo docker compose -f deploy/funasr/compose.yml up -d --build
sudo ln -sfn "/opt/game-signal-lab/releases/$release" /opt/game-signal-lab/current
sudo systemctl restart game-signal-lab
curl -fsS https://game.example.com/api/health
```

Node SQLite 迁移会在进程启动时向前执行（当前包含个人 RAG 迁移）。启动
失败时保持旧 release 的 symlink，不要手动修改 `schema_migrations`。如需
回滚：

```bash
sudo ln -sfn /opt/game-signal-lab/releases/<previous-release> /opt/game-signal-lab/current
sudo systemctl restart game-signal-lab
```

## 9. 备份、恢复与密钥轮换

停机或使用 SQLite 在线备份生成一致性备份，并限制权限：

```bash
sudo -u game sqlite3 /var/lib/game-signal-lab/game.sqlite \
  ".backup '/var/backups/game-signal-lab-$(date +%F).sqlite'"
sudo chmod 600 /var/backups/game-signal-lab-*.sqlite
```

恢复前停止服务、保留旧数据库副本，并确认 `CONFIG_MASTER_KEY` 与备份时相同；
否则已加密的 provider Key 无法解密。密钥轮换需要先安排停机/迁移窗口，重新
保存 DeepSeek 与 MiMo Key，再删除旧主密钥备份；不要在日志中打印解密材料。

## 10. 排障检查

```bash
systemctl status game-signal-lab --no-pager
journalctl -u game-signal-lab -n 200 --no-pager
curl -i https://game.example.com/api/health
curl -i https://game.example.com/robots.txt
curl -fsS http://127.0.0.1:8000/health
docker compose -f /opt/game-signal-lab/current/deploy/funasr/compose.yml logs --tail=100 funasr
```

若 Agent 返回“尚未配置”，检查后台 provider 开关、全局总闸、会员 grant、
外部 AI 同意和 `CONFIG_MASTER_KEY`；不要把 Key 粘贴到 shell 历史或日志中。
