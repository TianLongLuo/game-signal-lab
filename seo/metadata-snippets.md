# GAME Signal Lab SEO 实施说明

## 已实现（2026-08-03 更新）

公共首页包含：

- 描述性标题与 meta description、keywords（关系记录/关系信号/沟通复盘等）；
- `index, follow, max-image-preview:large`；
- 服务端运行时把 canonical / og:url / og:image 替换为绝对 HTTPS URL（PUBLIC_ORIGIN）；
- `hreflang="zh-CN"` 自引用；
- Open Graph 全套（type/locale/site_name/title/description/url/image 1200×630）；
- Twitter summary card；
- `WebSite` + `WebApplication` JSON-LD @graph，含免费 Offer 与 18+ 受众；
- `baidu-site-verification` meta（占位，正式验证时替换）；
- noscript 中面向爬虫的完整产品说明（功能/隐私/边界）；
- 安全、克制且不承诺关系结果的搜索文案。

管理页使用 `noindex, nofollow, noarchive, nosnippet`。生产运行时还会对 `/admin/` 与管理 API 下发 `X-Robots-Tag` 和 `Cache-Control: no-store`。`robots.txt` 不是访问控制，后台仍依赖服务端认证、授权、Origin、CSRF 和审计。

## robots 与 Sitemap

Node 服务在请求时用实际公开 Origin 动态生成 `/robots.txt` 与 `/sitemap.xml`。Sitemap 只收录公共根页面（含 changefreq/priority）。仓库中的 `seo/robots.txt` 与 `seo/sitemap.xml` 仅作行为参考，不进入构建。

## 域名归一化

Caddy 将 `www.rsdgame.online` 301 永久跳转到 `rsdgame.online`（canonical 站点），避免搜索引擎把两个域名当作重复站点。两个域名的 Let's Encrypt 证书均已签发。

## 提交到搜索引擎

### Google（Search Console）

1. 打开 https://search.google.com/search-console ，用 Google 账号登录；
2. 添加资源 → 网域 → 输入 `rsdgame.online`；
3. 验证方式选「网域」（DNS TXT），在 Spaceship 的 DNS 管理添加 TXT 记录（TTL 建议 3600）；
4. 验证通过后提交 Sitemap：`https://rsdgame.online/sitemap.xml`；
5. 用「网址检查」工具请求收录 `https://rsdgame.online/`。

### 百度（百度站长平台）

1. 打开 https://ziyuan.baidu.com/ 并登录；
2. 添加站点：`https://rsdgame.online`；
3. 验证方式选「HTML 标签」，把生成的 `<meta name="baidu-site-verification" content="...">` 替换 index.html 中的占位值（当前为 `rsdgame-online`），提交代码后由服务端部署；
4. 验证通过后在「普通收录 → sitemap」提交 `https://rsdgame.online/sitemap.xml`；
5. 注意：百度对海外服务器的 .online 域名收录较慢，需要耐心；同时提交「普通收录 → 手动提交」根 URL。

## 上线检查

1. 首页、canonical 与部署域名全部使用 HTTPS。
2. `/robots.txt` 中的 Sitemap URL 与当前访问 Origin 一致。
3. `/sitemap.xml` 的 `<loc>` 返回 `200`。
4. `/admin/` 不在 Sitemap，响应同时包含 noindex。
5. JSON-LD 不包含虚构评分、评论、价格、FAQ 或效果承诺。
6. `https://www.rsdgame.online/` 返回 301 → `https://rsdgame.online/`。
7. `og:image` 返回 200 且为 1200×630 PNG。
8. 如以后增加正式分享图，再加入绝对 HTTPS 的 `og:image:alt` 与 `twitter:image`。
