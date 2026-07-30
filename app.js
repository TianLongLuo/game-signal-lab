import {
  ENGINE_VERSION,
  analyzeEvent,
  validateEventInput,
  validateReviewInput,
} from "./src/signal-engine.js";
import {
  AGE_POLICY_VERSION,
  MAX_BACKUP_BYTES,
  MAX_CONTACTS,
  MAX_EVENTS,
  STATE_VERSION,
  createDefaultState,
  inspectStoredState,
  parseBackup,
  toPortableState,
} from "./src/state-schema.js";
import { PlatformClient, PlatformError } from "./src/platform-client.js";

const STORAGE_KEY = "game-signal-lab:v2";
const LEGACY_STORAGE_KEYS = ["game-signal-lab:v1"];
const defaultState = createDefaultState();

const viewTitles = {
  dashboard: "今日概览",
  "new-event": "记录事件",
  people: "关系档案",
  review: "行动复盘",
  profile: "我的表达",
  privacy: "隐私与数据",
  analysis: "信号分析",
  agent: "关系思考 Agent",
};

const signalMeta = {
  weak: {
    label: "弱信号",
    short: "弱",
    className: "weak",
    color: "#aeb6c8",
  },
  medium: {
    label: "中等信号",
    short: "中",
    className: "medium",
    color: "#e0a63a",
  },
  strong: {
    label: "强信号",
    short: "强",
    className: "strong",
    color: "#aee8d0",
  },
  stop: {
    label: "停止推进",
    short: "停",
    className: "stop",
    color: "#f57464",
  },
};

let startupWarning = "";
let storageRecovery = null;
let state = loadState();
let currentView = "dashboard";
let currentEventId = null;
let reviewEventId = null;
let preferredContactId = null;
let toastTimer = null;
const platformClient = new PlatformClient();
const platform = {
  available: null,
  user: null,
  membership: null,
  externalAiConsent: null,
  capabilities: null,
  agentMessages: [],
  agentBusy: false,
  agentController: null,
};

const appShell = document.querySelector("#app-shell");
const main = document.querySelector("#main-content");
const ageGate = document.querySelector("#age-gate");
const adultCheck = document.querySelector("#adult-check");
const enterApp = document.querySelector("#enter-app");
const toast = document.querySelector("#toast");
const sidebar = document.querySelector(".sidebar");
const mobileMenu = document.querySelector("#mobile-menu");
const sidebarScrim = document.querySelector("#sidebar-scrim");
const workspace = document.querySelector(".workspace");

init();

function init() {
  appShell.classList.add("is-ready");
  syncProfileAvatar();
  bindGlobalEvents();
  setMobileMenu(false);
  renderCurrentView();
  void refreshPlatformSession();

  const hasCurrentAdultConsent =
    state.adultConfirmed && state.agePolicyVersion === AGE_POLICY_VERSION;
  if (!hasCurrentAdultConsent) {
    state.adultConfirmed = false;
    setAppAvailability(false);
    ageGate.showModal();
  } else {
    setAppAvailability(true);
  }

  if (startupWarning) {
    requestAnimationFrame(() => showToast(startupWarning, 5200));
  }
}

