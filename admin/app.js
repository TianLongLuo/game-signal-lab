"use strict";

const API_ROOT = "/api/admin/v1";
const AUDIT_PAGE_SIZE = 5;
const MOBILE_NAV_QUERY = "(max-width: 900px)";

const viewTitles = {
  overview: "概览",
  users: "用户与授权",
  audit: "行为审计",
  deepseek: "DeepSeek 配置",
  voice: "语音配置",
};

const demoSeed = {
  admin: {
    id: "adm_demo_01",
    displayName: "演示管理员",
    role: "super_admin",
  },
  users: [
    {
      id: "U-DEMO-1042",
      alias: "山茶",
      maskedEmail: "sh***@example.invalid",
      joinedAt: "2026-07-12T08:20:00.000Z",
      membershipEnabled: true,
      agentEnabled: false,
      version: 1,
    },
    {
      id: "U-DEMO-1088",
      alias: "北岸",
      maskedEmail: "be***@example.invalid",
      joinedAt: "2026-07-15T10:05:00.000Z",
      membershipEnabled: true,
      agentEnabled: true,
      version: 2,
    },
    {
      id: "U-DEMO-1126",
      alias: "纸鸢",
      maskedEmail: "zh***@example.invalid",
      joinedAt: "2026-07-18T03:48:00.000Z",
      membershipEnabled: false,
      agentEnabled: false,
      version: 1,
    },
    {
      id: "U-DEMO-1164",
      alias: "松果",
      maskedEmail: "so***@example.invalid",
      joinedAt: "2026-07-20T12:31:00.000Z",
      membershipEnabled: true,
      agentEnabled: false,
      version: 3,
    },
    {
      id: "U-DEMO-1191",
      alias: "远帆",
      maskedEmail: "yu***@example.invalid",
      joinedAt: "2026-07-22T05:17:00.000Z",
      membershipEnabled: false,
      agentEnabled: true,
      version: 1,
    },
    {
      id: "U-DEMO-1230",
      alias: "白露",
      maskedEmail: "ba***@example.invalid",
      joinedAt: "2026-07-24T09:42:00.000Z",
      membershipEnabled: true,
      agentEnabled: true,
      version: 4,
    },
  ],
  auditEvents: [
    {
      id: "evt_demo_018",
      occurredAt: "2026-07-30T10:42:12.000Z",
      actorId: "adm_demo_01",
      action: "deepseek.configuration.update",
      resourceType: "integration",
      resourceId: "deepseek",
      result: "success",
      requestId: "req_demo_9018",
    },
    {
      id: "evt_demo_017",
      occurredAt: "2026-07-30T09:35:48.000Z",
      actorId: "adm_demo_02",
      action: "user.agent.enable",
      resourceType: "user",
      resourceId: "U-DEMO-1088",
      result: "success",
      requestId: "req_demo_9017",
    },
    {
      id: "evt_demo_016",
      occurredAt: "2026-07-30T08:12:09.000Z",
      actorId: "adm_demo_01",
      action: "user.membership.disable",
      resourceType: "user",
      resourceId: "U-DEMO-1126",
      result: "success",
      requestId: "req_demo_9016",
    },
    {
      id: "evt_demo_015",
      occurredAt: "2026-07-29T16:54:33.000Z",
      actorId: "adm_demo_03",
      action: "admin.session.create",
      resourceType: "session",
      resourceId: "ses_demo_231",
      result: "success",
      requestId: "req_demo_9015",
    },
    {
      id: "evt_demo_014",
      occurredAt: "2026-07-29T15:20:44.000Z",
      actorId: "adm_demo_02",
      action: "user.membership.enable",
      resourceType: "user",
      resourceId: "U-DEMO-1164",
      result: "success",
      requestId: "req_demo_9014",
    },
    {
      id: "evt_demo_013",
      occurredAt: "2026-07-29T13:08:22.000Z",
      actorId: "adm_demo_01",
      action: "deepseek.global.disable",
      resourceType: "integration",
      resourceId: "deepseek",
      result: "success",
      requestId: "req_demo_9013",
    },
    {
      id: "evt_demo_012",
      occurredAt: "2026-07-29T11:46:51.000Z",
      actorId: "adm_demo_04",
      action: "user.agent.enable",
      resourceType: "user",
      resourceId: "U-DEMO-1230",
      result: "denied",
      requestId: "req_demo_9012",
    },
    {
      id: "evt_demo_011",
      occurredAt: "2026-07-29T10:10:07.000Z",
      actorId: "adm_demo_01",
      action: "user.agent.enable",
      resourceType: "user",
      resourceId: "U-DEMO-1230",
      result: "success",
      requestId: "req_demo_9011",
    },
    {
      id: "evt_demo_010",
      occurredAt: "2026-07-28T17:31:26.000Z",
      actorId: "adm_demo_02",
      action: "user.membership.enable",
      resourceType: "user",
      resourceId: "U-DEMO-1042",
      result: "success",
      requestId: "req_demo_9010",
    },
    {
      id: "evt_demo_009",
      occurredAt: "2026-07-28T14:02:11.000Z",
      actorId: "adm_demo_01",
      action: "deepseek.configuration.update",
      resourceType: "integration",
      resourceId: "deepseek",
      result: "success",
      requestId: "req_demo_9009",
    },
    {
      id: "evt_demo_008",
      occurredAt: "2026-07-28T09:27:30.000Z",
      actorId: "adm_demo_03",
      action: "admin.session.revoke",
      resourceType: "session",
      resourceId: "ses_demo_198",
      result: "success",
      requestId: "req_demo_9008",
    },
  ],
  deepseek: {
    enabled: false,
    globalEnabled: false,
    model: "deepseek-v4-flash",
    apiKeyConfigured: true,
    updatedAt: "2026-07-30T10:42:12.000Z",
  },
  mimo: {
    enabled: false,
    model: "mimo-v2.5-tts",
    apiKeyConfigured: false,
    updatedAt: null,
  },
};

