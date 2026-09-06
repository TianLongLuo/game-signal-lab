# Companion alpha · 2026-09-06

这是 **Linux/Node 的第一版可运行闭环**，不是全部设计的最终完成版。默认首页切换为「相伴 / 回忆 / 世界」。旧数据、管理员入口和旧应用在 `/legacy/` 保留；Sites 不部署、不更换旧首页。

## 本次可试用

- 描述成年虚拟角色 → DeepSeek 生成人物和三个场景标题 → 手动编辑确认。
- 同一账号一个故事，刷新恢复；自由文字对话逐段流式输出，不播放 TTS。
- 分支选择驱动「初识 → 熟悉 → 暧昧 → 确认关系」，普通聊天和消费次数不推进状态。
- 录音停止后 WAV 转写，显示原文并进行有时限的句读整理；可取消、恢复原始文本，必须手动发送。
- 从已发生回合保存记忆、查看来源、编辑或删除；关键选择自动形成有来源的记忆。
- Qdrant 独立 `${VECTOR_DB_COLLECTION}_companion_v1` 集合，检索同时按账号、故事、版本和未删除状态过滤；返回值再次与 SQLite 当前记忆核对。
- 图片服务启用后，可生成并预览确认中性人物插画、已解锁的当前场景背景。失败保留上一张确认图片。
- 中英文界面、二级登录窗口、移动端布局与减少动态效果样式。

## 必须知道的边界

1. **图片需要独立服务凭据**。已有 DeepSeek Key 不具备绘图能力。当前适配器固定调用官方 OpenAI `gpt-image-1` Images API，服务可用性及账户权限取决于部署环境。未配置时保持文字故事可用，并明确标注装饰背景不是生成插画。
2. 这版先交付中性人物和场景。四表情参考图一致性生成、场景重访、保留旧版本的重开故事、人物草稿跨设备暂存、丰富章节是后续工作。当前「删除故事」是明确的永久删除操作，不是归档重开。
3. 场景状态机负责确定分支；自然语言剧情仍由模型即兴生成。没有声称无限预制故事、角色心理诊断或真实人类身份。
4. 当前通过用户选择与手动保留生成可靠记忆，**不自动把每条模型叙述认作事实**。删除记忆同时排除其来源回合对的模型上下文；原对话仍留在用户可见历史，删除整个故事可一并删除。
5. 图片额度默认 **0**，每账号独立计算，不与 50 次文本额度混用。`COMPANION_IMAGE_LIMIT` 为每账号累计图片上限（最高100），不是每月自动重置。成功且存入私有库才扣一次；供应商对取消/超时请求是否收费由其规则决定，应用不能撤销已发出的供应商账单。
6. 文字生成（含人物草案）沿用现有调用计数，开始供应商调用后即计数，失败/中断也可能消耗次数；已完成回合幂等重放不再次计数。语音句读整理也沿用现有 DeepSeek 额度。
7. 图片数据以 BLOB 存在私有 SQLite 中；对话、设定和记忆使用应用主密钥加密。管理员旧版会话查看接口不包含伴侣正文。主机操作员仍拥有文件系统权限，不能把应用鉴权宣传成运营方零访问能力。
8. 未配置 Qdrant 或暂时不可用时，只使用当前故事的近期已确认记忆；不是跨用户或旧档案回退。未配置真实 embedding 时沿用本地哈希向量，语义质量有限。
9. 新版目前不自动加载 GA4，避免未经新增场景审查而发送私密剧情信息；旧版和公共页面统计保持原样。

## 服务器更新（按已有 systemd 部署）

先确认工作区无本地修改、远程分支确实为 `codex/bilingual-asr-tuning`。不要用 `reset --hard` 覆盖服务器的个人修改。

```bash
cd /opt/game-signal-lab/current
git status --short
git fetch origin
git switch codex/bilingual-asr-tuning
git pull --ff-only origin codex/bilingual-asr-tuning
npm ci
npm run check
```

数据库路径和主密钥保持原有值。**重启前备份数据库和单独保管主密钥**；采用 SQLite 在线备份（不要只复制运行中 WAL 的主文件）。目录名和服务名按你自己的部署调整：