function bindGlobalEvents() {
  ageGate.addEventListener("cancel", (event) => {
    event.preventDefault();
  });

  ageGate.addEventListener("close", () => {
    if (!state.adultConfirmed && !ageGate.open) ageGate.showModal();
  });

  adultCheck.addEventListener("change", () => {
    enterApp.disabled = !adultCheck.checked;
  });

  enterApp.addEventListener("click", () => {
    if (!adultCheck.checked) return;
    state.adultConfirmed = true;
    state.adultConfirmedAt = new Date().toISOString();
    state.agePolicyVersion = AGE_POLICY_VERSION;
    persistCurrentState();
    ageGate.close();
    setAppAvailability(true);
    main.focus();
  });

  mobileMenu.addEventListener("click", () => {
    setMobileMenu(!sidebar.classList.contains("is-open"));
  });

  sidebarScrim.addEventListener("click", () => setMobileMenu(false, true));
  window.addEventListener("resize", () => setMobileMenu(false));

  document.addEventListener("click", async (event) => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
      preferredContactId =
        viewButton.dataset.view === "new-event" && viewButton.dataset.contactId
          ? viewButton.dataset.contactId
          : preferredContactId;
      navigate(viewButton.dataset.view);
      return;
    }

    const action = event.target.closest("[data-action]");
    if (!action) return;

    const actionName = action.dataset.action;

    if (actionName === "load-sample") {
      loadSampleData();
    }

    if (actionName === "open-analysis") {
      currentEventId = action.dataset.eventId;
      navigate("analysis");
    }

    if (actionName === "open-review") {
      reviewEventId = action.dataset.eventId;
      currentView = "review";
      renderCurrentView();
      requestAnimationFrame(() => {
        const title = document.querySelector("#review-form-title");
        title?.scrollIntoView({ behavior: "smooth", block: "center" });
        title?.focus({ preventScroll: true });
      });
    }

    if (actionName === "cancel-review") {
      const eventId = reviewEventId;
      reviewEventId = null;
      renderCurrentView();
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-action="open-review"][data-event-id="${cssEscape(eventId)}"]`)
          ?.focus();
      });
    }

    if (actionName === "copy-response") {
      const text = action.dataset.text || "";
      await copyText(text);
    }

    if (actionName === "export-data") {
      exportData();
    }

    if (actionName === "export-recovery-data") {
      exportRecoveryData();
    }

    if (actionName === "clear-data") {
      clearData();
    }

    if (actionName === "delete-event") {
      deleteEvent(action.dataset.eventId);
    }

    if (actionName === "delete-contact") {
      deleteContact(action.dataset.contactId);
    }

    if (actionName === "import-data") {
      document.querySelector("#data-import")?.click();
    }

    if (actionName === "platform-logout") {
      await logoutPlatform();
    }

    if (actionName === "clear-agent-chat") {
      platform.agentMessages = [];
      renderCurrentView();
      requestAnimationFrame(() => document.querySelector("#agent-prompt")?.focus());
    }

    if (actionName === "cancel-agent") {
      platform.agentController?.abort();
    }

    if (actionName === "refresh-platform") {
      await refreshPlatformSession();
      showToast("账户与 Agent 授权状态已刷新");
    }

    if (actionName === "revoke-ai-consent") {
      const confirmed = window.confirm(
        "撤回后，新的 Agent 请求会被服务端拒绝；本地关系记录不会被删除。是否继续？"
      );
      if (confirmed) await updateExternalAiConsent(false);
    }

    if (actionName === "agent-starter") {
      const prompt = document.querySelector("#agent-prompt");
      if (prompt) {
        prompt.value = action.dataset.prompt || "";
        prompt.focus();
      }
    }
  });

  document.addEventListener("change", async (event) => {
    if (event.target.matches("#data-import")) {
      const [file] = event.target.files || [];
      if (file) await importData(file);
      event.target.value = "";
      return;
    }

    if (event.target.matches("#event-contact")) {
      const contact = getContact(event.target.value);
      const stage = document.querySelector("#event-stage");
      if (contact && stage) stage.value = contact.stage;
    }
  });

  document.addEventListener("submit", async (event) => {
    if (event.target.matches("#profile-form")) {
      event.preventDefault();
      saveProfile(new FormData(event.target));
    }

    if (event.target.matches("#contact-form")) {
      event.preventDefault();
      createContact(event.target, new FormData(event.target));
    }

    if (event.target.matches("#event-form")) {
      event.preventDefault();
      createEvent(event.target, new FormData(event.target));
    }

    if (event.target.matches("#review-form")) {
      event.preventDefault();
      saveReview(event.target, new FormData(event.target));
    }

    if (event.target.matches("#platform-login-form")) {
      event.preventDefault();
      await authenticatePlatform(event.target, "login");
    }

    if (event.target.matches("#platform-register-form")) {
      event.preventDefault();
      await authenticatePlatform(event.target, "register");
    }

    if (event.target.matches("#agent-form")) {
      event.preventDefault();
      await submitAgentPrompt(event.target, new FormData(event.target));
    }

    if (event.target.matches("#external-ai-consent-form")) {
      event.preventDefault();
      const formData = new FormData(event.target);
      await updateExternalAiConsent(
        formData.get("accepted") === "on",
        String(formData.get("policyVersion") || ""),
        event.target
      );
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sidebar.classList.contains("is-open")) {
      setMobileMenu(false, true);
    }
  });
}

function navigate(view) {
  if (!viewTitles[view]) view = "dashboard";
  currentView = view;
  if (view !== "analysis") currentEventId = null;
  if (view !== "review") reviewEventId = null;
  setMobileMenu(false);
  renderCurrentView();
  window.scrollTo({ top: 0, behavior: "smooth" });
  requestAnimationFrame(() => main.focus({ preventScroll: true }));
}

function setAppAvailability(available) {
  appShell.setAttribute("aria-hidden", String(!available));
  if (available) appShell.removeAttribute("inert");
  else appShell.setAttribute("inert", "");
}

function setMobileMenu(open, restoreFocus = false) {
  const isMobile = window.matchMedia("(max-width: 980px)").matches;
  if (!isMobile) open = false;
  sidebar.classList.toggle("is-open", open);
  sidebarScrim.hidden = !open;
  mobileMenu.setAttribute("aria-expanded", String(open));
  mobileMenu.setAttribute("aria-label", open ? "关闭导航" : "打开导航");
  document.body.classList.toggle("menu-open", open);

  if (isMobile && !open) {
    sidebar.setAttribute("aria-hidden", "true");
    sidebar.setAttribute("inert", "");
  } else {
    sidebar.removeAttribute("aria-hidden");
    sidebar.removeAttribute("inert");
  }

  if (isMobile && open) {
    workspace.setAttribute("aria-hidden", "true");
    workspace.setAttribute("inert", "");
    requestAnimationFrame(() => sidebar.querySelector("button")?.focus());
  } else {
    workspace.removeAttribute("aria-hidden");
    workspace.removeAttribute("inert");
  }

  if (!open && restoreFocus) mobileMenu.focus();
}

function renderCurrentView() {
  updateNavigation();

  switch (currentView) {
    case "new-event":
      main.innerHTML = renderNewEvent();
      break;
    case "people":
      main.innerHTML = renderPeople();
      break;
    case "review":
      main.innerHTML = renderReview();
      break;
    case "profile":
      main.innerHTML = renderProfile();
      break;
    case "privacy":
      main.innerHTML = renderPrivacy();
      break;
    case "analysis":
      main.innerHTML = renderAnalysis(currentEventId);
      break;
    case "agent":
      main.innerHTML = renderAgent();
      break;
    default:
      main.innerHTML = renderDashboard();
  }
}

function updateNavigation() {
  document.querySelector("#topbar-title").textContent = viewTitles[currentView] || "Signal Lab";
  document.title = `${viewTitles[currentView] || "Signal Lab"} · GAME`;
  document.querySelectorAll(".nav-item[data-view]").forEach((item) => {
    const isCurrent = item.dataset.view === currentView;
    item.classList.toggle("is-active", isCurrent);
    if (isCurrent) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
}

async function refreshPlatformSession() {
  if (window.__GAME_RUNTIME__?.apiEnabled !== true) {
    platform.available = false;
    platform.user = null;
    platform.membership = null;
    platform.externalAiConsent = null;
    platform.capabilities = null;
    syncPlatformStatus();
    if (currentView === "agent") renderCurrentView();
    return;
  }
  try {
    const payload = await platformClient.me();
    platform.available = true;
    platform.user = payload.user || null;
    platform.membership = payload.membership || null;
    platform.externalAiConsent = payload.externalAiConsent || null;
    platform.capabilities = payload.capabilities || null;
  } catch (error) {
    if (error instanceof PlatformError && error.status === 401) {
      platform.available = true;
      platform.user = null;
      platform.membership = null;
      platform.externalAiConsent = null;
      platform.capabilities = null;
    } else {
      platform.available = false;
      platform.user = null;
      platform.membership = null;
      platform.externalAiConsent = null;
      platform.capabilities = null;
    }
  }
  syncPlatformStatus();
  if (currentView === "agent") renderCurrentView();
}

function syncPlatformStatus() {
  const status = document.querySelector("#platform-status");
  if (!status) return;
  if (platform.user) {
    status.textContent = `${platform.user.username} · ${
      platform.membership?.plan === "member" ? "会员" : "账户"
    }`;
    status.classList.add("is-online");
  } else if (platform.available === false) {
    status.textContent = "本地模式";
    status.classList.remove("is-online");
  } else {
    status.textContent = "登录 Agent";
    status.classList.remove("is-online");
  }
}

function renderAgent() {
  if (platform.available === null) {
    return `
      <div class="page">
        ${pageHeading("关系思考 Agent", "正在确认服务状态。", "你的本地关系记录不会在后台自动上传。")}
        <section class="panel agent-loading" aria-live="polite">正在连接同源服务…</section>
      </div>
    `;
  }

  if (!platform.user) return renderAgentAuth();

  if (!platform.externalAiConsent?.current) return renderExternalAiConsent();

  if (!platform.capabilities?.agent) return renderAgentAccessPending();

  const messages = platform.agentMessages.length
    ? platform.agentMessages.map(renderAgentMessage).join("")
    : `
      <div class="agent-empty">
        <p class="eyebrow">Editorial prompt desk</p>
        <h2>先把问题写清楚，<br />再寻找行动。</h2>
        <p>Agent 适合帮你区分事实、解释与边界。它不会读取本地事件，也不会替你判断另一个人的内心。</p>
        <div class="agent-starters">
          <button type="button" data-action="agent-starter" data-prompt="帮我把一段关系困惑拆成：事实、我的解释、还缺什么信息。">拆分事实与解释</button>
          <button type="button" data-action="agent-starter" data-prompt="请帮我写一个低压力、允许对方自由拒绝的邀约。">准备低压力表达</button>
          <button type="button" data-action="agent-starter" data-prompt="我收到一个边界信号，请帮我判断现在应当停止、降级还是直接沟通确认。">检查边界信号</button>
        </div>
      </div>
    `;

  return `
    <div class="page agent-page">
      <header class="agent-masthead">
        <div>
          <p class="eyebrow">GAME · FIELD NOTES / AI</p>
          <h1>关系思考<br /><em>Agent</em></h1>
        </div>
        <div class="agent-account">
          <span>已登录</span>
          <strong>${escapeHTML(platform.user.username)}</strong>
          <small>${escapeHTML(membershipLabel(platform.membership))}</small>
          <button class="text-button" type="button" data-action="revoke-ai-consent">撤回 AI 同意</button>
          <button class="text-button" type="button" data-action="platform-logout">退出账户</button>
        </div>
      </header>

      <div class="agent-layout">
        <section class="agent-thread" aria-label="Agent 对话">
          <div class="agent-thread-head">
            <span>VOL. 01 · 当前会话</span>
            <button class="text-button" type="button" data-action="clear-agent-chat" ${
              platform.agentBusy ? "disabled" : ""
            }>清空临时会话</button>
          </div>
          <div class="agent-messages" id="agent-messages" aria-live="polite">
            ${messages}
          </div>
        </section>

        <aside class="agent-compose">
          <p class="eyebrow">给 Agent 的编辑笺</p>
          <h2>写下你真正想弄清楚的事。</h2>
          <form id="agent-form">
            <label class="visually-hidden" for="agent-prompt">发送给关系思考 Agent 的内容</label>
            <textarea
              id="agent-prompt"
              name="prompt"
              maxlength="4000"
              placeholder="只写必要信息；请用代号，不要粘贴姓名、地址、账号或完整聊天记录。"
              required
              ${platform.agentBusy ? "disabled" : ""}
            ></textarea>
            <p class="form-error" id="agent-error" role="alert" aria-live="assertive"></p>
            <div class="button-row">
              <button class="button button--primary" type="submit" ${platform.agentBusy ? "disabled" : ""}>
                开始流式思考
              </button>
              ${
                platform.agentBusy
                  ? '<button class="button button--quiet" type="button" data-action="cancel-agent">停止生成</button>'
                  : ""
              }
            </div>
          </form>
          <p class="agent-privacy-note">
            明示发送的内容会由服务器转交 DeepSeek；服务端不保存提示词或回复正文。账号、授权和调用结果元数据会进入安全审计。
          </p>
        </aside>
      </div>
    </div>
  `;
}

function renderExternalAiConsent() {
  const policyVersion =
    platform.externalAiConsent?.policyVersion || "current";
  return `
    <div class="page">
      <header class="auth-masthead">
        <p class="eyebrow">EXTERNAL AI · CONSENT NOTE</p>
        <h1>发送之前，<br /><em>先把数据去向说清楚。</em></h1>
        <p>本地日记不会自动上传。只有你在 Agent 输入框中明确发送的文字会由 GAME 服务端转交 DeepSeek 生成回应。</p>
      </header>
      <div class="consent-layout">
        <section>
          <p class="eyebrow">处理说明 · ${escapeHTML(policyVersion)}</p>
          <h2>这项同意与会员资格分开。</h2>
          <ul>
            <li>请只使用代号和最少必要上下文，不发送姓名、账号、地址、定位或完整聊天记录。</li>
            <li>GAME 服务端不保存提示词和模型回复正文；会保留调用结果等最小安全审计元数据。</li>
            <li>DeepSeek 作为外部模型提供方会接收你明确发送的文字；其处理受相应服务政策约束。</li>
            <li>你可以随时撤回。撤回后新的 Agent 请求会被服务端拒绝，本地日记不受影响。</li>
          </ul>
        </section>
        <form id="external-ai-consent-form">
          <input type="hidden" name="policyVersion" value="${escapeAttribute(policyVersion)}" />
          <label class="check-row consent-check">
            <input type="checkbox" name="accepted" required />
            <span>我已阅读并同意将我主动发送的 Agent 文字交给 DeepSeek 处理。</span>
          </label>
          <p class="form-error" data-consent-error role="alert" aria-live="assertive"></p>
          <button class="button button--primary" type="submit">同意并继续</button>
        </form>
      </div>
    </div>
  `;
}

function renderAgentAccessPending() {
  return `
    <div class="page">
      <header class="auth-masthead">
        <p class="eyebrow">MEMBERSHIP · ACCESS</p>
        <h1>账户已准备，<br /><em>Agent 尚未开放。</em></h1>
        <p>管理员需要同时启用全局 Agent 服务、有效会员资格与此账户的单独授权。当前状态不会影响本地关系记录。</p>
      </header>
      <section class="privacy-spread">
        <p class="eyebrow">ACCOUNT NOTE</p>
        <h2>${escapeHTML(platform.user.username)}</h2>
        <div>
          <p><strong>会员状态</strong> — ${escapeHTML(membershipLabel(platform.membership))}</p>
          <p><strong>外部 AI 同意</strong> — 已确认，可随时撤回。</p>
          <div class="button-row">
            <button class="button button--quiet" type="button" data-action="refresh-platform">刷新授权</button>
            <button class="text-button" type="button" data-action="revoke-ai-consent">撤回外部 AI 同意</button>
            <button class="text-button" type="button" data-action="platform-logout">退出账户</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderAgentAuth() {
  const serviceNote =
    platform.available === false
      ? "当前以纯静态方式打开，账号服务不可用；本地记录功能仍可正常使用。请通过 Node 服务启动后再登录。"
      : "登录后才会向后台发送账号操作。你的本地档案、事件与复盘不会自动同步。";
  return `
    <div class="page">
      <header class="auth-masthead">
        <p class="eyebrow">GAME · MEMBERS' EDITION</p>
        <h1>把不确定写成<br /><em>可以讨论的问题。</em></h1>
        <p>${serviceNote}</p>
      </header>

      <div class="auth-grid">
        <form class="auth-panel" id="platform-login-form">
          <span class="editorial-number">01</span>
          <p class="eyebrow">已有账户</p>
          <h2>登录 Agent</h2>
          ${authFields("login")}
          <p class="form-error" data-auth-error role="alert" aria-live="assertive"></p>
          <button class="button button--primary" type="submit" ${
            platform.available === false ? "disabled" : ""
          }>登录</button>
        </form>

        <form class="auth-panel auth-panel--ink" id="platform-register-form">
          <span class="editorial-number">02</span>
          <p class="eyebrow">创建账户</p>
          <h2>从一页空白开始</h2>
          ${authFields("register")}
          <p class="form-error" data-auth-error role="alert" aria-live="assertive"></p>
          <button class="button button--light" type="submit" ${
            platform.available === false ? "disabled" : ""
          }>注册并登录</button>
        </form>
      </div>

      <section class="privacy-spread">
        <p class="eyebrow">DATA NOTE</p>
        <h2>两个空间，清楚分开。</h2>
        <div>
          <p><strong>本地日记</strong> — 匿名档案、事件、分析和复盘保留在浏览器里。</p>
          <p><strong>显式 Agent 对话</strong> — 只有你按下发送的内容才进入模型请求，且服务端不保存正文。</p>
        </div>
      </section>
    </div>
  `;
}

function authFields(prefix) {
  return `
    <div class="field">
      <label for="${prefix}-username">用户名</label>
      <input
        id="${prefix}-username"
        name="username"
        minlength="3"
        maxlength="40"
        autocomplete="username"
        autocapitalize="none"
        spellcheck="false"
        required
      />
    </div>
    <div class="field">
      <label for="${prefix}-password">密码</label>
      <input
        id="${prefix}-password"
        name="password"
        type="password"
        minlength="12"
        maxlength="128"
        autocomplete="${prefix === "register" ? "new-password" : "current-password"}"
        required
      />
      <small>至少 12 个字符；密码只提交给同源服务。</small>
    </div>
  `;
}

function renderAgentMessage(message, index) {
  const assistant = message.role === "assistant";
  return `
    <article class="agent-message agent-message--${assistant ? "assistant" : "user"}">
      <header>
        <span>${assistant ? "GAME / AGENT" : "YOU / NOTE"}</span>
        <small>${String(index + 1).padStart(2, "0")}</small>
      </header>
      <p ${assistant && index === platform.agentMessages.length - 1 ? 'id="agent-response-last"' : ""}>${
        message.content ? escapeHTML(message.content) : "正在组织回应…"
      }</p>
    </article>
  `;
}

function membershipLabel(membership) {
  if (!membership) return "未读取会员状态";
  const plan = membership.plan === "member" ? "会员" : "普通账户";
  const status = membership.status === "active" ? "有效" : membership.status || "未知";
  return `${plan} · ${status}`;
}

async function authenticatePlatform(form, mode) {
  const errorNode = form.querySelector("[data-auth-error]");
  const submit = form.querySelector('button[type="submit"]');
  errorNode.textContent = "";
  submit.disabled = true;
  const formData = new FormData(form);
  const username = clean(formData.get("username"));
  const password = String(formData.get("password") || "");

  try {
    const payload =
      mode === "register"
        ? await platformClient.register(username, password)
        : await platformClient.login(username, password);
    platform.available = true;
    platform.user = payload.user;
    platform.membership = payload.membership;
    await refreshPlatformSession();
    syncPlatformStatus();
    showToast(mode === "register" ? "账户已创建并安全登录" : "已登录关系思考 Agent");
    requestAnimationFrame(() => document.querySelector("#agent-prompt")?.focus());
  } catch (error) {
    errorNode.textContent =
      error instanceof PlatformError ? error.message : "登录请求未完成，请稍后重试。";
    submit.disabled = false;
  }
}

async function logoutPlatform() {
  try {
    await platformClient.logout();
  } catch (error) {
    if (!(error instanceof PlatformError && error.status === 401)) {
      showToast(error instanceof Error ? error.message : "退出未完成", 4200);
      return;
    }
  }
  platform.user = null;
  platform.membership = null;
  platform.externalAiConsent = null;
  platform.capabilities = null;
  platform.agentMessages = [];
  platform.agentController?.abort();
  platform.agentBusy = false;
  syncPlatformStatus();
  renderCurrentView();
  showToast("已退出账户；本地关系记录未受影响");
}

async function updateExternalAiConsent(accepted, policyVersion = "", form = null) {
  const errorNode = form?.querySelector("[data-consent-error]");
  const submit = form?.querySelector('button[type="submit"]');
  if (errorNode) errorNode.textContent = "";
  if (submit) submit.disabled = true;
  try {
    await platformClient.setExternalAiConsent(accepted, policyVersion);
    await refreshPlatformSession();
    showToast(accepted ? "外部 AI 处理同意已记录" : "外部 AI 处理同意已撤回");
  } catch (error) {
    const message =
      error instanceof PlatformError ? error.message : "同意状态未能更新，请稍后重试。";
    if (errorNode) {
      errorNode.textContent = message;
      submit.disabled = false;
    } else {
      showToast(message, 4600);
    }
  }
}

async function submitAgentPrompt(form, formData) {
  if (!platform.user || platform.agentBusy) return;
  const prompt = clean(formData.get("prompt"));
  const errorNode = form.querySelector("#agent-error");
  if (!prompt) {
    errorNode.textContent = "请先写下一个想讨论的问题。";
    return;
  }

  const conversation = [
    ...platform.agentMessages,
    { role: "user", content: prompt },
  ]
    .filter((message) => message.content)
    .slice(-12)
    .map(({ role, content }) => ({ role, content: content.slice(0, 12000) }));

  platform.agentMessages.push({ role: "user", content: prompt });
  platform.agentMessages.push({ role: "assistant", content: "" });
  platform.agentMessages = platform.agentMessages.slice(-14);
  platform.agentBusy = true;
  platform.agentController = new AbortController();
  renderCurrentView();
  requestAnimationFrame(() => {
    document.querySelector("#agent-response-last")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  });

  try {
    const complete = await platformClient.streamAgent(conversation, {
      signal: platform.agentController.signal,
      onText(_chunk, fullText) {
        const target = platform.agentMessages.at(-1);
        if (target?.role === "assistant") target.content = fullText.slice(0, 20000);
        const node = document.querySelector("#agent-response-last");
        if (node) node.textContent = target?.content || "";
      },
    });
    const target = platform.agentMessages.at(-1);
    if (target?.role === "assistant" && !target.content) {
      target.content = complete || "这次没有收到可显示的文本，请稍后再试。";
    }
  } catch (error) {
    const target = platform.agentMessages.at(-1);
    if (target?.role === "assistant") {
      target.content =
        error?.name === "AbortError"
          ? "生成已由你停止。"
          : error instanceof PlatformError
            ? error.message
            : "这次回应没有完成，请稍后重试。";
    }
  } finally {
    platform.agentBusy = false;
    platform.agentController = null;
    renderCurrentView();
    requestAnimationFrame(() => {
      document.querySelector("#agent-response-last")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      document.querySelector("#agent-prompt")?.focus({ preventScroll: true });
    });
  }
}

function renderDashboard() {
  const completedReviews = state.events.filter((item) => item.review?.result).length;
  const boundaryFirstEvents = state.events.filter((item) =>
    ["deescalate", "stop"].includes(item.analysis.actionPolicy)
  ).length;
  const latestEvents = [...state.events]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 4);
  const heroTitle = state.profile.name
    ? `${escapeHTML(state.profile.name)}，<br />先写下发生了什么。`
    : "先写下<br />发生了什么。";

  return `
    <div class="page">
      ${renderStorageRecoveryNotice()}
      <section class="hero-grid">
        <article class="hero-card">
          <p class="eyebrow">从混乱走向清晰</p>
          <h1>${heroTitle}</h1>
          <p>把事实与猜测分开，再决定要不要行动。明确表达和真实反馈，始终比任何信号推断更可靠。</p>
          <button class="button" data-view="new-event">
            记录一件互动
            <span aria-hidden="true">→</span>
          </button>
        </article>
        <article class="lens-card">
          <div class="signal-lens" aria-label="信号透镜图形">
            <span class="lens-core">WHY?</span>
          </div>
          <p class="lens-caption">信号不是答案，<br />而是需要放回情境的证据。</p>
        </article>
      </section>

      <section class="metric-grid" aria-label="使用数据概览">
        <article class="metric-card">
          <span>已记录事件</span>
          <strong>${state.events.length.toString().padStart(2, "0")}</strong>
          <small>每条记录都可以继续补充结果</small>
        </article>
        <article class="metric-card">
          <span>已完成复盘</span>
          <strong>${completedReviews.toString().padStart(2, "0")}</strong>
          <small>真实反馈会修正原来的判断</small>
        </article>
        <article class="metric-card">
          <span>边界优先提醒</span>
          <strong>${boundaryFirstEvents.toString().padStart(2, "0")}</strong>
          <small>回避、拒绝和不舒服不会被积极信号覆盖</small>
        </article>
      </section>

      <section class="section">
        <div class="section-title">
          <h2>最近事件</h2>
          ${state.events.length ? '<button class="text-button" data-view="review">查看全部复盘 →</button>' : ""}
        </div>
        ${
          latestEvents.length
            ? `<div class="card-list">${latestEvents.map(renderEventCard).join("")}</div>`
            : renderDashboardEmpty()
        }
      </section>
    </div>
  `;
}

