# GAME Signal Lab — Loop State

> 这是所有自动化 loop 的跨会话持久状态文件。  
> 不要在对话 prompt 里重复这些信息——loop 启动时读这个文件即可。

## 活跃 Loop 清单

| Loop ID | 名称 | 类型 | 节奏 | 状态 | 上次运行 |
|---------|------|------|------|------|----------|
| blog-daily | 每日博客发布 | 内容生成 | 每天 9:00 | active | 2026-08-24 |
| seo-weekly | SEO 健康监控 | 监控 | 每周一 10:00 | active | 2026-08-24 |
| ci-sweeper | CI 失败修复 | 修复 | 每 15 分钟 | active | 2026-08-10 16:08 |
| changelog-weekly | 更新日志 | 文档 | 每周一 11:00 | active | 2026-08-24 |

## 每日博客 Loop 状态

- **当前文章编号**: 32（已发布 32 篇中文 + 32 篇英文）
- **上次主题**: 如何识别关系中的「煤气灯式道歉」：为什么「对不起，但都是因为你……」不是真正的道歉（How to Recognize the Gaslighting Apology: Why "I'm Sorry, But…" Isn't an Apology at All）— 拆解「对不起，但是……」背后的责任转移逻辑，列出五种常见假道歉（但是型／你那样觉得型／如果型／翻旧账型／自我惩罚型），以「但是」一词作为假道歉的分水岭，给出真诚道歉三要素（明确认错／不附加条件／修复意愿）与四个区分方法（看感觉／看责任归属／看翻篇速度／看行为是否改变），用记录道歉原话、道歉后行为与自身感受守住判断
- **下次主题候选**: 如何识别关系中的「三角测量」：为什么TA总是搬出「别人都说你……」来施压（triangulation）
- **待验证**: -
- **人工干预**: -

## SEO Health 状态

- **上次 sitemap URL 数**: 72（+14，全部 72 个 URL 逐一检查均 200；新增双语博客 26–32 共 14 个 URL，sitemap 与 blog-daily 已发布内容同步）
- **上次 Google 索引状态**: 已索引（2026-08-24 本轮无 GSC 凭据无法访问，无新信号；Bing/DDG 探测仍被反爬拦截）
- **robots.txt**: 正常（Allow /，Disallow /admin/、/api/，Sitemap 指向正确）
- **待修复**: -
- **注释**: 无 4xx/5xx；sitemap 不含 admin/api URL ✓；无 `<lastmod>` 标签（可选优化，不影响收录）；sitemap 由静态构建生成，内容与 blog-daily 发布节奏一致

## CI 状态

- **上次测试结果**: 65 pass, 0 fail
- **上次部署**: 成功
- **已知不稳定测试**: 无
- **注释**: 2026-08-10 16:08 CI sweeper 巡检，全部通过（65 pass 0 fail，本轮最新确认）
- **✅ 推送已恢复**: 2026-08-17 changelog-weekly 巡检确认 GitHub token 有效（`git push --dry-run` 新分支探针通过），工作分支已与 origin 同步（0 领先 / 0 落后，HEAD=ef571b9）。此前 08-10 的 401 问题已解除。注：blog/ 下仍留有 blog-daily loop 未提交的文章 22–26 及 index.html 改动。

## Changelog 状态

- **上次运行**: 2026-08-24
- **产出**: blog/en-changelog.html + blog/changelog.html
- **覆盖范围**: 2026-08-17 至 2026-08-24（1 commit，0 实质性代码变更）
- **本周主题**: 纯内容周——「识别操控」系列 7 篇双语文章（主题 26–32），产品代码无新变更
- **博客文章数**: 32 中文 + 32 英文 = 64 篇（本周 +14，主题 26–32）
- **备注**: GitHub push token 已确认可用（临时分支探测 exit 0）；博客文章 22–32 仍为磁盘上未提交状态（blog-daily loop 写文件不提交，待整理）

## 当前项目阶段

- **活跃分支**: codex/fullstack-game-signal-lab
- **生产 URL**: https://rsdgame.online
- **最近部署**: 2026-08-04（滚轮 3D 首页 + DeepSeek 修复）
- **待上线功能**: -

---

*最后更新：2026-08-24 (changelog-weekly loop 执行) · Loop Engineering framework*
