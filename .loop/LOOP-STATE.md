# GAME Signal Lab — Loop State

> 这是所有自动化 loop 的跨会话持久状态文件。  
> 不要在对话 prompt 里重复这些信息——loop 启动时读这个文件即可。

## 活跃 Loop 清单

| Loop ID | 名称 | 类型 | 节奏 | 状态 | 上次运行 |
|---------|------|------|------|------|----------|
| blog-daily | 每日博客发布 | 内容生成 | 每天 9:00 | active | 2026-09-17 |
| seo-weekly | SEO 健康监控 | 监控 | 每周一 10:00 | active | 2026-09-21 |
| ci-sweeper | CI 失败修复 | 修复 | 每 15 分钟 | active | 2026-08-10 16:08 |
| changelog-weekly | 更新日志 | 文档 | 每周一 11:00 | active | 2026-09-21 |

## 每日博客 Loop 状态

- **当前文章编号**: 60（已发布 60 篇中文 + 60 篇英文）
- **上次主题**: 如何与过去的伤害正式告别：为什么「时间会冲淡一切」不等于「已经放下」——区分「淡忘」与「疗愈」，学会在重新开始之前，先给过去一个完整的句号，而不是带着它仓促地进入下一段关系
- **下次主题候选**: 如何识别「重复的关系模式」：为什么你总是遇到同一类人、陷入同一种困境——区分「偶然」与「旧伤的选择性吸引」，学会在疗愈之后打破重复的循环，不再被同一种伤痛反复绊倒
- **待验证**: -
- **人工干预**: -

## SEO Health 状态

- **上次 sitemap URL 数**: 128（+14，全部 128 个 URL 逐一检查均 200。构成：60 主题 × 2 语言 = 120 篇文章 + 8 个页面 [/, /en/, /privacy/, /en/privacy/, /blog/, /en/blog/, blog/changelog.html, blog/en-changelog.html]，与 blog-daily 已发布 60 篇完全同步，无缺漏、无多余项）
- **上次检查**: 2026-09-21（seo-weekly）
- **上次 Google 索引状态**: 无法访问（本轮仍无 GSC 凭据，与 2026-09-07、09-14 相同，无新信号；已连续 3 周无法验证索引）
- **robots.txt**: 格式正常（Allow /，Disallow /admin/、/api/，Sitemap 指向 https://rsdgame.online/sitemap.xml）；www→apex 301 正常；admin 带 `X-Robots-Tag: noindex, nofollow, noarchive`
- **待修复**: ⚠️ sitemap 与页面 robots 冲突（详见下，本周无变化）
- **注释**:
  - ✅ 本周无 4xx/5xx；128/128 sitemap URL 全 200；sitemap 不含 admin/api URL；文章 1–60 中英成对无缺号；文章 54–60（本周新增 7 主题）已进入 sitemap、已内链进 blog/ 索引页，且 `<h1>`/meta description/`canonical`（绝对 URL）/`robots: index,follow` 均齐备。
  - ⚠️ **4 个 sitemap URL 实际为 noindex（sitemap 说收录、页面说别收录，Google 以 noindex 为准）**——连续第 3 周未修复：
    - `https://rsdgame.online/` → `noindex, nofollow`（sitemap 中 priority **1.0**）
    - `https://rsdgame.online/en/` → `noindex, nofollow`（sitemap 中 priority **1.0**）
    - `https://rsdgame.online/blog/changelog.html` → `noindex`（且无 canonical）
    - `https://rsdgame.online/blog/en-changelog.html` → `noindex`（且无 canonical）
  - 根因（未变）：`server/app.js` L332 —— 当 `COMPANION_ENABLED !== "false"`（默认 true，env 未设置）时，`/`、`/index.html`、`/en`、`/en/` 一律返回 `companion/index.html`（成年虚构恋爱视觉小说，页面自带 `noindex,nofollow`）。`server/app.js` 自 2026-09-06 (b5d3259) 后无改动。
  - ⚠️ 真正的可收录营销落地页在 `https://rsdgame.online/legacy/`（`index,follow`，全 SEO 元数据，200），但它**仍不在 sitemap 中、且无任何内链（孤儿页）**；其 canonical 仍写死 `href="/"` → 指向 noindex 页面（canonical→noindex 冲突，会让 /legacy/ 也难收录）。
  - ⚠️ 英文落地页仍不可达：`/legacy/en/`、`/en/legacy/` 均 404，`/en/` 被 companion 覆盖 → 英文营销页事实上已死链。
  - 🆕 本周新发现（轻微，非回归）：**hreflang 模板漂移**。文章 1–14（中英各 14 页）输出完整 3 标签 hreflang（self `zh-CN`、`x-default`、`en`）；文章 15–60（94 页，含 en- 侧）只输出 **1 个** `alternate`（中→en / en→zh-CN）。互指仍然成立（双向），但缺 self-reference 与 `x-default`，94/122 页受影响。Google 可接受，属低优先级一致性优化。
  - 轻微（长期存在）：`blog/2-how-to-do-relationship-review.html` 缺少 `<meta name="robots" content="index,follow">`（同批其他文章都有），默认仍可收录，仅模板不一致。
  - 轻微（长期存在）：HEAD 请求对 `/robots.txt`、`/sitemap.xml`、`/runtime-config.js` 返回 404（路由只判 `method === "GET"`），GET 正常 200，Googlebot 用 GET 故影响低。
  - 说明（非回归）：GA4 采用同意门控设计，`analytics.js` 仅在用户授权后才注入 gtag，故 HTML 中 grep 不到 `G-` 属预期；`runtime-config.js` 已正确下发 `gaMeasurementId: G-EJD3GEZ83Z`，CSP 放行 Google 域。旧的「grep G- 必须 ≥1」检查项对本架构已不适用。
  - 仍无 `<lastmod>` 标签（可选优化，不影响收录）。
  - **修复建议（按优先级，均需用户决策或专门修复 loop，本监控 loop 未改动代码）**：
    1. 让 `/`、`/en/` 恢复为可收录的营销落地页（把 companion 挪到 `/companion/` 子路径，或设置 `COMPANION_ENABLED=false` 并把落地页放回根路由），同时从 sitemap 移除 changelog 两页（或给它们去掉 noindex）。这一步收益最大——当前根域首页对搜索引擎完全不可见。
    2. 把 `/legacy/` 加进 sitemap、canonical 改为绝对 `https://rsdgame.online/legacy/`、并从可收录的 `/blog/` 加入内链（解除孤儿状态）；恢复英文落地页路由 `/legacy/en/` 或 `/en/legacy/`。
    3. 统一 hreflang 模板（补 self-reference + `x-default`）；顺带补 `blog/2-…` 的 robots 标签、给 sitemap 加 `<lastmod>`。
    4. 提供 GSC 凭据（service account JSON 或已登录会话），否则索引状态已连续 3 周无法验证。