function renderDashboardEmpty() {
  return `
    <div class="empty-state">
      <div>
        <div class="empty-symbol" aria-hidden="true">＋</div>
        <h3>从一个真实事件开始</h3>
        <p>如果暂时没有可记录的事件，可以先加载一组匿名示例，看看分析和复盘如何工作。</p>
        <div class="button-row" style="justify-content:center">
          <button class="button button--primary" data-view="new-event">创建第一条记录</button>
          <button class="button button--quiet" data-action="load-sample">载入匿名示例</button>
        </div>
      </div>
    </div>
  `;
}

function renderEventCard(item) {
  const contact = getContact(item.contactId);
  const signal = signalMeta[item.analysis.strength] || signalMeta.weak;
  return `
    <button class="event-card" data-action="open-analysis" data-event-id="${escapeAttribute(item.id)}">
      <span class="signal-pill signal-pill--${signal.className}">${signal.short}</span>
      <span class="event-copy">
        <strong>${escapeHTML(contact?.alias || "已删除档案")} · ${escapeHTML(item.scene || item.stage)}</strong>
        <p>${escapeHTML(item.fact)}</p>
      </span>
      <span class="event-meta">
        <b>${signal.label}</b>
        <span>${formatDate(item.date)}</span>
      </span>
    </button>
  `;
}