let session = {
  mode: null,
  admin: null,
  csrfToken: "",
};
let demoState = null;
let currentView = "overview";
let auditPage = 1;
let auditPageCount = 1;
let currentUsers = [];
let nextUsersCursor = null;
let userTotal = 0;
let activeUserFilters = { query: "", entitlement: "all" };
let userRequestGeneration = 0;
let pendingEntitlementChange = null;
let entitlementTrigger = null;
let toastTimer = null;

const loginShell = document.querySelector("#login-shell");
const skipLink = document.querySelector("#skip-link");
const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#login-message");
const demoLoginButton = document.querySelector("#demo-login");
const adminShell = document.querySelector("#admin-shell");
const adminMain = document.querySelector("#admin-main");
const adminWorkspace = document.querySelector("#admin-workspace");
const sidebar = document.querySelector("#admin-sidebar");
const sidebarScrim = document.querySelector("#sidebar-scrim");
const sidebarClose = document.querySelector("#sidebar-close");
const mobileMenu = document.querySelector("#mobile-menu");
const logoutButton = document.querySelector("#logout-button");
const viewTitle = document.querySelector("#view-title");
const adminIdentity = document.querySelector("#admin-identity");
const demoBadge = document.querySelector("#demo-badge");
const environmentBadge = document.querySelector("#environment-badge");
const toast = document.querySelector("#toast");
const mobileNav = window.matchMedia(MOBILE_NAV_QUERY);

const overviewMetrics = document.querySelector("#overview-metrics");
const serviceStatusList = document.querySelector("#service-status-list");
const overallStatus = document.querySelector("#overall-status");
const refreshOverviewButton = document.querySelector("#refresh-overview");

const userFilterForm = document.querySelector("#user-filter-form");
const userSearch = document.querySelector("#user-search");
const entitlementFilter = document.querySelector("#entitlement-filter");
const userResultCount = document.querySelector("#user-result-count");
const userList = document.querySelector("#user-list");
const userEmpty = document.querySelector("#user-empty");
const userLoadMore = document.querySelector("#user-load-more");

const auditList = document.querySelector("#audit-list");
const auditPrev = document.querySelector("#audit-prev");
const auditNext = document.querySelector("#audit-next");
const auditPageStatus = document.querySelector("#audit-page-status");
const refreshAuditButton = document.querySelector("#refresh-audit");

const agentAccessForm = document.querySelector("#agent-access-form");
const agentGlobalEnabled = document.querySelector("#agent-global-enabled");
const agentAccessMessage = document.querySelector("#agent-access-message");
const deepseekForm = document.querySelector("#deepseek-form");
const deepseekEnabled = document.querySelector("#deepseek-enabled");
const deepseekModel = document.querySelector("#deepseek-model");
const deepseekApiKey = document.querySelector("#deepseek-api-key");
const deepseekUpdated = document.querySelector("#deepseek-updated");
const deepseekKeyState = document.querySelector("#api-key-state");
const deepseekMessage = document.querySelector("#deepseek-message");
const reloadDeepseekButton = document.querySelector("#reload-deepseek");
const mimoForm = document.querySelector("#mimo-form");
const mimoEnabled = document.querySelector("#mimo-enabled");
const mimoModel = document.querySelector("#mimo-model");
const mimoApiKey = document.querySelector("#mimo-api-key");
const mimoUpdated = document.querySelector("#mimo-updated");
const mimoKeyState = document.querySelector("#mimo-key-state");
const mimoMessage = document.querySelector("#mimo-message");
const reloadMimoButton = document.querySelector("#reload-mimo");

const entitlementDialog = document.querySelector("#entitlement-dialog");
const entitlementForm = document.querySelector("#entitlement-form");
const entitlementDialogSummary = document.querySelector("#change-dialog-summary");
const entitlementReasonCode = document.querySelector("#change-reason-code");
const entitlementMessage = document.querySelector("#change-message");
const entitlementCancel = document.querySelector("#change-cancel");

init();

function init() {
  bindEvents();
  syncSidebarForViewport();
  if (window.__GAME_RUNTIME__?.apiEnabled === true) {
    restoreSession();
  } else {
    loginMessage.textContent = "当前是静态预览；可使用下方虚构数据查看管理界面。";
  }
}

