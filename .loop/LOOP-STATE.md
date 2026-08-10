# GAME Signal Lab — Loop State

> 这是所有自动化 loop 的跨会话持久状态文件。  
> 不要在对话 prompt 里重复这些信息——loop 启动时读这个文件即可。

## 活跃 Loop 清单

| Loop ID | 名称 | 类型 | 节奏 | 状态 | 上次运行 |
|---------|------|------|------|------|----------|
| blog-daily | 每日博客发布 | 内容生成 | 每天 9:00 | active | - |
| seo-weekly | SEO 健康监控 | 监控 | 每周一 10:00 | active | 2026-08-10 |
| ci-sweeper | CI 失败修复 | 修复 | 每 15 分钟 | active | 2026-08-10 16:08 |
| changelog-weekly | 更新日志 | 文档 | 每周一 11:00 | active | 2026-08-10 |

## 每日博客 Loop 状态

- **当前文章编号**: 18（已发布 18 篇中文 + 18 篇英文）
- **上次主题**: 如何启动困难对话（Difficult Conversations）— 最难的不是说什么，是决定开口
- **下次主题候选**: 沟通模式、关系中的反馈艺术、关系中权力与平等的边界、如何接受关系中的不确定性
- **待验证**: -
- **人工干预**: -
- **修复**: 补充了之前缺失的 en-12-mixed-signals.html（英文版混合信号文章）

## SEO Health 状态

- **上次 sitemap URL 数**: 38（+16，新增 8 篇双语博客 11–18）
- **上次 Google 索引状态**: 已索引（2026-08-10 本轮无法访问 GSC，无新信号；Bing/DDG 探测被反爬拦截）
- **robots.txt**: 正常
- **待修复**: -
- **注释**: 百度尚未验证；sitemap 无 `<lastmod>` 标签（可选优化，不影响收录）

## CI 状态

- **上次测试结果**: 65 pass, 0 fail
- **上次部署**: 成功
- **已知不稳定测试**: 无
- **注释**: 2026-08-10 16:08 CI sweeper 巡检，全部通过（65 pass 0 fail，本轮最新确认）
- **⚠️ 推送受阻**: GitHub token 仍无效（API 401 Bad credentials，2026-08-10 16:08 再次复核确认，fetch 只读可用但 push 报 Authentication failed）。状态更新 commit 均在本地未推送（本地领先 origin 10+ 个 commit）。需更换 ~/.hermes/secrets/github_tianlongluo.token 及 remote URL 中的 token 后手动 push。

## Changelog 状态

- **上次运行**: 2026-08-10（首次）
- **产出**: blog/en-changelog.html + blog/changelog.html
- **覆盖范围**: 2026-08-03 至 2026-08-10（107 commits, 44 实质性变更）
- **本周主题**: ASR 语音重构、视觉系统升级、国际化完成、博客上线
- **博客文章数**: 18 中文 + 18 英文 = 36 篇

## 当前项目阶段

- **活跃分支**: codex/fullstack-game-signal-lab
- **生产 URL**: https://rsdgame.online
- **最近部署**: 2026-08-04（滚轮 3D 首页 + DeepSeek 修复）
- **待上线功能**: -

---

*最后更新：2026-08-10 (seo-weekly loop 执行) · Loop Engineering framework*