function renderNewEvent() {
  if (!state.contacts.length) {
    return `
      <div class="page">
        ${pageHeading("记录事件", "先建立一个匿名关系档案", "只用代号记录必要信息，避免保存真实姓名或可识别的隐私。")}
        <div class="empty-state">
          <div>
            <div class="empty-symbol" aria-hidden="true">◎</div>
            <h3>还没有关系档案</h3>
            <p>建立匿名代号后，就可以把互动事件放回具体关系和阶段中分析。</p>
            <button class="button button--primary" data-view="people">新建关系档案</button>
          </div>
        </div>
      </div>
    `;
  }

  const selectedContact =
    state.contacts.find((item) => item.id === preferredContactId) || state.contacts[0];
  preferredContactId = selectedContact.id;
  const contactOptions = state.contacts
    .map(
      (item) =>
        `<option value="${escapeAttribute(item.id)}" ${item.id === selectedContact.id ? "selected" : ""}>${escapeHTML(item.alias)} · ${escapeHTML(item.stage)}</option>`
    )
    .join("");
  const stages = ["刚认识", "持续了解", "第一次见面", "约会中", "稳定交往", "关系降温", "关系结束"];

  return `
    <div class="page">
      ${renderStorageRecoveryNotice()}
      ${pageHeading(
        "记录事件",
        "把观察与解释分开。",
        "分析越依赖具体事实，越不容易被期待、焦虑或单次行为带偏。"
      )}

      <div class="form-layout">
        <form class="panel" id="event-form">
          <div class="form-section">
            <h3>事件背景</h3>
            <p>选择关系档案，并说明这次互动发生在什么阶段与场景。</p>
            <div class="form-grid">
              <div class="field">
                <label for="event-contact">关系代号</label>
                <select id="event-contact" name="contactId" required>${contactOptions}</select>
              </div>
              <div class="field">
                <label for="event-date">发生日期</label>
                <input id="event-date" name="date" type="date" value="${todayISO()}" required />
              </div>
              <div class="field">
                <label for="event-stage">互动阶段</label>
                <select id="event-stage" name="stage" required>
                  ${stages
                    .map(
                      (stage) =>
                        `<option ${stage === selectedContact.stage ? "selected" : ""}>${stage}</option>`
                    )
                    .join("")}
                </select>
              </div>
              <div class="field">
                <label for="event-scene">场景</label>
                <input
                  id="event-scene"
                  name="scene"
                  placeholder="例如：咖啡店见面后 / 微信聊天"
                  maxlength="200"
                  required
                />
              </div>
            </div>
          </div>

          <div class="form-section">
            <h3>事实与解释</h3>
            <p>“对方说今天很忙”是事实；“对方不想见我”是解释。</p>
            <div class="form-grid">
              <div class="field field--full">
                <label for="event-fact">观察到的事实</label>
                <textarea
                  id="event-fact"
                  name="fact"
                  placeholder="尽量记录原话、行为、时间与上下文，不写结论。"
                  maxlength="2000"
                  required
                ></textarea>
              </div>
              <div class="field field--full">
                <label for="event-interpretation">你当时的解释</label>
                <textarea
                  id="event-interpretation"
                  name="interpretation"
                  placeholder="你认为这件事可能意味着什么？"
                  maxlength="1000"
                  required
                ></textarea>
              </div>
              <div class="field">
                <label for="event-feeling">当时的感受</label>
                <input id="event-feeling" name="feeling" placeholder="例如：期待、紧张、失落" maxlength="200" />
              </div>
              <div class="field">
                <label for="event-reply">你如何回应</label>
                <input id="event-reply" name="reply" placeholder="尚未回应也可以写“还没有”" maxlength="400" />
              </div>
            </div>
          </div>

          <div class="form-section" role="group" aria-labelledby="evidence-heading">
            <h3 id="evidence-heading">边界确认与证据线索</h3>
            <p>先确认边界，再看积极信号。拒绝、不舒服或持续回避不会被其他信号抵消。</p>
            <div class="field field--full boundary-field">
              <label for="event-boundary-status">当前是否存在明确拒绝、不舒服或要求停止？</label>
              <select id="event-boundary-status" name="boundaryStatus" required>
                <option value="">请选择最符合事实的一项</option>
                <option value="clear">没有看到明确拒绝或不舒服</option>
                <option value="uncertain">我不确定，需要先降低强度或澄清</option>
                <option value="stop">有明确拒绝、不舒服或要求停止</option>
              </select>
            </div>
            <p>只勾选你能从实际互动中确认的项目。单次行为通常不足以下结论。</p>
            <div class="choice-grid">
              ${signalCheckbox("directInterest", "对方明确表达兴趣", "清楚说出想继续了解、喜欢或期待见面")}
              ${signalCheckbox("futurePlan", "主动安排下一次互动", "提出具体时间、地点或共同计划")}
              ${signalCheckbox("repeatedInitiative", "多次主动联系或投入", "不是单次礼貌，而是持续出现的模式")}
              ${signalCheckbox("detailedFollowup", "记得细节并继续追问", "对你的生活和表达有持续关注")}
              ${signalCheckbox("politeOnly", "目前只有普通礼貌", "没有超出常规社交的投入或明确表达")}
              ${signalCheckbox("delayAvoidance", "持续回避或多次失约", "长期模糊、推迟，且没有替代安排", true)}
              ${signalCheckbox("explicitDecline", "已明确拒绝", "对方清楚表示不愿意继续或不感兴趣", true)}
              ${signalCheckbox("discomfort", "出现不舒服或边界提醒", "对方表现紧张、抗拒，或要求停止", true)}
            </div>
            <p class="form-error" id="event-signal-error" role="alert" aria-live="polite"></p>
          </div>

          <div class="form-section">
            <label class="check-row">
              <input type="checkbox" name="consent" required />
              <span>我确认只记录合法、必要的信息；如涉及第三方原话或聊天内容，我有权保存和处理这些内容。</span>
            </label>
            <div class="button-row" style="margin-top:20px">
              <button class="button button--primary" type="submit">生成结构化分析 →</button>
              <button class="button button--quiet" type="button" data-view="dashboard">暂不记录</button>
            </div>
          </div>
        </form>

        <aside class="panel panel--dark helper-card">
          <div>
            <p class="eyebrow" style="color:rgba(255,255,255,.5)">记录提示</p>
            <h3>像摄像机一样写事实</h3>
          </div>
          <ol>
            <li>写能被录音或录像看到的内容。</li>
            <li>把“我觉得”放进解释，而不是事实。</li>
            <li>记录频率和变化，不放大一次行为。</li>
            <li>如果对方已经拒绝，停止寻找反向证据。</li>
          </ol>
          <p class="helper-quote">“对方看了三次手机”是事实；“对方觉得我无聊”仍然只是一个可能解释。</p>
        </aside>
      </div>
    </div>
  `;
}

