# GAME Signal Lab — Loop State

> 这是所有自动化 loop 的跨会话持久状态文件。  
> 不要在对话 prompt 里重复这些信息——loop 启动时读这个文件即可。

## 活跃 Loop 清单

| Loop ID | 名称 | 类型 | 节奏 | 状态 | 上次运行 |
|---------|------|------|------|------|----------|
| blog-daily | 每日博客发布 | 内容生成 | 每天 9:00 | active | 2026-09-07 |
| seo-weekly | SEO 健康监控 | 监控 | 每周一 10:00 | active | 2026-09-07 |
| ci-sweeper | CI 失败修复 | 修复 | 每 15 分钟 | active | 2026-08-10 16:08 |
| changelog-weekly | 更新日志 | 文档 | 每周一 11:00 | active | 2026-09-07 |

## 每日博客 Loop 状态

- **当前文章编号**: 46（已发布 46 篇中文 + 46 篇英文）
- **上次主题**: 如何识别「认知失调」（cognitive dissonance）：为什么你越是被伤害，反而越替对方辩解、越投入、越舍不得放手——理解「投入越多越不愿承认选错」的心理机制（沉没成本与自我合理化），拆解认知失调如何让你用「说服自己」来回避「离开」的痛苦，列出五个特征（替伤害辩护／贬低离开的选项／抗拒朋友的建议／把离开等同于承认失败／情绪极度矛盾），给出五条摆脱「越痛越放不下」困境的路径（承认选错并不可耻／把沉没成本从决策里剔除／用关系日记还原真实比例／停止追加投入／找回「随时可以离开」的选择权），提醒你放不下的从来不是那个人，而是「不愿承认选错」的执念——清醒不是从不犯错，而是在看清代价后仍有力量转身
- **下次主题候选**: 如何识别「习得性无助」（learned helplessness）：为什么你在关系里越努力越绝望，最后干脆放弃反抗、觉得「做什么都没用」——理解反复受挫后「习得」的无力感如何让你失去争取的勇气、默认自己无法改变现状，找到重新拿回主动权的路径
- **待验证**: -
- **人工干预**: -

## SEO Health 状态

- **上次 sitemap URL 数**: 100（+14，全部 100 个 URL 逐一检查均 200；新增双语博客主题 40–46 共 14 个 URL。构成：46 主题 × 2 语言 = 92 篇文章 + 8 个页面 [/, /en/, /privacy/, /en/privacy/, /blog/, /en/blog/, 中英 changelog]，与 blog-daily 已发布内容完全同步）
- **上次 Google 索引状态**: 已索引（2026-09-07 本轮无 GSC 凭据无法访问，无新信号）
- **robots.txt**: 正常（Allow /，Disallow /admin/、/api/，Sitemap 指向正确）
- **待修复**: -
- **注释**: 无 4xx/5xx；sitemap 不含 admin/api URL ✓；www→apex 301 正常；仍无 `<lastmod>` 标签（可选优化，不影响收录）；sitemap 由静态构建生成，内容与 blog-daily 发布节奏一致

## CI 状态

- **上次测试结果**: 129 pass, 0 fail
- **上次部署**: 成功
- **已知不稳定测试**: 无
- **注释**: 2026-09-07 changelog-weekly 运行 `npm run check` 确认 129 pass 0 fail（companion alpha 新增 64 项测试，较 08-10 的 65 项大幅增长）
- **✅ 推送已恢复**: 2026-08-17 changelog-weekly 巡检确认 GitHub token 有效（`git push --dry-run` 新分支探针通过），工作分支已与 origin 同步（0 领先 / 0 落后，HEAD=ef571b9）。此前 08-10 的 401 问题已解除。注：blog/ 下仍留有 blog-daily loop 未提交的文章 22–26 及 index.html 改动。

## Changelog 状态

- **上次运行**: 2026-09-07
- **产出**: blog/en-changelog.html + blog/changelog.html
- **覆盖范围**: 2026-08-31 至 2026-09-07（8 commits，5 实质性：3 feat + 2 fix）
- **本周主题**: Companion alpha 里程碑周——私人虚构恋爱视觉小说上线（流式故事、记忆、插画、FunASR 语音），测试套件从 65 → 129；另加「识别操控」系列 7 篇双语文章（主题 40–46）
- **博客文章数**: 46 中文 + 46 英文 = 92 篇（本周 +14，主题 40–46）
- **备注**: GitHub push token 已确认可用（临时分支探测 exit 0）；博客文章 22–46 仍为磁盘上未提交状态（blog-daily loop 写文件不提交，待整理）

## 当前项目阶段

- **活跃分支**: codex/fullstack-game-signal-lab
- **生产 URL**: https://rsdgame.online
- **最近部署**: 2026-08-04（滚轮 3D 首页 + DeepSeek 修复）
- **待上线功能**: -

---

*最后更新：2026-09-07 (changelog-weekly loop 执行) · Loop Engineering framework*
