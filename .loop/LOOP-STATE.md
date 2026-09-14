# GAME Signal Lab — Loop State

> 这是所有自动化 loop 的跨会话持久状态文件。  
> 不要在对话 prompt 里重复这些信息——loop 启动时读这个文件即可。

## 活跃 Loop 清单

| Loop ID | 名称 | 类型 | 节奏 | 状态 | 上次运行 |
|---------|------|------|------|------|----------|
| blog-daily | 每日博客发布 | 内容生成 | 每天 9:00 | active | 2026-09-14 |
| seo-weekly | SEO 健康监控 | 监控 | 每周一 10:00 | active | 2026-09-14 |
| ci-sweeper | CI 失败修复 | 修复 | 每 15 分钟 | active | 2026-08-10 16:08 |
| changelog-weekly | 更新日志 | 文档 | 每周一 11:00 | active | 2026-09-14 |

## 每日博客 Loop 状态

- **当前文章编号**: 53（已发布 53 篇中文 + 53 篇英文）
- **上次主题**: 如何在亲密中保留属于自己的独处空间：为什么「我需要一点自己的时间」不是拒绝，而是让关系更健康——区分「依赖」与「陪伴」，学会在爱里保留一块只属于自己的空间，让两个完整的人在一起更自在
- **下次主题候选**: 如何在关系里表达真实的需求而不怕被拒绝：为什么「说出来」不是任性，而是让关系更清晰——区分「请求」与「要求」，学会用不指责的方式说出「我需要」，让两个人都不必靠猜来相处
- **待验证**: -
- **人工干预**: -

## SEO Health 状态

- **上次 sitemap URL 数**: 114（+14，全部 114 个 URL 逐一检查均 200。构成：53 主题 × 2 语言 = 106 篇文章 + 8 个页面 [/, /en/, /privacy/, /en/privacy/, /blog/, /en/blog/, blog/changelog.html, blog/en-changelog.html]，与 blog-daily 已发布 53 篇完全同步）
- **上次 Google 索引状态**: 无法访问（本轮仍无 GSC 凭据，与 2026-09-07 相同，无新信号）
- **robots.txt**: 格式正常（Allow /，Disallow /admin/、/api/，Sitemap 指向正确）
- **待修复**: ⚠️ sitemap 与页面 robots 冲突（详见下）
- **注释**:
  - ✅ 无 4xx/5xx；sitemap 不含 admin/api URL；www→apex 301 正常；admin 带 `X-Robots-Tag: noindex`；blog 文章 canonical/hreflang 互指正确。
  - ⚠️ **4 个 sitemap URL 实际为 noindex（sitemap 说收录、页面说别收录，Google 以 noindex 为准）**：
    - `https://rsdgame.online/` → `noindex, nofollow`（sitemap 中 priority **1.0**）
    - `https://rsdgame.online/en/` → `noindex, nofollow`（sitemap 中 priority **1.0**）
    - `https://rsdgame.online/blog/changelog.html` → `noindex`
    - `https://rsdgame.online/blog/en-changelog.html` → `noindex`
  - 根因：`server/app.js` L332 —— 当 `COMPANION_ENABLED !== "false"`（默认 true，env 未设置）时，`/`、`/index.html`、`/en`、`/en/` 一律改为返回 `companion/index.html`（成年虚构恋爱视觉小说，页面自带 `noindex,nofollow`）。这正是 companion alpha（commit c27b790 / 85316b4）上线后的副作用。
  - ⚠️ 真正的可收录营销落地页已迁移到 `https://rsdgame.online/legacy/`（`index,follow`，全 SEO 元数据），但它**不在 sitemap 中、且无任何内链（孤儿页）**，其 canonical 仍写死 `href="/"` → 指向一个 noindex 页面（canonical→noindex 冲突，会导致 /legacy/ 也难收录）。
  - ⚠️ 英文落地页不可达：`en/index.html` 无独立路由，`/en/` 被 companion 覆盖；`/legacy/en/`、`/en/legacy/` 均 404。英文营销页事实上已死链。
  - 轻微：`blog/2-how-to-do-relationship-review.html` 缺少 `<meta name="robots" content="index,follow">`（同批其他文章都有），默认仍可收录，仅模板不一致。
  - 轻微：HEAD 请求对 `/robots.txt`、`/sitemap.xml`、`/runtime-config.js` 返回 404（路由只判 `method === "GET"`），GET 正常 200，Googlebot 用 GET 故影响低。
  - 说明（非回归）：GA4 采用同意门控设计，`analytics.js` 仅在用户授权后才注入 gtag，故 HTML 中 grep 不到 `G-` 属预期；`runtime-config.js` 已正确下发 `gaMeasurementId: G-EJD3GEZ83Z`，CSP 放行 Google 域。旧的「grep G- 必须 ≥1」检查项对本架构已不适用。
  - 仍无 `<lastmod>` 标签（可选优化，不影响收录）。

## CI 状态

- **上次测试结果**: 129 pass, 0 fail
- **上次部署**: 成功
- **已知不稳定测试**: 无
- **注释**: 2026-09-14 changelog-weekly 运行 `npm run check` 确认 129 pass 0 fail（与 09-07 持平；本周无代码变更，为内容更新周）
- **✅ 推送已恢复**: 2026-09-14 changelog-weekly 巡检确认 GitHub token 有效（`git push --dry-run` 临时分支探针 exit 0），工作分支与 origin 同步。注：blog/ 下仍留有 blog-daily loop 未提交的文章 22–53 及 index.html 改动。

## Changelog 状态

- **上次运行**: 2026-09-14
- **产出**: blog/en-changelog.html + blog/changelog.html
- **覆盖范围**: 2026-09-07 至 2026-09-14（1 commit，0 实质性——内容更新周）
- **本周主题**: 内容更新周——系列从「识别操控」转向「重建与疗愈」，新增 7 篇双语文章（主题 47–53：习得性无助、低自我价值感、讨好型沟通、情感依赖 → 重建自我感、健康边界、亲密中的独处空间）
- **博客文章数**: 53 中文 + 53 英文 = 106 篇（本周 +14，主题 47–53）
- **备注**: GitHub push token 已确认可用（临时分支探测 exit 0）；博客文章 22–53 仍为磁盘上未提交状态（blog-daily loop 写文件不提交，待整理）；本轮 SEO 巡检发现新问题——companion alpha 覆盖 /、/en 路由导致 sitemap/robots noindex 冲突，已在 changelog「已知问题」中记录

## 当前项目阶段

- **活跃分支**: codex/fullstack-game-signal-lab
- **生产 URL**: https://rsdgame.online
- **最近部署**: 2026-08-04（滚轮 3D 首页 + DeepSeek 修复）
- **待上线功能**: -

---

*最后更新：2026-09-14 (changelog-weekly loop 执行) · Loop Engineering framework*