function signalCheckbox(name, title, description, risk = false) {
  return `
    <label class="check-card">
      <input type="checkbox" name="${name}" ${risk ? "data-risk" : ""} />
      <span><b>${title}</b>${description}</span>
    </label>
  `;
}

function renderPeople() {
  return `
    <div class="page">
      ${pageHeading(
        "关系档案",
        "用代号，而不是真名。",
        "只记录理解互动所需的信息。不要记录身份证、住址、定位或与关系判断无关的隐私。"
      )}

      <div class="form-layout">
        <form class="panel" id="contact-form">
          <h2 class="panel-title">新建匿名档案</h2>
          <div class="form-grid">
            <div class="field">
              <label for="contact-alias">匿名代号</label>
              <input id="contact-alias" name="alias" placeholder="例如：A-17 / 山茶" maxlength="20" required />
              <small>请不要使用真实姓名、手机号或账号。</small>
            </div>
            <div class="field">
              <label for="contact-stage">当前阶段</label>
              <select id="contact-stage" name="stage" required>
                <option>刚认识</option>
                <option>持续了解</option>
                <option>约会中</option>
                <option>稳定交往</option>
                <option>关系降温</option>
                <option>关系结束</option>
              </select>
            </div>
            <div class="field field--full">
              <label for="contact-context">认识背景</label>
              <textarea
                id="contact-context"
                name="context"
                placeholder="例如：读书会认识，目前见过两次。"
                maxlength="1000"
              ></textarea>
            </div>
            <div class="field">
              <label for="contact-goal">已公开表达的关系目标</label>
              <input id="contact-goal" name="goal" placeholder="未知也可以直接写未知" maxlength="500" />
            </div>
            <div class="field">
              <label for="contact-boundary">已明确的边界</label>
              <input id="contact-boundary" name="boundary" placeholder="例如：不喜欢临时见面" maxlength="500" />
            </div>
          </div>
          <div class="button-row" style="margin-top:20px">
            <button class="button button--primary" type="submit">保存匿名档案</button>
          </div>
        </form>

        <aside class="panel panel--flat">
          <p class="eyebrow">隐私最小化</p>
          <h2 class="panel-title" style="margin-top:10px">少记一点，更安全。</h2>
          <ul class="principle-list">
            <li><span>01</span><div>使用代号，避免保存可识别信息。</div></li>
            <li><span>02</span><div>只记录对理解事件有必要的内容。</div></li>
            <li><span>03</span><div>对方要求停止或删除时，尊重其边界。</div></li>
          </ul>
        </aside>
      </div>

      <section class="section">
        <div class="section-title">
          <h2>已保存档案</h2>
          <span class="tag"><i></i>${state.contacts.length} 个匿名对象</span>
        </div>
        ${
          state.contacts.length
            ? `<div class="person-grid">${state.contacts.map(renderPersonCard).join("")}</div>`
            : `
              <div class="empty-state" style="min-height:180px">
                <div>
                  <div class="empty-symbol" aria-hidden="true">◎</div>
                  <h3>还没有档案</h3>
                  <p>完成上方表单后，匿名档案会显示在这里。</p>
                </div>
              </div>
            `
        }
      </section>
    </div>
  `;
}

function renderPersonCard(item) {
  const count = state.events.filter((event) => event.contactId === item.id).length;
  return `
    <article class="person-card">
      <div class="person-avatar">${escapeHTML(item.alias.slice(0, 2).toUpperCase())}</div>
      <h3>${escapeHTML(item.alias)}</h3>
      <span class="person-stage">${escapeHTML(item.stage)}</span>
      <p>${escapeHTML(item.context || "尚未添加认识背景。")}</p>
      <div class="person-footer">
        <span>${count} 条事件</span>
        <span class="inline-actions">
          <button
            class="text-button"
            data-view="new-event"
            data-contact-id="${escapeAttribute(item.id)}"
          >记录互动 →</button>
          <button
            class="text-button text-button--danger"
            data-action="delete-contact"
            data-contact-id="${escapeAttribute(item.id)}"
            aria-label="删除 ${escapeAttribute(item.alias)} 及其相关事件"
          >删除</button>
        </span>
      </div>
    </article>
  `;
}

function renderProfile() {
  const profile = state.profile;
  return `
    <div class="page">
      ${pageHeading(
        "我的表达",
        "建议应该像你，而不是像某个导师。",
        "这些信息用于调整回应选项的语气。系统不会强迫你使用陌生的话术。"
      )}

      <div class="form-layout">
        <form class="panel" id="profile-form">
          <h2 class="panel-title">个人目标与表达偏好</h2>
          <div class="form-grid">
            <div class="field">
              <label for="profile-name">希望如何称呼你</label>
              <input id="profile-name" name="name" value="${escapeAttribute(profile.name)}" placeholder="昵称即可" maxlength="20" />
            </div>
            <div class="field">
              <label for="profile-voice">表达风格</label>
              <select id="profile-voice" name="voice">
                ${voiceOption("natural", "自然平实", profile.voice)}
                ${voiceOption("gentle", "温和细腻", profile.voice)}
                ${voiceOption("direct", "直接清楚", profile.voice)}
                ${voiceOption("humor", "轻松幽默", profile.voice)}
              </select>
            </div>
            <div class="field field--full">
              <label for="profile-goal">当前关系目标</label>
              <textarea id="profile-goal" name="goal" maxlength="800" placeholder="例如：希望在不过度控制结果的前提下，更自然地认识合适的人。">${escapeHTML(profile.goal)}</textarea>
            </div>
            <div class="field">
              <label for="profile-anxiety">常见焦虑触发点</label>
              <textarea id="profile-anxiety" name="anxiety" maxlength="800" placeholder="例如：对方回复慢时容易反复猜测。">${escapeHTML(profile.anxiety)}</textarea>
            </div>
            <div class="field">
              <label for="profile-boundaries">希望坚持的边界</label>
              <textarea id="profile-boundaries" name="boundaries" maxlength="800" placeholder="例如：不连续追问；不在情绪很强时发送长消息。">${escapeHTML(profile.boundaries)}</textarea>
            </div>
          </div>
          <div class="button-row" style="margin-top:22px">
            <button class="button button--primary" type="submit">保存我的表达</button>
          </div>
        </form>

        <aside class="panel panel--dark helper-card">
          <div>
            <p class="eyebrow" style="color:rgba(255,255,255,.5)">主体性原则</p>
            <h3>你不需要成为别人。</h3>
          </div>
          <p>系统会提供多个选项、风险说明和判断依据。最终是否回应、如何表达、是否退出，都由你决定。</p>
          <p class="helper-quote">自然不是“说得完美”，而是表达与你的价值观、语气和关系阶段一致。</p>
        </aside>
      </div>
    </div>
  `;
}