```bash
sudo install -d -m 700 -o game -g game /var/lib/game-signal-lab/backups
sudo -u game sqlite3 /var/lib/game-signal-lab/game.sqlite \
  ".backup '/var/lib/game-signal-lab/backups/pre-companion.sqlite'"
sudo systemctl restart game-signal-lab
sudo systemctl status game-signal-lab --no-pager
curl -fsS https://YOUR_DOMAIN/api/health
```

首次重启自动执行 **SQLite migration 7**，migration 6 增加 companion 表，migration 7 清除旧云语音配置，不改变旧档案或旧会话表。健康接口应返回 `capabilities.companion: true`。首页加载 `/companion/app.js`；仍看到旧界面时检查 Nginx 是否代理给新的 Node 进程，而不是继续托管旧 `dist/index.html`。新版入口也可直接访问 `/companion/`。

Nginx 保持同源代理、`proxy_buffering off`、`proxy_read_timeout 150s`；语音 POST 建议 `client_max_body_size 12m`。TLS 是浏览器麦克风权限的前提。

## 图片配置（可选，不影响文字试用）

仅编辑服务器 `/etc/game-signal-lab/game.env`，不要把真实凭据提交 Git：

```dotenv
COMPANION_ENABLED=true
COMPANION_IMAGE_API_KEY=<independent-image-provider-key>
COMPANION_IMAGE_LIMIT=8
```

重启 Node 后生效。图片调用固定为 `https://api.openai.com/v1/images/generations`，模型 `gpt-image-1`，输出 PNG，low quality；不接受客户端指定任意 URL。适配协议依据 [官方 Image generation 文档](https://developers.openai.com/api/docs/guides/image-generation)。启用前由运营者确认供应商账户可用、计费与许可条件。没有做带真实凭据的生产试生成。

图片任务每用户最多一个、全局最多2个运行、队列最多20个。单次最长180秒，不自动无限重试。重启将遗留任务标为失败，避免重复计费。只在用户确认后展示为正式角色/背景；未确认图留在预览区。

## 隐私与运维

- Companion consent 和旧 external-AI consent 同时有效才允许外部生成；撤回任一同意停止处理，用户仍可查看和删除已保存内容。
- 删除故事同步删除 SQLite 回合、记忆、任务和私有图片；Qdrant 清理进入持久队列，服务不可用时每30秒重试。请求不带正文日志。备份中的旧内容不会自动同步删除，应按运营方公布的备份保留周期处理。
- SQLite 文件、备份、Qdrant 和 ASR 都不能暴露为公网静态目录。Qdrant payload 含记忆正文，须配置内部访问保护和磁盘/备份保护。
- 2核4G主机只做代理、SQLite和既有ASR；不运行图像模型。现有FunASR资源限制继续生效。
- 回滚界面用 `COMPANION_ENABLED=false` 并重启，保留新数据。旧版本程序会拒绝新的 schema 7；**不要直接将旧程序指向已迁移数据库**。真正回滚数据库需要停服并恢复迁移前备份，会丢失备份后的写入，应另行确认。

## 验证与尚待部署实测

代码回归覆盖鉴权隔离、Origin/CSRF、最后一次额度、重复提交、断流不提交、图片私有路径和撤回授权后迟到结果。客户端纯函数覆盖断片SSE、录音/整理取消和手动修改保护。

本地模拟供应商测试不代表真实绘图效果、麦克风设备兼容、生产ASR速度或2核4G并发性能。部署后用测试账号完成：连续两次录音→两轮文字聊天→一次分支→刷新→编辑删除记忆→图片失败/成功确认；再用另一账号验证隔离。先小范围试用，再按实际耗时和失败率确定容量。

### 依赖安装校验补充

本次将 lockfile 中仅腾讯内网可解析的 HTTP npm 镜像 URL 替换为公开的 HTTPS npm registry，**未改变依赖版本或 integrity**。本地以 `npm ci --ignore-scripts` 重新安装并运行回归。`npm audit` 仍提示既有 `geoip-lite → ip-address` 链的1项高危及1项中危报告；当前代码仅用其地理查询，不用它验证代理信任或向网页输出地址HTML。没有执行会强制降级的 `audit fix --force`，正式公网发布前应单独评估并迁移这一既有依赖。
