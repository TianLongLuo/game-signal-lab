# GAME Signal Lab SEO 实施说明

## 已实现

公共首页已经包含：

- 描述性标题与 meta description；
- `index, follow, max-image-preview:large`；
- 解析到当前站点根路径的相对 canonical；
- Open Graph 与 Twitter 文本元数据；
- `WebApplication` JSON-LD；
- 面向不执行 JavaScript 的简短产品说明；
- 安全、克制且不承诺关系结果的搜索文案。

管理页使用 `noindex, nofollow, noarchive, nosnippet`。生产运行时还会对 `/admin/` 与管理 API 下发 `X-Robots-Tag` 和 `Cache-Control: no-store`。`robots.txt` 不是访问控制，后台仍依赖服务端认证、授权、Origin、CSRF 和审计。

## robots 与 Sitemap

Sites Worker 和 Node 服务在请求时用实际公开 Origin 动态生成：

- `/robots.txt`
- `/sitemap.xml`

因此构建产物不会携带 `example.com` 或其他错误生产域名。robots 允许公共首页，提示爬虫不抓取 `/admin/` 与 `/api/`；Sitemap 只收录公共根页面。

仓库中的 `seo/robots.txt` 与 `seo/sitemap.xml` 仅作为行为参考，不进入 Sites 静态构建。

## 上线检查

1. 首页、canonical 与部署域名全部使用 HTTPS。
2. `/robots.txt` 中的 Sitemap URL 与当前访问 Origin 一致。
3. `/sitemap.xml` 的 `<loc>` 返回 `200`。
4. `/admin/` 不在 Sitemap，响应同时包含 noindex。
5. JSON-LD 不包含虚构评分、评论、价格、FAQ 或效果承诺。
6. 如以后增加正式分享图，再加入绝对 HTTPS 的 `og:image`、`og:image:alt` 与 `twitter:image`。建议 1200×630，沿用暖纸底、深蓝细线、衬线标题和简洁数据片段，避免监视或操控意象。