function voiceOption(value, label, selected) {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`;
}

function renderAnalysis(eventId) {
  const item = state.events.find((event) => event.id === eventId);
  if (!item) {
    return `
      <div class="page">
        ${pageHeading("信号分析", "没有找到这条事件", "它可能已经被清除。")}
        <button class="button button--primary" data-view="dashboard">返回今日概览</button>
      </div>
    `;
  }

  const contact = getContact(item.contactId);
  const analysis = item.analysis;
  const signal = signalMeta[analysis.strength] || signalMeta.weak;

  return `
    <div class="page">
      <section class="analysis-hero">
        <div class="analysis-lens" style="--lens-color:${signal.color}">
          <span>${signal.short}</span>
        </div>
        <div class="analysis-copy">
          <p class="eyebrow">${escapeHTML(contact?.alias || "匿名档案")} · ${escapeHTML(item.scene)}</p>
          <h1>${signal.label}</h1>
          <p>${escapeHTML(analysis.summary)}</p>
          <div class="confidence-row">
            <span>证据分 ${escapeHTML(analysis.score)}</span>
            <span>信息完整度 ${escapeHTML(analysis.informationQuality)}</span>
            <span>规则 v${escapeHTML(analysis.engineVersion || ENGINE_VERSION)}</span>
            <span>${formatDate(item.date)}</span>
          </div>
        </div>
      </section>

      ${
        analysis.actionPolicy === "stop"
          ? `
            <div class="boundary-banner">
              <span aria-hidden="true">!</span>
              <div>
                <strong>边界优先</strong>
                <p>记录中包含明确拒绝、不舒服或停止要求。不要继续测试、说服或寻找“其实对方愿意”的证据。</p>
              </div>
            </div>
          `
          : analysis.actionPolicy === "deescalate"
            ? `
              <div class="boundary-banner boundary-banner--caution">
                <span aria-hidden="true">↓</span>
                <div>
                  <strong>降低互动强度</strong>
                  <p>持续回避、边界不确定或冲突信息出现时，不重复邀请、不追问；等待对方清楚、主动的反馈。</p>
                </div>
              </div>
            `
          : ""
      }

      <div class="analysis-grid">
        <article class="analysis-panel">
          <h2><span>01</span>观察事实</h2>
          <p>${escapeHTML(item.fact)}</p>
        </article>

        <article class="analysis-panel">
          <h2><span>02</span>你的解释</h2>
          <p>${escapeHTML(item.interpretation)}</p>
        </article>

        <article class="analysis-panel">
          <h2><span>03</span>证据等级依据</h2>
          <ul>${analysis.evidenceReasons.map((text) => `<li>${escapeHTML(text)}</li>`).join("")}</ul>
        </article>

        <article class="analysis-panel">
          <h2><span>04</span>其他可能解释</h2>
          <ul>${analysis.alternatives.map((text) => `<li>${escapeHTML(text)}</li>`).join("")}</ul>
        </article>

        <article class="analysis-panel">
          <h2><span>05</span>当前不确定性</h2>
          <ul>${analysis.uncertainties.map((text) => `<li>${escapeHTML(text)}</li>`).join("")}</ul>
        </article>

        <article class="analysis-panel analysis-panel--wide">
          <h2><span>06</span>${analysis.responseMode === "action" ? "尊重停止联系要求" : analysis.actionPolicy === "stop" ? "尊重边界的回应" : analysis.actionPolicy === "deescalate" ? "降级或暂停的回应选项" : "自然、低压力的回应选项"}</h2>
          ${
            analysis.personalNotes?.length
              ? `<ul class="personal-notes">${analysis.personalNotes
                  .map((text) => `<li>${escapeHTML(text)}</li>`)
                  .join("")}</ul>`
              : ""
          }
          <div class="response-list">
            ${analysis.responses
              .map(
                (text, index) => `
                  <div class="response-option ${analysis.responseMode === "action" ? "response-option--action" : ""}">
                    <span>0${index + 1}</span>
                    <p>${escapeHTML(text)}</p>
                    ${
                      analysis.responseMode === "action"
                        ? ""
                        : `<button
                            class="copy-button"
                            data-action="copy-response"
                            data-text="${escapeAttribute(text)}"
                            aria-label="复制第 ${index + 1} 条回应"
                          >复制</button>`
                    }
                  </div>
                `
              )
              .join("")}
          </div>
        </article>

        <article class="analysis-panel">
          <h2><span>07</span>停止或降级条件</h2>
          <p>${escapeHTML(analysis.stopCondition)}</p>
        </article>

        <article class="analysis-panel">
          <h2><span>08</span>后续复盘点</h2>
          <p>记录你选择了什么行动、对方真实回应了什么，以及结果是否支持原来的判断。不要只记录符合期待的部分。</p>
        </article>
      </div>

      <div class="button-row" style="margin-top:20px">
        <button class="button button--primary" data-action="open-review" data-event-id="${escapeAttribute(item.id)}">
          记录后续结果
        </button>
        <button class="button button--quiet" data-view="dashboard">返回概览</button>
        <button class="button button--danger" data-action="delete-event" data-event-id="${escapeAttribute(item.id)}">
          删除这条事件
        </button>
      </div>
      <p class="microcopy" style="text-align:left">这是透明规则引擎生成的 MVP 分析，不是概率、事实判决或读心结果。后续真实反馈会覆盖原来的行动策略。</p>
    </div>
  `;
}

function renderReview() {
  const events = [...state.events].sort((a, b) => new Date(b.date) - new Date(a.date));
  const selected = events.find((item) => item.id === reviewEventId);

  return `
    <div class="page">
      ${pageHeading(
        "行动复盘",
        "让真实反馈修正判断。",
        "复盘不是判断自己做得好不好，而是检查事实、预测与结果之间发生了什么。"
      )}

      ${
        events.length
          ? `<div class="review-grid">${events.map(renderReviewCard).join("")}</div>`
          : `
            <div class="empty-state">
              <div>
                <div class="empty-symbol" aria-hidden="true">↺</div>
                <h3>还没有可复盘的事件</h3>
                <p>记录一件互动并查看分析后，就可以在这里补充真实结果。</p>
                <button class="button button--primary" data-view="new-event">记录事件</button>
              </div>
            </div>
          `
      }

      ${selected ? renderReviewForm(selected) : ""}
    </div>
  `;
}

function renderReviewCard(item) {
  const contact = getContact(item.contactId);
  const done = Boolean(item.review?.result);
  const signal = signalMeta[item.analysis.strength] || signalMeta.weak;
  return `
    <article class="review-card">
      <header>
        <h3>${escapeHTML(contact?.alias || "已删除档案")} · ${escapeHTML(item.scene)}</h3>
        <span class="signal-pill signal-pill--${signal.className}" style="min-width:38px;height:38px;border-radius:12px">
          ${signal.short}
        </span>
      </header>
      <p>${escapeHTML(item.fact)}</p>
      <div class="review-status ${done ? "is-done" : ""}">
        <i></i>
        ${done ? `已复盘：${escapeHTML(item.review.result)}` : "等待真实反馈"}
      </div>
      <button class="button button--small ${done ? "button--quiet" : "button--primary"}" data-action="open-review" data-event-id="${escapeAttribute(item.id)}">
        ${done ? "更新复盘" : "补充结果"}
      </button>
    </article>
  `;
}

function renderReviewForm(item) {
  const review = item.review || {};
  const defaultNextStep =
    item.analysis.actionPolicy === "stop"
      ? "尊重边界并停止"
      : item.analysis.actionPolicy === "deescalate"
        ? "降低互动强度"
        : "继续自然了解";
  const selectedNextStep = review.nextStep || defaultNextStep;
  return `
    <section class="section panel">
      <p class="eyebrow">结果反馈</p>
      <h2 class="panel-title" id="review-form-title" tabindex="-1" style="margin-top:9px">复盘：${escapeHTML(getContact(item.contactId)?.alias || "匿名档案")} · ${escapeHTML(item.scene)}</h2>
      <form id="review-form" class="review-form">
        <input type="hidden" name="eventId" value="${escapeAttribute(item.id)}" />
        <div class="form-grid">
          <div class="field field--full">
            <label for="review-action">你最终选择了什么行动？</label>
            <textarea id="review-action" name="actionTaken" maxlength="1000" placeholder="例如：我选择了一个低压力邀请，并明确说不方便也没关系。">${escapeHTML(review.actionTaken || "")}</textarea>
          </div>
          <div class="field">
            <label for="review-result">对方的真实回应</label>
            <textarea id="review-result" name="result" maxlength="1600" placeholder="尽量记录原话或可观察行为。" required>${escapeHTML(review.result || "")}</textarea>
          </div>
          <div class="field">
            <label for="review-learning">这次判断需要如何调整？</label>
            <textarea id="review-learning" name="learning" maxlength="1000" placeholder="哪些判断得到支持？哪些只是期待？">${escapeHTML(review.learning || "")}</textarea>
          </div>
          <div class="field">
            <label for="review-outcome">真实结果中的边界信号</label>
            <select id="review-outcome" name="outcome" required>
              <option value="">请选择真实反馈</option>
              ${outcomeOption("unknown", "仍不确定，信息不足", review.outcome)}
              ${outcomeOption("continued", "双方愿意继续互动", review.outcome)}
              ${outcomeOption("avoidance", "持续无回应、回避或无替代安排", review.outcome)}
              ${outcomeOption("declined", "明确拒绝或要求停止", review.outcome)}
              ${outcomeOption("discomfort", "表达不舒服或边界被触碰", review.outcome)}
            </select>
            <p class="form-error" id="review-outcome-error" role="alert" aria-live="polite"></p>
          </div>
          <div class="field">
            <label for="review-naturalness">行动是否符合你自己？</label>
            <select id="review-naturalness" name="naturalness">
              ${reviewOption("很自然", review.naturalness)}
              ${reviewOption("基本自然", review.naturalness)}
              ${reviewOption("有些勉强", review.naturalness)}
              ${reviewOption("明显不像自己", review.naturalness)}
            </select>
          </div>
          <div class="field">
            <label for="review-next">下一步</label>
            <select id="review-next" name="nextStep">
              ${reviewOption("继续自然了解", selectedNextStep)}
              ${reviewOption("直接沟通确认", selectedNextStep)}
              ${reviewOption("降低互动强度", selectedNextStep)}
              ${reviewOption("尊重边界并停止", selectedNextStep)}
              ${reviewOption("不需要下一步", selectedNextStep)}
            </select>
          </div>
        </div>
        <div class="button-row">
          <button class="button button--primary" type="submit">保存复盘</button>
          <button class="button button--quiet" type="button" data-action="cancel-review">取消</button>
        </div>
      </form>
    </section>
  `;
}

function reviewOption(value, selected) {
  return `<option ${value === selected ? "selected" : ""}>${value}</option>`;
}

function outcomeOption(value, label, selected) {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`;
}