function bindEvents() {
  loginForm.addEventListener("submit", handleLogin);
  demoLoginButton.addEventListener("click", startDemoSession);
  logoutButton.addEventListener("click", logout);

  document.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view]");
    if (!viewButton || adminShell.hidden) return;
    navigate(viewButton.dataset.view);
  });

  mobileMenu.addEventListener("click", () => {
    if (sidebar.classList.contains("is-open")) closeSidebar(true);
    else openSidebar();
  });
  sidebarClose.addEventListener("click", () => closeSidebar(true));
  sidebarScrim.addEventListener("click", () => closeSidebar(true));
  mobileNav.addEventListener("change", syncSidebarForViewport);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sidebar.classList.contains("is-open")) {
      closeSidebar(true);
    }
  });

  refreshOverviewButton.addEventListener("click", () => loadOverview(true));
  userFilterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    loadUsers(true, false);
  });
  userSearch.addEventListener("input", invalidateUserPagination);
  entitlementFilter.addEventListener("change", invalidateUserPagination);
  userLoadMore.addEventListener("click", () => loadUsers(true, true));
  userList.addEventListener("click", (event) => {
    const switchButton = event.target.closest("[data-entitlement]");
    if (!switchButton) return;
    openEntitlementDialog(switchButton);
  });

  auditPrev.addEventListener("click", () => loadAudit(auditPage - 1, true));
  auditNext.addEventListener("click", () => loadAudit(auditPage + 1, true));
  refreshAuditButton.addEventListener("click", () => loadAudit(auditPage, true));

  deepseekForm.addEventListener("submit", saveDeepseekConfig);
  agentAccessForm.addEventListener("submit", saveAgentAccess);
  reloadDeepseekButton.addEventListener("click", () => loadDeepseek(true));
  mimoForm.addEventListener("submit", saveMimoConfig);
  reloadMimoButton.addEventListener("click", () => loadMimo(true));

  entitlementForm.addEventListener("submit", applyEntitlementChange);
  entitlementCancel.addEventListener("click", () => entitlementDialog.close("cancel"));
  entitlementDialog.addEventListener("close", () => {
    pendingEntitlementChange = null;
    entitlementMessage.textContent = "";
    entitlementReasonCode.value = "";
    entitlementTrigger?.focus();
    entitlementTrigger = null;
  });
}

async function restoreSession() {
  try {
    const payload = await request("/session");
    if (!payload?.admin) return;
    session = {
      mode: "live",
      admin: payload.admin,
      csrfToken: payload.csrfToken || "",
    };
    await enterAdmin();
  } catch (error) {
    if (error instanceof ApiError && [401, 404].includes(error.status)) return;
    loginMessage.textContent = "暂时无法检查管理会话。你仍可以登录，或查看虚构数据预览。";
  }
}

async function handleLogin(event) {
  event.preventDefault();
  if (!loginForm.reportValidity()) return;

  const submitButton = loginForm.querySelector('button[type="submit"]');
  const formData = new FormData(loginForm);
  const credentials = {
    username: String(formData.get("username") || "").trim(),
    password: String(formData.get("password") || ""),
  };

  loginMessage.textContent = "";
  setButtonBusy(submitButton, true, "正在登录…");

  try {
    const csrfToken = await prepareAuthCsrf();
    const payload = await request("/session", {
      method: "POST",
      body: credentials,
      csrf: false,
      csrfToken,
    });
    session = {
      mode: "live",
      admin: payload.admin,
      csrfToken: payload.csrfToken || "",
    };
    loginForm.reset();
    await enterAdmin();
  } catch (error) {
    const message =
      error instanceof ApiError && error.status === 401
        ? "用户名或密码不正确。"
        : error instanceof ApiError && error.status === 429
          ? "登录尝试次数过多，请 15 分钟后再试。"
        : "登录失败，请稍后重试或联系系统管理员。";
    loginMessage.textContent = message;
    document.querySelector("#admin-password").value = "";
    document.querySelector("#admin-password").focus();
  } finally {
    credentials.password = "";
    setButtonBusy(submitButton, false);
  }
}

function startDemoSession() {
  demoState = structuredClone(demoSeed);
  session = {
    mode: "demo",
    admin: demoState.admin,
    csrfToken: "",
  };
  enterAdmin();
}

async function enterAdmin() {
  loginShell.hidden = true;
  adminShell.hidden = false;
  skipLink.href = "#admin-main";
  adminIdentity.textContent = session.admin?.displayName || session.admin?.id || "管理员";
  demoBadge.hidden = session.mode !== "demo";
  environmentBadge.textContent = session.mode === "demo" ? "虚构数据环境" : "生产 API";
  syncSidebarForViewport();
  await navigate("overview", { focus: true });
}

async function logout() {
  logoutButton.disabled = true;
  try {
    if (session.mode === "live") {
      await request("/session", { method: "DELETE" });
    }
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) {
      showToast("服务端会话注销失败，请关闭浏览器并通知管理员。");
    }
  } finally {
    session = { mode: null, admin: null, csrfToken: "" };
    demoState = null;
    closeSidebar(false);
    adminShell.hidden = true;
    loginShell.hidden = false;
    skipLink.href = "#login-title";
    loginForm.reset();
    loginMessage.textContent = "";
    logoutButton.disabled = false;
    document.title = "管理员登录 · GAME";
    document.querySelector("#admin-username").focus();
  }
}

async function navigate(view, options = {}) {
  if (!viewTitles[view]) view = "overview";
  currentView = view;

  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== view;
  });
  document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
    if (button.dataset.view === view) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  viewTitle.textContent = viewTitles[view];
  document.title = `${viewTitles[view]} · GAME 管理控制台`;
  closeSidebar(false);

  if (view === "overview") await loadOverview(false);
  if (view === "users") await loadUsers(false);
  if (view === "audit") await loadAudit(auditPage, false);
  if (view === "deepseek") await loadDeepseek(false);
  if (view === "voice") await loadMimo(false);

  if (options.focus !== false) {
    const heading = document.querySelector(`[data-view-panel="${view}"] h1`);
    requestAnimationFrame(() => heading?.focus({ preventScroll: true }));
  }
  window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });
}

async function loadOverview(announce) {
  refreshOverviewButton.disabled = true;
  try {
    const data =
      session.mode === "demo"
        ? buildDemoOverview()
        : await request("/overview");
    renderOverview(data);
    if (announce) showToast("概览已刷新");
  } catch (error) {
    handleViewError(error, "概览加载失败");
  } finally {
    refreshOverviewButton.disabled = false;
  }
}