## CI 状态

- **上次测试结果**: 129 pass, 0 fail
- **上次部署**: 成功
- **已知不稳定测试**: 无
- **注释**: 2026-09-21 changelog-weekly 运行 `npm run check` 确认 129 pass 0 fail（与 09-14 持平；本周无代码变更，为内容更新周）
- **✅ 推送已恢复**: 2026-09-21 changelog-weekly 巡检确认 GitHub token 有效，工作分支与 origin 同步。注：blog/ 下仍留有 blog-daily loop 未提交的文章 22–60 及 index.html 改动。

## Changelog 状态

- **上次运行**: 2026-09-21
- **产出**: blog/en-changelog.html + blog/changelog.html
- **覆盖范围**: 2026-09-14 至 2026-09-21（1 commit，0 实质性——内容更新周）
- **本周主题**: 内容更新周——「重建与疗愈」篇章收尾，新增 7 篇双语文章（主题 54–60：表达真实需求、接受不完美、修复信任裂痕、原谅 vs 遗忘、重建安全感、重建亲密连接、与过去正式告别）
- **博客文章数**: 60 中文 + 60 英文 = 120 篇（本周 +14，主题 54–60）
- **备注**: GitHub push token 已确认可用；博客文章 22–60 仍为磁盘上未提交状态（blog-daily loop 写文件不提交，待整理）；本轮 SEO 巡检发现新问题——hreflang 模板漂移（文章 15–60 仅单个 alternate 标签），连同既有的 companion 覆盖 /、/en 路由导致的 sitemap/robots noindex 冲突，均已记录在 changelog「已知问题」中

## 当前项目阶段

- **活跃分支**: codex/fullstack-game-signal-lab
- **生产 URL**: https://rsdgame.online
- **最近部署**: 2026-08-04（滚轮 3D 首页 + DeepSeek 修复）
- **待上线功能**: -

---

*最后更新：2026-09-21 (changelog-weekly loop 执行) · Loop Engineering framework*
