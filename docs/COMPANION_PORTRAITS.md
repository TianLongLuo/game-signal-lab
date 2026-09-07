# 内置人物插画 / Built-in portraits

本版本提供 20 张原创虚构成年角色插画（15 女性、5 男性），偏写实绘画质感。
使用 Codex 内置 image_gen 逐张生成，不是图库链接或运行时图片生成占位。
完整生成提示词保存在 companion/presets/prompts.json。

## 使用

- 创建角色：在确认人物设定页选择插画，再确认创建；默认不替用户选择。
- 已有故事：“世界” → 内置人物插画 → 选择 → “应用形象”。
- “使用自生成肖像 / 不选预设”恢复已确认的自生成肖像；没有已确认图时显示氛围装饰。
- 预选只改变视觉，不改变姓名、年龄、性格、世界设定、剧情或回忆。
- 所选编号保存在当前账户故事的加密数据中，跨设备读取；更新带 expectedVersion 防止覆盖其他会话更新。

## 部署与性能

- 随仓库提交 companion/presets/ 下的 20 张主图与 20 张缩略图。
- 主图最长边 1152px；缩略图最长边 360px，列表懒加载；不裁剪构图。
- 文件由同源 Node 静态白名单提供；不依赖第三方图片链接。
- 无需 COMPANION_IMAGE_API_KEY，不扣图片或文字 AI 调用额度。
- 此次不新增数据库迁移；portraitPresetId 是现有加密故事 JSON 的可选字段，旧故事默认没有预选。
- 更新后重启 Node 服务。仅拉取文件、不重启进程时，新静态路由与 API 尚未生效。
- 原始生成 PNG 保留在本机生成目录；部署只需要仓库内的网页优化 JPEG。

## API

创建 POST /api/companion/stories 可带 portraitPresetId: null 或 portrait-01…portrait-20。
已有故事 POST /api/companion/stories/:id/portrait-preset：

```json
{"presetId":"portrait-01","expectedVersion":0}
```

返回 {"story": ...}；版本递增。只接受当前登录用户自己的故事、精确同源请求及会话 CSRF。
无效编号返回 invalid_portrait_preset；版本冲突返回 version_conflict。
图片是公开的内置虚构素材；用户选了哪张图仍是私有故事数据。

## Artwork direction

Twenty independent adult fictional portraits, semi-realistic painterly rendering,
natural proportions, soft light, contemporary everyday clothing and distinct quiet settings.
Names in the picker describe artwork moods, not mandatory character identities.