function buildDemoOverview() {
  const members = demoState.users.filter((user) => user.membershipEnabled).length;
  const agents = demoState.users.filter((user) => user.agentEnabled).length;
  return {
    metrics: [
      { label: "演示用户", value: demoState.users.length, note: "全部为虚构占位账户" },
      { label: "会员授权", value: members, note: "当前启用状态" },
      { label: "Agent 授权", value: agents, note: "与会员资格独立" },
      { label: "审计元数据", value: demoState.auditEvents.length, note: "不包含关系正文" },
    ],
    overallStatus: "healthy",
    services: [
      { label: "管理 API", status: "正常" },
      { label: "授权服务", status: "正常" },
      { label: "审计写入", status: "正常" },
      {
        label: "DeepSeek 模型服务",
        status: demoState.deepseek.enabled ? "已启用" : "已关闭",
        level: demoState.deepseek.enabled ? "good" : "warn",
      },
      {
        label: "Agent 访问总闸",
        status: demoState.deepseek.globalEnabled ? "已开放" : "已关闭",
        level: demoState.deepseek.globalEnabled ? "good" : "warn",
      },
      {
        label: "MiMo V2.5 TTS",
        status: demoState.mimo.enabled ? "已启用" : "待配置",
        level: demoState.mimo.enabled ? "good" : "warn",
      },
    ],
  };
}

function renderOverview(data) {
  const metrics = Array.isArray(data?.metrics) ? data.metrics : [];
  overviewMetrics.replaceChildren(
    ...metrics.map((metric) => {
      const card = document.createElement("article");
      card.className = "metric-card";
      const label = document.createElement("span");
      label.textContent = metric.label || "指标";
      const value = document.createElement("strong");
      value.textContent = String(metric.value ?? "—");
      const note = document.createElement("small");
      note.textContent = metric.note || "";
      card.append(label, value, note);
      return card;
    })
  );

  const services = Array.isArray(data?.services) ? data.services : [];
  serviceStatusList.replaceChildren(
    ...services.map((service) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = service.label || "服务";
      const status = document.createElement("strong");
      status.textContent = service.status || "未知";
      item.append(label, status);
      return item;
    })
  );

  const healthy = data?.overallStatus !== "degraded";
  overallStatus.textContent = healthy ? "正常" : "需关注";
  overallStatus.className = `status-pill ${healthy ? "status-pill--good" : "status-pill--warn"}`;
}

async function loadUsers(announce, append = false) {
  userResultCount.textContent = append ? "正在加载更多用户…" : "正在加载用户列表…";
  userLoadMore.disabled = true;
  if (!append) {
    activeUserFilters = {
      query: userSearch.value.trim(),
      entitlement: entitlementFilter.value,
    };
    nextUsersCursor = null;
    userLoadMore.hidden = true;
  }
  const { query, entitlement } = activeUserFilters;
  const requestGeneration = append
    ? userRequestGeneration
    : ++userRequestGeneration;

  try {
    let payload;
    if (session.mode === "demo") {
      const normalizedQuery = query.toLocaleLowerCase("zh-CN");
      const items = demoState.users.filter((user) => {
        const matchesQuery =
          !normalizedQuery ||
          [user.id, user.alias, user.maskedEmail]
            .join(" ")
            .toLocaleLowerCase("zh-CN")
            .includes(normalizedQuery);
        const matchesEntitlement =
          entitlement === "all" ||
          (entitlement === "member" && user.membershipEnabled) ||
          (entitlement === "agent" && user.agentEnabled) ||
          (entitlement === "none" && !user.membershipEnabled && !user.agentEnabled);
        return matchesQuery && matchesEntitlement;
      });
      payload = { items, total: items.length, nextCursor: null };
    } else {
      const params = new URLSearchParams({
        query,
        entitlement,
        limit: "100",
      });
      if (append && nextUsersCursor) params.set("cursor", nextUsersCursor);
      payload = await request(`/users?${params}`);
    }
    if (requestGeneration !== userRequestGeneration) return;

    const incoming = Array.isArray(payload.items) ? payload.items : [];
    currentUsers = append
      ? [
          ...new Map(
            [...currentUsers, ...incoming].map((user) => [user.id, user])
          ).values(),
        ]
      : incoming;
    nextUsersCursor =
      typeof payload.nextCursor === "string" && payload.nextCursor
        ? payload.nextCursor
        : null;
    userTotal = Number(payload.total ?? currentUsers.length) || 0;
    renderUsers(currentUsers);
    userResultCount.textContent =
      userTotal > currentUsers.length
        ? `已显示 ${currentUsers.length} / ${userTotal} 个匹配用户`
        : `共 ${userTotal} 个匹配用户`;
    userLoadMore.hidden = !nextUsersCursor;
    if (announce) showToast(append ? "已加载更多用户" : "用户列表已更新");
  } catch (error) {
    if (requestGeneration !== userRequestGeneration) return;
    if (!append) {
      userList.replaceChildren();
      currentUsers = [];
      nextUsersCursor = null;
      userTotal = 0;
      userEmpty.hidden = false;
      userLoadMore.hidden = true;
    }
    userResultCount.textContent = append
      ? `已显示 ${currentUsers.length} 个用户；更多用户加载失败`
      : "用户列表加载失败";
    handleViewError(error, "用户列表加载失败");
  } finally {
    if (requestGeneration === userRequestGeneration) {
      userLoadMore.disabled = false;
    }
  }
}