function renderPrivacy() {
  const serializedSize = new Blob([JSON.stringify(toPortableState(state))]).size;
  return `
    <div class="page">
      ${renderStorageRecoveryNotice()}
      ${pageHeading(
        "隐私与数据",
        "关系记录留在本地，Agent 只接收你明确发送的内容。",
        "匿名档案、事件、规则分析与复盘保存在当前浏览器；可选账号只用于会员授权和 Agent，不会自动同步本地日记。"
      )}

      <div class="data-grid">
        <article class="data-card">
          <p class="eyebrow">本地数据</p>
          <h2>导出或恢复本地备份</h2>
          <p>JSON 包含个人设置、匿名档案、事件与复盘，且是明文文件。请只存放在你控制的安全位置。</p>
          <div class="button-row">
            <button class="button button--dark" data-action="export-data">导出 JSON</button>
            <button class="button button--quiet" data-action="import-data">导入 JSON</button>
          </div>
          <input class="visually-hidden" id="data-import" type="file" accept="application/json,.json" />
        </article>

        <article class="data-card">
          <p class="eyebrow">危险操作</p>
          <h2>清空当前浏览器数据</h2>
          <p>会删除所有匿名档案、事件、分析和复盘。操作完成后无法在本站恢复。</p>
          <button class="button button--danger" data-action="clear-data">清空全部数据</button>
        </article>
      </div>

      <section class="section panel panel--flat">
        <div class="section-title">
          <h2>当前存储概览</h2>
          <span class="tag"><i></i>约 ${formatBytes(serializedSize)}</span>
        </div>
        <div class="metric-grid" style="margin-top:0">
          <article class="metric-card">
            <span>匿名关系档案</span>
            <strong>${state.contacts.length}</strong>
            <small>没有要求保存真实姓名</small>
          </article>
          <article class="metric-card">
            <span>事件记录</span>
            <strong>${state.events.length}</strong>
            <small>包含事实、解释与分析</small>
          </article>
          <article class="metric-card">
            <span>本地关系记录自动上传</span>
            <strong>关闭</strong>
            <small>只有你在 Agent 页明确发送的文字会进入模型请求</small>
          </article>
        </div>
      </section>

      <section class="section panel panel--flat">
        <h2 class="panel-title">本地存储风险</h2>
        <p class="data-warning">
          数据以明文保存在当前浏览器。共享设备、同一浏览器账户、浏览器清理、无痕模式和导出的 JSON
          都可能造成丢失或泄露；请不要保存真实姓名、地址、定位、身份证明或不必要的完整聊天记录。
        </p>
      </section>

      <section class="section panel panel--flat">
        <h2 class="panel-title">账号、Agent 与最小审计</h2>
        <p class="data-warning">
          登录、会员授权、Agent 调用结果和管理操作会以最少必要元数据记录在服务端，用于安全、权限和故障排查；
          不记录本地事件正文、Agent 提示词、模型回复、IP 地址或浏览器标识。你显式发送给 Agent 的文字会转交
          DeepSeek 生成实时回应，但本服务不保存这段正文。请仍使用代号并避免发送可识别信息。
        </p>
      </section>

      <section class="section panel panel--flat">
        <h2 class="panel-title">安全边界</h2>
        <ul class="principle-list">
          <li><span>01</span><div>不根据单次行为宣称知道对方真实想法。</div></li>
          <li><span>02</span><div>不鼓励突破拒绝、跟踪、施压、欺骗或制造依赖。</div></li>
          <li><span>03</span><div>不按“可攻略程度”、价值或服从性给人评分。</div></li>
          <li><span>04</span><div>高风险、暴力、胁迫或严重心理问题应转向现实中的专业支持。</div></li>
        </ul>
      </section>
    </div>
  `;
}

function pageHeading(eyebrow, title, description) {
  return `
    <header class="page-heading">
      <div>
        <p class="eyebrow">${eyebrow}</p>
        <h1>${title}</h1>
        <p>${description}</p>
      </div>
    </header>
  `;
}

function renderStorageRecoveryNotice() {
  if (!storageRecovery) return "";
  const reason = {
    future: "这份本地数据来自更新版本，当前应用不会将它降级或覆盖。",
    capacity: "旧版本地数据超过当前自动迁移容量，当前应用不会截断或覆盖它。",
    lossy: "自动迁移可能丢弃部分既有记录，当前应用已停止迁移且不会覆盖它。",
    unreadable: "浏览器中的既有数据无法安全读取，当前应用不会用空白数据覆盖它。",
  }[storageRecovery.reason] || "浏览器中的既有数据无法安全迁移，当前应用不会覆盖它。";
  return `
    <section class="boundary-banner storage-recovery" role="alert">
      <span aria-hidden="true">!</span>
      <div>
        <strong>本地数据处于恢复保护状态</strong>
        <p>${reason}请先导出原始副本，再到“隐私与数据”导入已知可用备份，或明确清空损坏数据。</p>
        <div class="button-row">
          ${
            storageRecovery.raw
              ? '<button class="button button--quiet" data-action="export-recovery-data">导出未读取的原始数据</button>'
              : ""
          }
          <button class="button button--quiet" data-view="privacy">前往隐私与数据</button>
        </div>
      </div>
    </section>
  `;
}

function createContact(form, formData) {
  if (state.contacts.length >= MAX_CONTACTS) {
    showToast(`最多保存 ${MAX_CONTACTS} 个匿名档案；请先导出并整理现有数据`, 4600);
    return;
  }
  const alias = clean(formData.get("alias"));
  const isDuplicate = state.contacts.some(
    (contact) => contact.alias.localeCompare(alias, "zh-CN", { sensitivity: "accent" }) === 0
  );
  if (isDuplicate) {
    const field = form.querySelector("#contact-alias");
    field.setCustomValidity("匿名代号已存在，请使用一个可区分的新代号。");
    field.reportValidity();
    field.addEventListener("input", () => field.setCustomValidity(""), { once: true });
    return;
  }

  const contact = {
    id: uid(),
    alias,
    stage: clean(formData.get("stage")),
    context: clean(formData.get("context")),
    goal: clean(formData.get("goal")),
    boundary: clean(formData.get("boundary")),
    createdAt: new Date().toISOString(),
  };

  if (!commitState((next) => next.contacts.push(contact))) return;
  preferredContactId = contact.id;
  showToast(`已保存匿名档案：${contact.alias}`);
  navigate("people");
}

function createEvent(form, formData) {
  if (state.events.length >= MAX_EVENTS) {
    showToast(`最多保存 ${MAX_EVENTS} 条事件；请先导出并整理现有数据`, 4600);
    return;
  }
  const signalNames = [
    "directInterest",
    "futurePlan",
    "repeatedInitiative",
    "detailedFollowup",
    "politeOnly",
    "delayAvoidance",
    "explicitDecline",
    "discomfort",
  ];
  const signals = signalNames.filter((name) => form.elements[name]?.checked);

  const item = {
    id: uid(),
    contactId: clean(formData.get("contactId")),
    date: clean(formData.get("date")),
    stage: clean(formData.get("stage")),
    scene: clean(formData.get("scene")),
    fact: clean(formData.get("fact")),
    interpretation: clean(formData.get("interpretation")),
    feeling: clean(formData.get("feeling")),
    reply: clean(formData.get("reply")),
    signals,
    boundaryStatus: clean(formData.get("boundaryStatus")),
    createdAt: new Date().toISOString(),
  };

  const validation = validateEventInput(item);
  const error = form.querySelector("#event-signal-error");
  if (!validation.valid) {
    error.textContent = validation.issues.join(" ");
    form.querySelector("#event-boundary-status")?.focus();
    return;
  }
  error.textContent = "";

  if (!commitState((next) => next.events.push(item))) return;
  currentEventId = item.id;
  preferredContactId = null;
  showToast("事件已保存，结构化分析已生成");
  navigate("analysis");
}

function saveProfile(formData) {
  const profile = {
    name: clean(formData.get("name")),
    goal: clean(formData.get("goal")),
    voice: clean(formData.get("voice")) || "natural",
    boundaries: clean(formData.get("boundaries")),
    anxiety: clean(formData.get("anxiety")),
  };
  if (!commitState((next) => {
    next.profile = profile;
  })) return;
  syncProfileAvatar();
  showToast("个人表达偏好已保存，历史回应已按当前规则刷新");
  navigate("dashboard");
}

function saveReview(form, formData) {
  const eventId = clean(formData.get("eventId"));
  const outcome = clean(formData.get("outcome"));
  let nextStep = clean(formData.get("nextStep"));
  if (outcome === "declined" || outcome === "discomfort") nextStep = "尊重边界并停止";
  if (outcome === "avoidance") nextStep = "降低互动强度";

  const review = {
    actionTaken: clean(formData.get("actionTaken")),
    result: clean(formData.get("result")),
    learning: clean(formData.get("learning")),
    naturalness: clean(formData.get("naturalness")),
    nextStep,
    outcome,
    updatedAt: new Date().toISOString(),
  };

  const validation = validateReviewInput(review);
  const error = form.querySelector("#review-outcome-error");
  if (!validation.valid) {
    error.textContent = validation.issues.join(" ");
    form.querySelector("#review-outcome")?.focus();
    return;
  }
  error.textContent = "";

  if (!commitState((next) => {
    const item = next.events.find((event) => event.id === eventId);
    if (item) item.review = review;
  })) return;

  reviewEventId = null;
  const corrected = outcome === "declined" || outcome === "discomfort" || outcome === "avoidance";
  showToast(corrected ? "复盘已保存，真实结果已修正当前行动策略" : "复盘已保存，真实结果已加入记录");
  renderCurrentView();
  requestAnimationFrame(() => {
    document
      .querySelector(`[data-action="open-review"][data-event-id="${cssEscape(eventId)}"]`)
      ?.focus();
  });
}