function invalidateUserPagination() {
  const changed =
    userSearch.value.trim() !== activeUserFilters.query ||
    entitlementFilter.value !== activeUserFilters.entitlement;
  if (!changed) return;
  userRequestGeneration += 1;
  nextUsersCursor = null;
  userLoadMore.hidden = true;
  if (currentUsers.length) {
    userResultCount.textContent = "筛选条件已修改；点击“应用筛选”查看新结果。";
  }
}

function renderUsers(users) {
  userList.replaceChildren(...users.map(createUserCard));
  userEmpty.hidden = users.length > 0;
}

function createUserCard(user) {
  const listItem = document.createElement("li");
  const article = document.createElement("article");
  article.className = "user-card";

  const summary = document.createElement("div");
  summary.className = "user-summary";
  const avatar = document.createElement("span");
  avatar.className = "user-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = String(user.alias || user.id || "U").slice(0, 2).toUpperCase();

  const copy = document.createElement("div");
  copy.className = "user-copy";
  const heading = document.createElement("h2");
  heading.textContent = `${user.alias || "匿名用户"} · ${user.id || "ID 未知"}`;
  const joined = document.createElement("small");
  joined.textContent = `加入时间：${formatDateTime(user.joinedAt)}`;
  copy.append(heading);
  if (user.maskedEmail) {
    const email = document.createElement("p");
    email.textContent = user.maskedEmail;
    copy.append(email);
  }
  copy.append(joined);
  if (user.expiresAt) {
    const expiry = document.createElement("small");
    expiry.textContent = `会员到期：${formatDateTime(user.expiresAt)}`;
    copy.append(expiry);
  }
  summary.append(avatar, copy);

  const entitlements = document.createElement("div");
  entitlements.className = "entitlement-group";
  entitlements.append(
    createEntitlementControl(user, "membership", "会员资格", user.membershipEnabled),
    createEntitlementControl(user, "agent", "Agent 权限", user.agentEnabled)
  );

  article.append(summary, entitlements);
  listItem.append(article);
  return listItem;
}

function createEntitlementControl(user, entitlement, label, enabled) {
  const wrapper = document.createElement("div");
  wrapper.className = "entitlement-control";
  const visibleLabel = document.createElement("span");
  visibleLabel.textContent = label;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "switch-button";
  button.setAttribute("role", "switch");
  button.setAttribute("aria-checked", String(Boolean(enabled)));
  button.setAttribute(
    "aria-label",
    `${enabled ? "停用" : "启用"} ${user.alias || user.id} 的${label}`
  );
  button.dataset.entitlement = entitlement;
  button.dataset.userId = user.id;
  wrapper.append(visibleLabel, button);
  return wrapper;
}

function openEntitlementDialog(button) {
  const user = findCurrentUser(button.dataset.userId);
  if (!user) {
    showToast("没有找到该用户，请刷新列表");
    return;
  }

  const entitlement = button.dataset.entitlement;
  const currentValue =
    entitlement === "membership" ? user.membershipEnabled : user.agentEnabled;
  const nextValue = !currentValue;
  const label = entitlement === "membership" ? "会员资格" : "Agent 权限";

  pendingEntitlementChange = {
    userId: user.id,
    entitlement,
    enabled: nextValue,
    expectedVersion: Number(user.version) || 0,
  };
  entitlementTrigger = button;
  entitlementDialogSummary.textContent =
    `将为 ${user.alias || user.id}（${user.id}）${nextValue ? "启用" : "停用"}${label}。`;
  entitlementMessage.textContent = "";
  const matchingReasonCode =
    entitlement === "membership"
      ? nextValue
        ? "membership_approved"
        : "membership_revoked"
      : nextValue
        ? "agent_approved"
        : "agent_revoked";
  for (const option of entitlementReasonCode.options) {
    if (!option.value) continue;
    const generallyApplicable = ["security_review", "account_request"].includes(option.value);
    const allowed = generallyApplicable || option.value === matchingReasonCode;
    option.disabled = !allowed;
    option.hidden = !allowed;
  }
  entitlementReasonCode.value = matchingReasonCode;
  entitlementDialog.showModal();
  requestAnimationFrame(() => entitlementReasonCode.focus());
}

async function applyEntitlementChange(event) {
  event.preventDefault();
  if (!pendingEntitlementChange || !entitlementForm.reportValidity()) return;
  const reasonCode = entitlementReasonCode.value;
  if (!reasonCode) {
    entitlementMessage.textContent = "请选择变更原因。";
    entitlementReasonCode.focus();
    return;
  }

  const submitButton = entitlementForm.querySelector('button[type="submit"]');
  setButtonBusy(submitButton, true, "正在保存…");
  entitlementMessage.textContent = "";

  try {
    const change = pendingEntitlementChange;
    if (session.mode === "demo") {
      const user = findCurrentUser(change.userId);
      const field =
        change.entitlement === "membership" ? "membershipEnabled" : "agentEnabled";
      user[field] = change.enabled;
      user.version = change.expectedVersion + 1;
      appendDemoAuditEvent(change);
    } else {
      const body = {
        reasonCode,
        expectedVersion: change.expectedVersion,
        [change.entitlement === "membership" ? "membershipEnabled" : "agentEnabled"]:
          change.enabled,
      };
      await request(`/users/${encodeURIComponent(change.userId)}/entitlements`, {
        method: "PATCH",
        body,
      });
    }

    entitlementDialog.close("confirmed");
    await loadUsers(false);
    const replacementSwitch = [...userList.querySelectorAll("[data-entitlement]")].find(
      (button) =>
        button.dataset.userId === change.userId &&
        button.dataset.entitlement === change.entitlement
    );
    replacementSwitch?.focus();
    showToast("授权状态已更新并提交审计记录");
  } catch (error) {
    entitlementMessage.textContent = publicError(error, "授权变更失败，请稍后重试。");
  } finally {
    setButtonBusy(submitButton, false);
  }
}

function appendDemoAuditEvent(change) {
  const suffix = String(Date.now()).slice(-7);
  demoState.auditEvents.unshift({
    id: `evt_demo_${suffix}`,
    occurredAt: new Date().toISOString(),
    actorId: demoState.admin.id,
    action: `user.${change.entitlement}.${change.enabled ? "enable" : "disable"}`,
    resourceType: "user",
    resourceId: change.userId,
    result: "success",
    requestId: `req_demo_${suffix}`,
  });
}

function findCurrentUser(userId) {
  return currentUsers.find((user) => user.id === userId) || null;
}

async function loadAudit(page, announce) {
  const requestedPage = Math.max(1, Number(page) || 1);
  auditPrev.disabled = true;
  auditNext.disabled = true;

  try {
    let payload;
    if (session.mode === "demo") {
      const total = demoState.auditEvents.length;
      const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
      const safePage = Math.min(requestedPage, pageCount);
      const start = (safePage - 1) * AUDIT_PAGE_SIZE;
      payload = {
        items: demoState.auditEvents.slice(start, start + AUDIT_PAGE_SIZE),
        page: safePage,
        pageSize: AUDIT_PAGE_SIZE,
        total,
        pageCount,
      };
    } else {
      const params = new URLSearchParams({
        page: String(requestedPage),
        pageSize: String(AUDIT_PAGE_SIZE),
      });
      payload = await request(`/audit-events?${params}`);
    }

    auditPage = Number(payload.page) || requestedPage;
    auditPageCount = Math.max(1, Number(payload.pageCount) || 1);
    renderAudit(payload.items || []);
    auditPageStatus.textContent =
      `第 ${auditPage} / ${auditPageCount} 页，共 ${Number(payload.total) || 0} 条`;
    auditPrev.disabled = auditPage <= 1;
    auditNext.disabled = auditPage >= auditPageCount;

    if (announce) {
      auditPageStatus.tabIndex = -1;
      auditPageStatus.focus();
    }
  } catch (error) {
    auditList.replaceChildren();
    auditPageStatus.textContent = "审计元数据加载失败";
    handleViewError(error, "审计元数据加载失败");
  }
}

function renderAudit(events) {
  auditList.replaceChildren(...events.map(createAuditCard));
}

function createAuditCard(event) {
  const item = document.createElement("li");
  const article = document.createElement("article");
  article.className = "audit-card";

  const time = document.createElement("time");
  time.dateTime = event.occurredAt || "";
  time.textContent = formatDateTime(event.occurredAt);

  const actor = document.createElement("div");
  actor.className = "audit-actor";
  const actorLabel = document.createElement("small");
  actorLabel.textContent = "操作者 ID";
  const actorId = document.createElement("strong");
  actorId.textContent = event.actorId || "unknown";
  actor.append(actorLabel, actorId);

  const action = document.createElement("div");
  action.className = "audit-action";
  const actionLabel = document.createElement("strong");
  actionLabel.textContent = humanizeAction(event.action);
  const requestId = document.createElement("code");
  requestId.textContent = `请求 ${event.requestId || "unknown"}`;
  action.append(actionLabel, requestId);
  if (event.reasonCode) {
    const reasonCode = document.createElement("code");
    reasonCode.textContent = `原因 ${event.reasonCode}`;
    action.append(reasonCode);
  }

  const resource = document.createElement("div");
  resource.className = "audit-resource";
  const resourceType = document.createElement("small");
  resourceType.textContent = event.resourceType || "资源";
  const resourceId = document.createElement("strong");
  resourceId.textContent = event.resourceId || "unknown";
  resource.append(resourceType, resourceId);

  const result = document.createElement("span");
  const resultType =
    event.result === "success"
      ? "success"
      : event.result === "denied"
        ? "denied"
        : "failure";
  result.className = `result-pill result-pill--${resultType}`;
  result.textContent =
    resultType === "success" ? "成功" : resultType === "denied" ? "拒绝" : "失败";

  article.append(time, actor, action, resource, result);
  item.append(article);
  return item;
}

async function loadDeepseek(announce) {
  deepseekMessage.textContent = "";
  agentAccessMessage.textContent = "";
  reloadDeepseekButton.disabled = true;
  try {
    const config = session.mode === "demo"
      ? structuredClone(demoState.deepseek)
      : await Promise.all([
          request("/integrations/deepseek"),
          request("/integrations/deepseek/access"),
        ]).then(([provider, access]) => ({
          ...provider,
          globalEnabled: Boolean(access.globalEnabled),
        }));
    renderDeepseek(config);
    if (announce) showToast("未保存修改已撤销");
  } catch (error) {
    deepseekMessage.textContent = publicError(error, "配置加载失败，请稍后重试。");
  } finally {
    reloadDeepseekButton.disabled = false;
  }
}

async function loadMimo(announce) {
  mimoMessage.textContent = "";
  reloadMimoButton.disabled = true;
  try {
    const config = session.mode === "demo"
      ? structuredClone(demoState.mimo)
      : await request("/integrations/mimo-tts");
    renderMimo(config);
    if (announce) showToast("未保存的语音修改已撤销");
  } catch (error) {
    mimoMessage.textContent = publicError(error, "语音配置加载失败，请稍后重试。");
  } finally {
    reloadMimoButton.disabled = false;
  }
}