function loadSampleData() {
  const existing = state.contacts.find((contact) => contact.alias === "A-17");
  if (existing) {
    const event = state.events.find((item) => item.contactId === existing.id);
    if (event) {
      currentEventId = event.id;
      showToast("匿名示例已经存在");
      navigate("analysis");
      return;
    }
  }

  if (state.contacts.length >= MAX_CONTACTS || state.events.length >= MAX_EVENTS) {
    showToast("当前数据已达到容量上限，无法载入匿名示例", 4200);
    return;
  }

  const contactId = uid();
  const eventId = uid();
  const sampleContact = {
    id: contactId,
    alias: "A-17",
    stage: "持续了解",
    context: "读书会认识，线下见过两次，平时偶尔聊天。",
    goal: "尚未明确",
    boundary: "工作日比较忙，不喜欢临时邀约。",
    createdAt: new Date().toISOString(),
  };
  const sampleEvent = {
    id: eventId,
    contactId,
    date: todayISO(),
    stage: "持续了解",
    scene: "读书会结束后的微信聊天",
    fact: "对方主动问我到家没有，并提到下周同一场活动可能还会参加。回复间隔大约二十分钟。",
    interpretation: "我觉得对方可能对我有兴趣，但也担心这只是礼貌。",
    feeling: "期待，也有一点不确定",
    reply: "还没有回复",
    signals: ["repeatedInitiative", "futurePlan"],
    boundaryStatus: "clear",
    createdAt: new Date().toISOString(),
  };
  if (!commitState((next) => {
    next.contacts.push(sampleContact);
    next.events.push(sampleEvent);
  })) return;
  showToast("匿名示例已载入");
  renderCurrentView();
  requestAnimationFrame(() => main.focus({ preventScroll: true }));
}

function exportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    application: "GAME Signal Lab",
    data: toPortableState(state),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `game-signal-lab-${todayISO()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast("本地数据已导出");
}

function exportRecoveryData() {
  if (!storageRecovery?.raw) {
    showToast("没有可导出的原始数据");
    return;
  }
  const blob = new Blob([storageRecovery.raw], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `game-signal-lab-unreadable-${todayISO()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast("未读取的原始数据已导出；请保留副本后再清理");
}

async function importData(file) {
  if (file.size > MAX_BACKUP_BYTES) {
    showToast("备份文件超过 20 MB，已取消导入", 4200);
    return;
  }

  try {
    const imported = reanalyzeState(parseBackup(await file.text()));
    const confirmed = window.confirm(
      `导入将替换当前浏览器中的 ${state.contacts.length} 个档案和 ${state.events.length} 条事件。是否继续？`
    );
    if (!confirmed) return;

    imported.adultConfirmed = state.adultConfirmed;
    imported.adultConfirmedAt = state.adultConfirmedAt;
    imported.agePolicyVersion = state.agePolicyVersion;
    if (!writeState(imported, { replaceRecovery: true })) return;
    state = imported;
    currentView = "dashboard";
    currentEventId = null;
    reviewEventId = null;
    preferredContactId = null;
    syncProfileAvatar();
    renderCurrentView();
    showToast("备份已导入并按当前规则重新分析");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "无法读取这个备份文件", 4600);
  }
}

function clearData() {
  const confirmed = window.confirm(
    "确定清空所有本地数据吗？这会删除年龄确认、个人设置、匿名档案、事件和复盘，且无法恢复。"
  );
  if (!confirmed) return;

  try {
    localStorage.removeItem(STORAGE_KEY);
    LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    storageRecovery = null;
  } catch {
    showToast("浏览器阻止了本地数据清理，请在站点设置中手动删除", 4800);
    return;
  }

  state = createDefaultState();
  syncProfileAvatar();
  currentView = "dashboard";
  currentEventId = null;
  reviewEventId = null;
  preferredContactId = null;
  renderCurrentView();
  adultCheck.checked = false;
  enterApp.disabled = true;
  setAppAvailability(false);
  if (!ageGate.open) ageGate.showModal();
  showToast("本地数据已全部清空");
}

function deleteEvent(eventId) {
  const item = state.events.find((event) => event.id === eventId);
  if (!item) return;
  if (!window.confirm("确定删除这条事件及其复盘吗？此操作无法撤销。")) return;
  if (!commitState((next) => {
    next.events = next.events.filter((event) => event.id !== eventId);
  })) return;
  currentEventId = null;
  reviewEventId = null;
  showToast("事件及其复盘已删除");
  navigate("dashboard");
}

function deleteContact(contactId) {
  const contact = state.contacts.find((item) => item.id === contactId);
  if (!contact) return;
  const eventCount = state.events.filter((event) => event.contactId === contactId).length;
  const confirmed = window.confirm(
    eventCount
      ? `确定删除匿名档案“${contact.alias}”及其 ${eventCount} 条事件和复盘吗？此操作无法撤销。`
      : `确定删除匿名档案“${contact.alias}”吗？此操作无法撤销。`
  );
  if (!confirmed) return;
  if (!commitState((next) => {
    next.contacts = next.contacts.filter((item) => item.id !== contactId);
    next.events = next.events.filter((event) => event.contactId !== contactId);
  })) return;
  showToast("匿名档案及其关联数据已删除");
  navigate("people");
}

function loadState() {
  let saved = null;
  let sourceKey = STORAGE_KEY;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
    let migratedLegacy = false;
    if (!saved) {
      for (const key of LEGACY_STORAGE_KEYS) {
        saved = localStorage.getItem(key);
        if (saved) {
          migratedLegacy = true;
          sourceKey = key;
          break;
        }
      }
    }
    if (!saved) return reanalyzeState(cloneValue(defaultState));

    const parsed = JSON.parse(saved);
    const assessment = inspectStoredState(parsed);
    if (!assessment.safe) {
      const error = new Error(assessment.message);
      error.code = assessment.reason.toUpperCase();
      throw error;
    }
    const normalized = reanalyzeState(assessment.state);
    if (migratedLegacy) startupWarning = "已安全迁移旧版本地数据；下次保存将使用 v2 结构";
    return normalized;
  } catch (error) {
    const reason = String(error?.code || "").toLowerCase();
    storageRecovery = {
      sourceKey,
      raw: typeof saved === "string" ? saved : "",
      reason: ["future", "capacity", "lossy"].includes(reason) ? reason : "unreadable",
    };
    startupWarning =
      {
        future: "本地数据来自更新版本，已进入恢复保护状态且不会覆盖原始数据",
        capacity: "旧版本地数据超过自动迁移容量，已进入恢复保护状态且不会被截断",
        lossy: "自动迁移可能丢失部分记录，已进入恢复保护状态且不会覆盖原始数据",
        unreadable: "本地数据无法读取，已进入恢复保护状态且不会覆盖原始数据",
      }[storageRecovery.reason];
    return reanalyzeState(cloneValue(defaultState));
  }
}

function commitState(mutator) {
  const next = cloneValue(state);
  mutator(next);
  const portable = toPortableState(next);
  if (!writeState(portable)) return false;
  state = reanalyzeState(portable);
  return true;
}

function persistCurrentState() {
  reanalyzeState(state);
  return writeState(state);
}

function writeState(nextState, { replaceRecovery = false } = {}) {
  if (storageRecovery && !replaceRecovery) {
    showToast("现有本地数据正受恢复保护；请先导出原始副本，再导入备份或明确清空", 5600);
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPortableState(nextState)));
    LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    storageRecovery = null;
    return true;
  } catch {
    showToast("保存失败：浏览器存储不可用或空间不足。本次修改未写入本地。", 5200);
    return false;
  }
}

function reanalyzeState(targetState) {
  const contacts = new Map(targetState.contacts.map((contact) => [contact.id, contact]));
  targetState.events = targetState.events.map((item) => {
    const contact = contacts.get(item.contactId);
    return {
      ...item,
      analysis: analyzeEvent(item, {
        voice: targetState.profile.voice,
        goal: targetState.profile.goal,
        anxiety: targetState.profile.anxiety,
        boundaries: targetState.profile.boundaries,
        contactBoundary: contact?.boundary || "",
      }),
    };
  });
  return targetState;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("回应选项已复制");
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    showToast(copied ? "回应选项已复制" : "浏览器未允许复制，请手动选择文字");
  }
}

function cloneValue(value) {
  if (globalThis.structuredClone) return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function getContact(id) {
  return state.contacts.find((item) => item.id === id);
}

function syncProfileAvatar() {
  const initial = state.profile.name ? state.profile.name.trim().slice(0, 1) : "我";
  document.querySelector("#avatar-initial").textContent = initial;
}

function showToast(message, duration = 2300) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), duration);
}

function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "日期未知";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function clean(value) {
  return String(value || "").trim();
}

function uid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHTML(value).replaceAll("\n", "&#10;");
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return globalThis.CSS.escape(String(value));
  return String(value).replace(/[^A-Za-z0-9_-]/g, "\\$&");
}