function renderMimo(config) {
  mimoEnabled.checked = Boolean(config.enabled);
  mimoModel.value = config.model || "mimo-v2.5-tts";
  mimoApiKey.value = "";
  mimoKeyState.textContent = config.apiKeyConfigured
    ? "已配置（密钥已加密，前端不可读取）"
    : "尚未配置 API Key";
  mimoUpdated.textContent = config.updatedAt
    ? `上次更新：${formatDateTime(config.updatedAt)}`
    : "尚无更新时间";
}

async function saveMimoConfig(event) {
  event.preventDefault();
  mimoMessage.textContent = "";
  if (!mimoForm.reportValidity()) return;
  const submitButton = mimoForm.querySelector('button[type="submit"]');
  setButtonBusy(submitButton, true, "正在保存…");
  const body = {
    enabled: mimoEnabled.checked,
    model: mimoModel.value.trim(),
  };
  const newApiKey = mimoApiKey.value.trim();
  if (newApiKey) body.apiKey = newApiKey;
  try {
    const saved = session.mode === "demo"
      ? { ...demoState.mimo, ...body, apiKeyConfigured: demoState.mimo.apiKeyConfigured || Boolean(newApiKey), updatedAt: new Date().toISOString() }
      : await request("/integrations/mimo-tts", { method: "PATCH", body });
    if (session.mode === "demo") demoState.mimo = saved;
    mimoApiKey.value = "";
    renderMimo(saved);
    showToast("MiMo 语音配置已保存");
  } catch (error) {
    mimoMessage.textContent = publicError(error, "语音配置保存失败，请稍后重试。");
  } finally {
    mimoApiKey.value = "";
    delete body.apiKey;
    setButtonBusy(submitButton, false);
  }
}

function renderDeepseek(config) {
  agentGlobalEnabled.checked = Boolean(config.globalEnabled);
  deepseekEnabled.checked = Boolean(config.enabled);
  deepseekModel.value = config.model || "deepseek-v4-flash";
  deepseekApiKey.value = "";
  deepseekKeyState.textContent = config.apiKeyConfigured
    ? "已配置（密钥已掩码，前端不可读取）"
    : "尚未配置 API Key";
  deepseekUpdated.textContent = config.updatedAt
    ? `上次更新：${formatDateTime(config.updatedAt)}`
    : "尚无更新时间";
}

async function saveAgentAccess(event) {
  event.preventDefault();
  agentAccessMessage.textContent = "";
  const submitButton = agentAccessForm.querySelector('button[type="submit"]');
  setButtonBusy(submitButton, true, "正在保存…");
  try {
    let saved;
    if (session.mode === "demo") {
      demoState.deepseek.globalEnabled = agentGlobalEnabled.checked;
      saved = { globalEnabled: demoState.deepseek.globalEnabled };
      appendDemoAccessAudit(saved.globalEnabled);
    } else {
      saved = await request("/integrations/deepseek/access", {
        method: "PATCH",
        body: { globalEnabled: agentGlobalEnabled.checked },
      });
    }
    agentGlobalEnabled.checked = Boolean(saved.globalEnabled);
    showToast(saved.globalEnabled ? "Agent 全局访问已开放" : "Agent 全局访问已关闭");
  } catch (error) {
    agentAccessMessage.textContent = publicError(
      error,
      "访问策略保存失败，请稍后重试。"
    );
  } finally {
    setButtonBusy(submitButton, false);
  }
}

async function saveDeepseekConfig(event) {
  event.preventDefault();
  deepseekMessage.textContent = "";
  if (!deepseekForm.reportValidity()) return;

  const submitButton = deepseekForm.querySelector('button[type="submit"]');
  setButtonBusy(submitButton, true, "正在保存…");

  const body = {
    enabled: deepseekEnabled.checked,
    model: deepseekModel.value.trim(),
  };
  const preservedGlobalEnabled = agentGlobalEnabled.checked;
  const newApiKey = deepseekApiKey.value.trim();
  if (newApiKey) body.apiKey = newApiKey;

  try {
    let saved;
    if (session.mode === "demo") {
      saved = {
        ...demoState.deepseek,
        enabled: body.enabled,
        model: body.model,
        apiKeyConfigured: demoState.deepseek.apiKeyConfigured || Boolean(newApiKey),
        updatedAt: new Date().toISOString(),
      };
      demoState.deepseek = saved;
      appendDemoConfigurationAudit();
    } else {
      saved = await request("/integrations/deepseek", {
        method: "PATCH",
        body,
      });
      saved = {
        ...saved,
        globalEnabled: preservedGlobalEnabled,
      };
    }
    deepseekApiKey.value = "";
    delete body.apiKey;
    renderDeepseek(saved);
    showToast("DeepSeek 配置已保存");
  } catch (error) {
    deepseekMessage.textContent = publicError(error, "配置保存失败，请稍后重试。");
  } finally {
    deepseekApiKey.value = "";
    delete body.apiKey;
    setButtonBusy(submitButton, false);
  }
}

function appendDemoAccessAudit(enabled) {
  const suffix = String(Date.now()).slice(-7);
  demoState.auditEvents.unshift({
    id: `evt_demo_${suffix}`,
    occurredAt: new Date().toISOString(),
    actorId: demoState.admin.id,
    action: `agent.global.${enabled ? "enable" : "disable"}`,
    resourceType: "agent_access",
    resourceId: "global",
    result: "success",
    requestId: `req_demo_${suffix}`,
  });
}

function appendDemoConfigurationAudit() {
  const suffix = String(Date.now()).slice(-7);
  demoState.auditEvents.unshift({
    id: `evt_demo_${suffix}`,
    occurredAt: new Date().toISOString(),
    actorId: demoState.admin.id,
    action: "deepseek.configuration.update",
    resourceType: "integration",
    resourceId: "deepseek",
    result: "success",
    requestId: `req_demo_${suffix}`,
  });
}

function openSidebar() {
  if (!mobileNav.matches) return;
  sidebar.classList.add("is-open");
  sidebar.removeAttribute("inert");
  sidebar.setAttribute("aria-hidden", "false");
  sidebarScrim.hidden = false;
  adminWorkspace.setAttribute("inert", "");
  document.body.classList.add("menu-open");
  mobileMenu.setAttribute("aria-expanded", "true");
  mobileMenu.setAttribute("aria-label", "关闭导航");
  sidebarClose.focus();
}

function closeSidebar(restoreFocus) {
  sidebar.classList.remove("is-open");
  sidebarScrim.hidden = true;
  adminWorkspace.removeAttribute("inert");
  document.body.classList.remove("menu-open");
  mobileMenu.setAttribute("aria-expanded", "false");
  mobileMenu.setAttribute("aria-label", "打开导航");

  if (mobileNav.matches) {
    sidebar.setAttribute("aria-hidden", "true");
    sidebar.setAttribute("inert", "");
  } else {
    sidebar.removeAttribute("aria-hidden");
    sidebar.removeAttribute("inert");
  }

  if (restoreFocus && !adminShell.hidden) mobileMenu.focus();
}

function syncSidebarForViewport() {
  if (adminShell.hidden) return;
  closeSidebar(false);
}

async function request(path, options = {}) {
  const method = options.method || "GET";
  const headers = {
    Accept: "application/json",
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (
    options.csrf !== false &&
    session.csrfToken &&
    !["GET", "HEAD", "OPTIONS"].includes(method)
  ) {
    headers["X-CSRF-Token"] = session.csrfToken;
  }
  if (options.csrfToken) {
    headers["X-CSRF-Token"] = options.csrfToken;
  }

  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    credentials: "same-origin",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const errorPayload = payload?.error || payload;
    if (response.status === 401 && !loginShell.hidden) {
      throw new ApiError(
        "未登录",
        response.status,
        errorPayload?.code,
        payload?.requestId
      );
    }
    if (response.status === 401 && !adminShell.hidden) {
      session = { mode: null, admin: null, csrfToken: "" };
      adminShell.hidden = true;
      loginShell.hidden = false;
      loginMessage.textContent = "管理会话已过期，请重新登录。";
      document.querySelector("#admin-username").focus();
    }
    throw new ApiError(
      errorPayload?.message || `请求失败（${response.status}）`,
      response.status,
      errorPayload?.code,
      payload?.requestId
    );
  }
  return payload;
}

async function prepareAuthCsrf() {
  const response = await fetch("/api/auth/csrf", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || typeof payload?.csrfToken !== "string") {
    throw new ApiError(
      "无法建立安全登录会话",
      response.status,
      payload?.error?.code || payload?.code,
      payload?.requestId
    );
  }
  return payload.csrfToken;
}

class ApiError extends Error {
  constructor(message, status, code, requestId = "") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

function handleViewError(error, fallback) {
  showToast(publicError(error, fallback));
}

function publicError(error, fallback) {
  let message = fallback;
  if (
    error instanceof ApiError &&
    [
      "csrf_invalid",
      "csrf_failed",
      "preauth_csrf_expired",
      "preauth_csrf_invalid",
      "ADMIN_CSRF_FAILED",
    ].includes(error.code)
  ) {
    message = "安全校验已过期，请刷新页面后重试。";
  } else if (error instanceof ApiError && error.status === 403) {
    message = "当前管理员没有执行此操作的权限。";
  } else if (error instanceof ApiError && error.status === 409) {
    message = "数据已被其他管理员更新，请刷新后重试。";
  } else if (error instanceof ApiError && error.status === 429) {
    message = "操作过于频繁，请稍后重试。";
  }
  const requestId =
    error instanceof ApiError && typeof error.requestId === "string"
      ? error.requestId.slice(0, 120)
      : "";
  return requestId ? `${message}（请求 ${requestId}）` : message;
}

function setButtonBusy(button, busy, busyLabel = "正在处理…") {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalLabel || button.textContent;
    button.disabled = false;
    delete button.dataset.originalLabel;
  }
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = "";
  requestAnimationFrame(() => {
    toast.textContent = message;
    toast.classList.add("is-visible");
  });
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function formatDateTime(value) {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function humanizeAction(action) {
  const labels = {
    "deepseek.configuration.update": "更新 DeepSeek 配置",
    "deepseek.global.disable": "关闭 DeepSeek 全局调用",
    "deepseek.global.enable": "启用 DeepSeek 全局调用",
    "agent.global.disable": "关闭 Agent 全局访问",
    "agent.global.enable": "启用 Agent 全局访问",
    "user.membership.enable": "启用会员资格",
    "user.membership.disable": "停用会员资格",
    "user.agent.enable": "启用 Agent 权限",
    "user.agent.disable": "停用 Agent 权限",
    "admin.session.create": "管理员登录",
    "admin.session.revoke": "管理员退出",
  };
  return labels[action] || action || "未知动作";
}

function reduceMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
