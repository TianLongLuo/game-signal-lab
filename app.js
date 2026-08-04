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
import { detectLocale, localizePage, t, toggleLocale } from "./src/i18n.js";
import {
  appendVoiceTranscript,
  encodeMonoWav,
  extractCompletedSpeechChunks,
  extractNewTranscript,
  normalizeAssistantText,
  reconcileCumulativeAsrText,
} from "./src/voice-utils.js";

const STORAGE_KEY = "game-signal-lab:v2";
const LEGACY_STORAGE_KEYS = ["game-signal-lab:v1"];
const defaultState = createDefaultState();

const viewTitles = {
  dashboard: "我的空间",
  "new-event": "开始记录",
  people: "对象档案",
  review: "行动复盘",
  profile: "我的表达",
  privacy: "隐私与数据",
  analysis: "信号分析",
  agent: "一起想想",
};

const signalMeta = {
  weak: {
    label: "弱信号",
    short: "弱",
    className: "weak",
    color: "#8b7fa3",
  },
  medium: {
    label: "中等信号",
    short: "中",
    className: "medium",
    color: "#22d3ee",
  },
  strong: {
    label: "强信号",
    short: "强",
    className: "strong",
    color: "#c084fc",
  },
  stop: {
    label: "停止推进",
    short: "停",
    className: "stop",
    color: "#ff3b5c",
  },
};

let startupWarning = "";
let storageRecovery = null;
let state = loadState();
let currentView = "dashboard";
let currentEventId = null;
let reviewEventId = null;
let preferredContactId = null;
let editingContactId = null;
let toastTimer = null;
const platformClient = new PlatformClient();
const platform = {
  available: null,
  user: null,
  membership: null,
  externalAiConsent: null,
  capabilities: null,
  knowledge: null,
  knowledgeSignature: "",
  knowledgeBusy: false,
  agentMessages: [],
  agentBusy: false,
  agentController: null,
};

const storyIntake = {
  active: false,
  busy: false,
  messages: [],
  controller: null,
  recording: false,
  startedAt: 0,
  remaining: 60,
  timer: null,
  draft: "",
  draftInput: "",
  archiveContactId: "",
  audioRecorder: null,
  voiceStatus: "",
  finalizingVoice: false,
  motionSuppressed: false,
  recordingDurationMs: 0,
  waveformLevels: [],
};

const contactEditor = {
  recording: false,
  voiceTimeout: null,
  voiceDraft: "",
  voiceAutoOrganize: false,
  busy: false,
  audioRecorder: null,
  recordingStream: null,
  nextQuestion: "",
  voiceStatus: "",
  finalizingVoice: false,
  liveAsrTimer: null,
  liveAsrController: null,
  lastAsrChunkIndex: 0,
  recordingBaseText: "",
  recordingAsrText: "",
};

const ttsState = {
  queue: [],
  playing: false,
  controller: null,
  currentAudio: null,
  currentUrl: "",
  streamBuffer: "",
  generation: 0,
  audioContext: null,
  currentSource: null,
  sources: new Set(),
  nextAudioTime: 0,
  errorNotified: false,
};

const STORY_SCROLL_BOTTOM_THRESHOLD = 72;

// The dashboard is a local scene selector rather than a long scrolling page.
// Keeping the catalogue here means navigation, wheel choreography, and
// accessible labels all use the same source of truth.
const homeSceneCatalog = [
  {
    view: "new-event",
    index: "01",
    kicker: "LIVE INTAKE",
    title: "开始记录",
    subtitle: "把一段关系放回现场。",
    description: "文字或语音都可以。只说你愿意保留的部分，Agent 会一次问一个真正有帮助的问题。",
    cue: "进入记录",
    tone: "signal",
  },
  {
    view: "people",
    index: "02",
    kicker: "CASE FILES",
    title: "对象档案",
    subtitle: "让线索有一个可以回来的地方。",
    description: "背景、目标、边界和互动记录会在故事结束后归档成匿名卡片，随时可以修正。",
    cue: "查看档案",
    tone: "cyan",
  },
  {
    view: "agent",
    index: "03",
    kicker: "THINKING ROOM",
    title: "一起想想",
    subtitle: "把不确定写成可以讨论的问题。",
    description: "只检索你的个人知识库，帮你区分事实、感受与猜测，再决定下一步。",
    cue: "进入 Agent",
    tone: "neon",
  },
];

let homeSceneIndex = 0;
const homeSceneInput = {
  wheelDelta: 0,
  touchStartY: null,
  transitioning: false,
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

  const langToggle = document.getElementById("lang-toggle");
  if (langToggle) langToggle.addEventListener("click", () => {
    toggleLocale();
    renderCurrentView();
  });

  // The dashboard deliberately consumes vertical wheel input. The user is
  // moving through local scenes, not scrolling an infinitely tall document.
  window.addEventListener("wheel", handleHomeSceneWheel, { passive: false });
  window.addEventListener("touchstart", handleHomeSceneTouchStart, { passive: true });
  window.addEventListener("touchmove", handleHomeSceneTouchMove, { passive: false });
  window.addEventListener("touchend", handleHomeSceneTouchEnd, { passive: true });
  window.addEventListener("pointermove", handleHomeScenePointerMove, { passive: true });

  document.addEventListener("click", async (event) => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton && viewButton.dataset.action !== "home-scene-open") {
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

    if (actionName === "home-scene-next") {
      setHomeSceneIndex(homeSceneIndex + 1);
      return;
    }

    if (actionName === "home-scene-prev") {
      setHomeSceneIndex(homeSceneIndex - 1);
      return;
    }

    if (actionName === "home-scene-open") {
      openHomeScene(action.dataset.view);
      return;
    }

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

    if (actionName === "open-contact-editor") {
      if (event.target.closest("details")) return;
      openContactEditor(action.dataset.contactId);
      return;
    }

    if (actionName === "close-contact-editor") {
      closeContactEditor();
      return;
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

    if (actionName === "sync-knowledge") {
      await syncPersonalKnowledge();
    }

    if (actionName === "clear-knowledge") {
      await clearPersonalKnowledge();
    }

    if (actionName === "agent-starter") {
      const prompt = document.querySelector("#agent-prompt");
      if (prompt) {
        prompt.value = action.dataset.prompt || "";
        prompt.focus();
      }
    }

    if (actionName === "story-start") {
      void unlockStoryAudio();
      startStoryIntake();
    }

    if (actionName === "story-end") {
      await endStoryIntake();
    }

    if (actionName === "story-skip") {
      void unlockStoryAudio();
      submitStoryAnswer("（跳过这一题）");
    }

    if (actionName === "story-voice") {
      void unlockStoryAudio();
      toggleStoryVoice();
    }

    if (actionName === "contact-voice") {
      toggleContactVoice();
    }

    if (actionName === "contact-ai-organize") {
      await organizeContactDraft();
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

    if (event.target.matches("#story-archive-contact")) {
      storyIntake.archiveContactId = clean(event.target.value);
    }
  });

  document.addEventListener("submit", async (event) => {
    if (event.target.matches("#profile-form")) {
      event.preventDefault();
      saveProfile(new FormData(event.target));
    }

    if (event.target.matches("#contact-editor-form")) {
      event.preventDefault();
      saveContactEditor(event.target, new FormData(event.target));
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
      void unlockStoryAudio();
      await submitAgentPrompt(event.target, new FormData(event.target));
    }

    if (event.target.matches("#story-answer-form")) {
      event.preventDefault();
      void unlockStoryAudio();
      await submitStoryAnswer(clean(new FormData(event.target).get("answer")));
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
    if (
      event.key.toLowerCase() === "r" &&
      currentView === "new-event" &&
      storyIntake.active &&
      !isTypingTarget(event.target)
    ) {
      event.preventDefault();
      void unlockStoryAudio();
      toggleStoryVoice({ fromKeyboard: true });
    }

    const card = event.target.closest('[data-action="open-contact-editor"]');
    if (card && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openContactEditor(card.dataset.contactId);
    }
  });

  document.addEventListener("cancel", (event) => {
    if (event.target?.matches?.("#contact-editor-dialog")) closeContactEditor();
  });
}

function navigate(view) {
  if (!viewTitles[view]) view = "dashboard";
  currentView = view;
  if (view !== "analysis") currentEventId = null;
  if (view !== "review") reviewEventId = null;
  setMobileMenu(false);
  homeSceneInput.transitioning = false;
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
  document.body.classList.toggle("scene-home-active", currentView === "dashboard");

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
  localizePage();

  if (currentView === "dashboard") {
    requestAnimationFrame(() => setHomeSceneIndex(homeSceneIndex, { announce: false }));
  }
}

function currentHomeScene() {
  return homeSceneCatalog[homeSceneIndex] || homeSceneCatalog[0];
}

function setHomeSceneIndex(nextIndex, { announce = true } = {}) {
  homeSceneIndex = (nextIndex + homeSceneCatalog.length) % homeSceneCatalog.length;
  const scene = document.querySelector(".scene-home");
  if (!scene) return;

  scene.dataset.sceneIndex = String(homeSceneIndex);
  scene.style.setProperty("--scene-rotation", `${homeSceneIndex * -120}deg`);
  const activeScene = currentHomeScene();
  const status = scene.querySelector("[data-scene-current]");
  const liveStatus = scene.querySelector("[data-scene-live]");
  const counter = scene.querySelector("[data-scene-counter]");
  if (status) status.textContent = activeScene.title;
  if (counter) counter.textContent = `${activeScene.index} / 0${homeSceneCatalog.length}`;
  if (announce && liveStatus) liveStatus.textContent = `已切换到${activeScene.title}：${activeScene.subtitle}`;
  scene.querySelectorAll(".scene-home-dots i").forEach((dot, dotIndex) => {
    dot.classList.toggle("is-active", dotIndex === homeSceneIndex);
  });

  scene.querySelectorAll("[data-home-scene-open]").forEach((card, cardIndex) => {
    const slot = (cardIndex - homeSceneIndex + homeSceneCatalog.length) % homeSceneCatalog.length;
    card.classList.toggle("is-active", slot === 0);
    card.classList.toggle("is-next", slot === 1);
    card.classList.toggle("is-prev", slot === homeSceneCatalog.length - 1);
    card.setAttribute("aria-current", slot === 0 ? "true" : "false");
    card.tabIndex = slot === 0 ? 0 : -1;
  });

  const copy = scene.querySelector("[data-scene-copy]");
  if (copy) {
    copy.querySelector("[data-scene-copy-kicker]").textContent = `${activeScene.index} / ${activeScene.kicker}`;
    copy.querySelector("[data-scene-copy-title]").innerHTML = renderSceneLetters(activeScene.title);
    copy.querySelector("[data-scene-copy-title]").setAttribute("aria-label", activeScene.title);
    copy.querySelector("[data-scene-copy-subtitle]").textContent = activeScene.subtitle;
    copy.querySelector("[data-scene-copy-description]").textContent = activeScene.description;
    const cta = copy.querySelector("[data-scene-copy-cta]");
    if (cta) {
      cta.dataset.view = activeScene.view;
      cta.querySelector("[data-scene-copy-cta-label]").textContent = activeScene.cue;
    }
  }
}

function renderSceneLetters(text) {
  return Array.from(text)
    .map(
      (letter, index) =>
        `<span class="scene-title-letter" style="--letter-index:${index}" aria-hidden="true">${escapeHTML(letter === " " ? " " : letter)}</span>`,
    )
    .join("");
}

function handleHomeSceneWheel(event) {
  if (currentView !== "dashboard" || event.ctrlKey || ageGate.open) return;
  const scene = document.querySelector(".scene-home");
  if (!scene || homeSceneInput.transitioning) return;
  if (Math.abs(event.deltaY) < Math.abs(event.deltaX) * 0.8) return;
  event.preventDefault();
  homeSceneInput.wheelDelta += event.deltaY;
  if (Math.abs(homeSceneInput.wheelDelta) < 28) return;
  const direction = homeSceneInput.wheelDelta > 0 ? 1 : -1;
  homeSceneInput.wheelDelta = 0;
  setHomeSceneIndex(homeSceneIndex + direction);
}

function handleHomeSceneTouchStart(event) {
  if (currentView !== "dashboard" || ageGate.open) return;
  homeSceneInput.touchStartY = event.touches[0]?.clientY ?? null;
}

function handleHomeSceneTouchMove(event) {
  if (currentView !== "dashboard" || homeSceneInput.touchStartY === null || ageGate.open) return;
  event.preventDefault();
}

function handleHomeSceneTouchEnd(event) {
  if (currentView !== "dashboard" || homeSceneInput.touchStartY === null || ageGate.open) return;
  const endY = event.changedTouches[0]?.clientY ?? homeSceneInput.touchStartY;
  const distance = homeSceneInput.touchStartY - endY;
  homeSceneInput.touchStartY = null;
  if (Math.abs(distance) < 40) return;
  setHomeSceneIndex(homeSceneIndex + (distance > 0 ? 1 : -1));
}

function handleHomeScenePointerMove(event) {
  const scene = document.querySelector(".scene-home");
  if (!scene) return;
  const bounds = scene.getBoundingClientRect();
  const x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 100;
  const y = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 100;
  scene.style.setProperty("--pointer-x", `${Math.max(0, Math.min(100, x))}%`);
  scene.style.setProperty("--pointer-y", `${Math.max(0, Math.min(100, y))}%`);
}

function openHomeScene(view) {
  if (!viewTitles[view] || homeSceneInput.transitioning) return;
  const scene = document.querySelector(".scene-home");
  const overlay = document.querySelector("#scene-transition");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!scene || !overlay || reducedMotion) {
    navigate(view);
    return;
  }

  const target = homeSceneCatalog.find((item) => item.view === view) || currentHomeScene();
  homeSceneInput.transitioning = true;
  overlay.querySelector("[data-transition-index]").textContent = target.index;
  overlay.querySelector("[data-transition-title]").textContent = target.title;
  overlay.classList.add("is-active");
  scene.classList.add("is-exiting");
  document.body.classList.add("scene-transitioning");
  window.setTimeout(() => {
    overlay.classList.remove("is-active");
    scene.classList.remove("is-exiting");
    document.body.classList.remove("scene-transitioning");
    navigate(view);
  }, 560);
}

function captureStoryThreadScroll() {
  const thread = document.querySelector(".story-thread");
  if (!thread) return null;
  return {
    top: thread.scrollTop,
    distanceFromBottom: Math.max(0, thread.scrollHeight - thread.scrollTop - thread.clientHeight),
  };
}

function restoreStoryThreadScroll(snapshot, { followLatest = false } = {}) {
  const thread = document.querySelector(".story-thread");
  if (!thread) return;
  const maxTop = Math.max(0, thread.scrollHeight - thread.clientHeight);
  const shouldFollowLatest = followLatest ||
    (snapshot && snapshot.distanceFromBottom <= STORY_SCROLL_BOTTOM_THRESHOLD);
  thread.scrollTop = shouldFollowLatest
    ? maxTop
    : Math.min(snapshot?.top ?? thread.scrollTop, maxTop);
}

function renderStoryViewPreservingScroll(snapshot = captureStoryThreadScroll(), options = {}) {
  renderCurrentView();
  requestAnimationFrame(() => restoreStoryThreadScroll(snapshot, options));
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
    platform.knowledge = null;
    platform.knowledgeSignature = "";
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
    try {
      platform.knowledge = (await platformClient.knowledgeStatus()).knowledge || null;
    } catch {
      platform.knowledge = null;
      platform.knowledgeSignature = "";
    }
  } catch (error) {
    if (error instanceof PlatformError && error.status === 401) {
      platform.available = true;
      platform.user = null;
      platform.membership = null;
      platform.externalAiConsent = null;
      platform.capabilities = null;
      platform.knowledge = null;
      platform.knowledgeSignature = "";
    } else {
      platform.available = false;
      platform.user = null;
      platform.membership = null;
      platform.externalAiConsent = null;
      platform.capabilities = null;
      platform.knowledge = null;
      platform.knowledgeSignature = "";
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
    status.textContent = t("localMode");
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
        ${pageHeading("一起想想", "我先确认一下房间是否准备好。", "只有在你同意并发起 Agent 提问时，匿名档案才会同步到账号专属空间。")}
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
        <p class="eyebrow">A QUIET PLACE TO THINK</p>
        <h2>先坐下来，<br />听听自己真正担心什么。</h2>
        <p>把一段关系里的困惑交给我一起理一理吧。我会陪你看看发生过什么、你感受到了什么，以及还有哪些地方值得直接问一问。</p>
        <div class="agent-starters">
          <button type="button" data-action="agent-starter" data-prompt="我有点分不清发生过的事和自己的猜测，可以陪我一起理一理吗？">我有点分不清了</button>
          <button type="button" data-action="agent-starter" data-prompt="我想自然地表达想见面，也想让对方很容易拒绝，能帮我写得像我一点吗？">帮我说得自然一点</button>
          <button type="button" data-action="agent-starter" data-prompt="我好像感受到对方的不舒服了。现在应该先停下来、留一点空间，还是直接确认？">我想先确认边界</button>
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
          <small>${platform.knowledge?.documentCount ? `个人档案 ${platform.knowledge.documentCount} 条` : "首次提问时同步匿名档案"}</small>
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
          <p class="eyebrow">给未来的自己留一句话</p>
          <h2>写下此刻最想弄清楚的事。</h2>
          <form id="agent-form">
            <label class="visually-hidden" for="agent-prompt">发送给关系思考 Agent 的内容</label>
            <textarea
              id="agent-prompt"
              name="prompt"
              maxlength="4000"
              placeholder="不用组织得很漂亮。写下必要信息即可，请用代号，不要粘贴姓名、地址、账号或完整聊天记录。"
              required
              ${platform.agentBusy ? "disabled" : ""}
            ></textarea>
            <p class="form-error" id="agent-error" role="alert" aria-live="assertive"></p>
            <div class="button-row">
              <button class="button button--primary" type="submit" ${platform.agentBusy ? "disabled" : ""}>
                陪我理一理
              </button>
              ${
                platform.agentBusy
                  ? '<button class="button button--quiet" type="button" data-action="cancel-agent">停止生成</button>'
                  : ""
              }
            </div>
          </form>
          <p class="agent-privacy-note">
            发送问题时，当前浏览器里的匿名对象档案会先更新到该账号的隔离知识库，再由 DeepSeek 只检索这个账号的数据。服务端不保存提示词或回复正文，管理员也看不到档案正文。
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
        <p>登录或打开页面不会上传本地日记。你确认本说明并提交 Agent 问题时，匿名 profile/contact/event 的最少必要字段会更新到账号专属空间，让 Agent 只检索你的资料。</p>
      </header>
      <div class="consent-layout">
        <section>
          <p class="eyebrow">处理说明 · ${escapeHTML(policyVersion)}</p>
          <h2>这项同意与会员资格分开。</h2>
          <ul>
            <li>请只使用代号和最少必要上下文，不发送姓名、账号、地址、定位或完整聊天记录。</li>
            <li>GAME 服务端不保存提示词和模型回复正文；你发起 Agent 提问时，当前匿名档案会同步到自己的隔离知识库，供本次和后续提问检索。</li>
            <li>DeepSeek 作为外部模型提供方会接收你明确发送的文字；其处理受相应服务政策约束。</li>
            <li>你可以随时撤回。撤回后新的 Agent 请求会被服务端拒绝，并清空服务器个人知识库；本地日记不受影响。</li>
          </ul>
        </section>
        <form id="external-ai-consent-form">
          <input type="hidden" name="policyVersion" value="${escapeAttribute(policyVersion)}" />
          <label class="check-row consent-check">
            <input type="checkbox" name="accepted" required />
            <span>我已阅读并同意：发起 Agent 提问时，将我主动发送的文字和当前匿名档案同步到账号专属知识库，并交给 DeepSeek 处理。</span>
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
      : "登录本身不会上传档案；同意外部 AI 并发起 Agent 提问后，匿名档案才会同步到账号专属空间。";
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
        message.content ? escapeHTML(normalizeAssistantText(message.content)) : "正在组织回应…"
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
  platform.knowledge = null;
  platform.knowledgeSignature = "";
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

async function syncPersonalKnowledge() {
  if (!platform.user) {
    showToast("请先登录，再同步你的个人档案", 3600);
    navigate("agent");
    return;
  }
  if (!platform.externalAiConsent?.current) {
    showToast("同步前需要先确认外部 AI 数据处理说明", 3600);
    navigate("agent");
    return;
  }
  if (platform.knowledgeBusy) return;
  platform.knowledgeBusy = true;
  renderCurrentView();
  try {
    const documents = buildKnowledgeDocuments();
    const payload = await platformClient.syncKnowledge(documents);
    platform.knowledge = payload.knowledge || null;
    platform.knowledgeSignature = knowledgeDocumentsSignature(documents);
    showToast(
      `已把 ${payload.knowledge?.documentCount ?? 0} 条档案同步到你的个人知识库`
    );
  } catch (error) {
    showToast(
      error instanceof PlatformError ? error.message : "个人档案同步未完成，请稍后重试。",
      4600
    );
  } finally {
    platform.knowledgeBusy = false;
    renderCurrentView();
  }
}

async function clearPersonalKnowledge() {
  if (!platform.user || platform.knowledgeBusy) return;
  const confirmed = window.confirm(
    "这会删除服务器上的个人知识库，不会删除本机关系记录。是否继续？"
  );
  if (!confirmed) return;
  platform.knowledgeBusy = true;
  renderCurrentView();
  try {
    const payload = await platformClient.clearKnowledge();
    platform.knowledge = payload.knowledge || null;
    platform.knowledgeSignature = knowledgeDocumentsSignature([]);
    showToast("服务器个人知识库已清空");
  } catch (error) {
    showToast(
      error instanceof PlatformError ? error.message : "清空未完成，请稍后重试。",
      4600
    );
  } finally {
    platform.knowledgeBusy = false;
    renderCurrentView();
  }
}

function buildKnowledgeDocuments() {
  const documents = [];
  const profileContent = [
    state.profile.goal ? `我想要：${state.profile.goal}` : "",
    state.profile.boundaries ? `我的边界：${state.profile.boundaries}` : "",
    state.profile.anxiety ? `我容易在这些时候不安：${state.profile.anxiety}` : "",
    state.profile.voice ? `我更自然的表达方式：${state.profile.voice}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (profileContent) {
    documents.push({
      externalId: "profile",
      kind: "profile",
      title: "我的表达与边界",
      content: profileContent.slice(0, 6000),
    });
  }

  for (const contact of state.contacts) {
    const content = [
      `关系代号：${contact.alias}`,
      `当前阶段：${contact.stage || "未填写"}`,
      `认识背景：${contact.context || "未填写"}`,
      `对方已表达的目标：${contact.goal || "未知"}`,
      `已知边界：${contact.boundary || "未记录"}`,
    ].join("\n");
    documents.push({
      externalId: `contact:${contact.id}`,
      kind: "contact",
      title: `${contact.alias} · 对象档案`,
      content: content.slice(0, 6000),
    });
  }

  const contactAliases = new Map(state.contacts.map((contact) => [contact.id, contact.alias]));
  for (const event of state.events) {
    const alias = contactAliases.get(event.contactId) || "匿名对象";
    const content = [
      `对象：${alias}`,
      `日期：${event.date || "未填写"}`,
      `场景：${event.scene || "未填写"}`,
      `事实：${event.fact || "未填写"}`,
      `我的解释：${event.interpretation || "未填写"}`,
      `当时的感受：${event.feeling || "未填写"}`,
      `我的回应：${event.reply || "未填写"}`,
      `边界状态：${event.boundaryStatus || "未填写"}`,
    ].join("\n");
    documents.push({
      externalId: `event:${event.id}`,
      kind: "event",
      title: `${alias} · ${event.scene || event.date || "一次互动"}`,
      content: content.slice(0, 6000),
    });
  }
  return documents.slice(0, 500);
}

function knowledgeDocumentsSignature(documents) {
  let hash = 2166136261;
  const source = JSON.stringify(documents);
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${documents.length}:${(hash >>> 0).toString(16)}`;
}

async function ensurePersonalKnowledgeForAgent() {
  const documents = buildKnowledgeDocuments();
  const signature = knowledgeDocumentsSignature(documents);
  if (
    platform.knowledgeSignature === signature
    && Number(platform.knowledge?.documentCount || 0) === documents.length
  ) return;
  if (!documents.length && Number(platform.knowledge?.documentCount || 0) === 0) {
    platform.knowledgeSignature = signature;
    return;
  }
  const payload = await platformClient.syncKnowledge(documents);
  platform.knowledge = payload.knowledge || null;
  platform.knowledgeSignature = signature;
}

async function submitAgentPrompt(form, formData) {
  cancelStorySpeech();
  if (!platform.user || platform.agentBusy) return;
  const prompt = clean(formData.get("prompt"));
  const errorNode = form.querySelector("#agent-error");
  if (!prompt) {
    errorNode.textContent = "请先写下一个想讨论的问题。";
    return;
  }

  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    await ensurePersonalKnowledgeForAgent();
  } catch (error) {
    errorNode.textContent = error instanceof PlatformError
      ? `对象档案未能进入专属知识库：${error.message}`
      : "对象档案同步失败，请稍后重试。";
    if (submit) submit.disabled = false;
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
  beginStreamingStorySpeech();
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
      onText(chunk, fullText) {
        const target = platform.agentMessages.at(-1);
        if (target?.role === "assistant") target.content = fullText.slice(0, 20000);
        queueStreamingStorySpeech(chunk);
        const node = document.querySelector("#agent-response-last");
        if (node) node.textContent = normalizeAssistantText(target?.content || "");
      },
    });
    const target = platform.agentMessages.at(-1);
    if (target?.role === "assistant" && !target.content) {
      target.content = complete || "这次没有收到可显示的文本，请稍后再试。";
    }
    flushStreamingStorySpeech();
  } catch (error) {
    cancelStorySpeech();
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
  const activeScene = currentHomeScene();
  return `
    <div class="page scene-home-page">
      ${renderStorageRecoveryNotice()}
      <section class="scene-home" data-scene-index="${homeSceneIndex}" style="--scene-rotation:${homeSceneIndex * -120}deg" aria-labelledby="scene-home-title">
        <div class="scene-home-noise" aria-hidden="true"></div>
        <div class="scene-home-glow scene-home-glow--one" aria-hidden="true"></div>
        <div class="scene-home-glow scene-home-glow--two" aria-hidden="true"></div>

        <header class="scene-home-header">
          <div>
            <p class="eyebrow">GAME / LOCAL SIGNAL LAB</p>
            <p class="scene-home-intro">一间只属于你的关系工作室</p>
          </div>
          <div class="scene-home-index">
            <span data-scene-counter>${activeScene.index} / 0${homeSceneCatalog.length}</span>
            <strong data-scene-current>${escapeHTML(activeScene.title)}</strong>
          </div>
        </header>

        <div class="scene-home-stage">
          <div class="scene-ring-wrap" aria-label="主页场景卡片轮播">
            <div class="scene-ring-orbit scene-ring-orbit--outer" aria-hidden="true"></div>
            <div class="scene-ring-orbit scene-ring-orbit--inner" aria-hidden="true"></div>
            <div class="scene-ring">
              ${homeSceneCatalog
                .map(
                  (item, index) => `
                    <button
                      class="scene-card ${index === homeSceneIndex ? "is-active" : index === (homeSceneIndex + 1) % homeSceneCatalog.length ? "is-next" : "is-prev"}"
                      type="button"
                      data-action="home-scene-open"
                      data-view="${item.view}"
                      data-home-scene-open
                      aria-current="${index === homeSceneIndex ? "true" : "false"}"
                      aria-label="打开${escapeAttribute(item.title)}"
                      tabindex="${index === homeSceneIndex ? "0" : "-1"}"
                      style="--scene-tone:var(--${item.tone})"
                    >
                      <span class="scene-card-index">${item.index}</span>
                      <span class="scene-card-kicker">${escapeHTML(item.kicker)}</span>
                      <span class="scene-card-title">${renderSceneLetters(item.title)}</span>
                      <span class="scene-card-subtitle">${escapeHTML(item.subtitle)}</span>
                      <span class="scene-card-edge" aria-hidden="true">↗</span>
                    </button>
                  `,
                )
                .join("")}
            </div>
          </div>

          <div class="scene-home-copy" data-scene-copy>
            <p class="scene-home-kicker" data-scene-copy-kicker>${activeScene.index} / ${activeScene.kicker}</p>
            <h1 id="scene-home-title" data-scene-copy-title aria-label="${escapeAttribute(activeScene.title)}">${renderSceneLetters(activeScene.title)}</h1>
            <p class="scene-home-subtitle" data-scene-copy-subtitle>${escapeHTML(activeScene.subtitle)}</p>
            <p class="scene-home-description" data-scene-copy-description>${escapeHTML(activeScene.description)}</p>
            <button class="scene-home-cta" type="button" data-action="home-scene-open" data-view="${activeScene.view}" data-scene-copy-cta>
              <span data-scene-copy-cta-label>${escapeHTML(activeScene.cue)}</span>
              <b aria-hidden="true">↗</b>
            </button>
          </div>
        </div>

        <footer class="scene-home-footer">
          <div class="scene-home-controls" aria-label="场景切换">
            <button type="button" class="scene-arrow" data-action="home-scene-prev" aria-label="上一个场景">←</button>
            <span class="scene-home-dots" aria-hidden="true">
              ${homeSceneCatalog.map((_, index) => `<i class="${index === homeSceneIndex ? "is-active" : ""}"></i>`).join("")}
            </span>
            <button type="button" class="scene-arrow" data-action="home-scene-next" aria-label="下一个场景">→</button>
          </div>
          <p class="scene-home-wheel-hint"><span>SCROLL</span> 滚轮切换场景 · 点击卡片进入</p>
          <p class="scene-home-safety">本地优先 · 尊重边界 · 只保留你愿意留下的部分</p>
        </footer>
        <p class="visually-hidden" data-scene-live aria-live="polite">当前场景：${escapeHTML(activeScene.title)}</p>
      </section>
    </div>
  `;
}

function renderDashboardEmpty() {
  return `
    <div class="empty-state">
      <div>
        <div class="empty-symbol" aria-hidden="true">＋</div>
        <h3>从一句话开始就好</h3>
        <p>你不需要先把事情想完整。打开“开始记录”，我会先听你说，再问一个温和的问题。</p>
        <div class="button-row" style="justify-content:center">
          <button class="button button--primary" data-view="new-event">开始记录</button>
          <button class="button button--quiet" data-action="load-sample">看看匿名示例</button>
        </div>
      </div>
    </div>
  `;
}

function renderStoryIntake() {
  const hasStory = storyIntake.messages.length > 0;
  const canUseAgent = Boolean(platform.user && platform.externalAiConsent?.current && platform.capabilities?.agent);
  const speechSupported = Boolean(canRecordAudio());
  const archiveTarget = storyIntake.archiveContactId || preferredContactId || "";
  return `
    <section class="story-intake panel panel--dark ${storyIntake.active ? "is-active" : ""}" aria-labelledby="story-intake-title">
      <div class="story-intake-topline">
        <p class="eyebrow">STORY INTAKE · ${storyIntake.active ? "LIVE" : "01"}</p>
        <div class="story-target-control">
          <label for="story-archive-contact">归档对象</label>
          <select id="story-archive-contact" name="archiveContactId">
            <option value="" ${archiveTarget ? "" : "selected"}>结束后新建匿名对象</option>
            ${state.contacts.map((contact) => `<option value="${escapeAttribute(contact.id)}" ${contact.id === archiveTarget ? "selected" : ""}>${escapeHTML(contact.alias)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="story-intake-copy">
        <h2 id="story-intake-title">我在听，你慢慢说。</h2>
        <p>不用准备好答案，也不用从头讲起。我会听着你的线索，一次只问一个最有帮助的问题；不想回答，就跳过去。</p>
      </div>
      ${hasStory ? `
        <div class="story-thread" aria-live="polite">
          ${storyIntake.messages.slice(-8).map((message) => `
            <div class="story-bubble story-bubble--${message.role}">
              <span>${message.role === "assistant" ? "我" : "你"}</span>
              <p>${escapeHTML(normalizeAssistantText(message.content))}</p>
            </div>
          `).join("")}
        </div>
      ` : `
        <div class="story-prompt-note"><span>你可以从这里开始</span><strong>告诉我你的故事。你们在哪里认识？那天发生了什么？</strong></div>
      `}
      ${storyIntake.active ? `
        <form class="story-answer-form" id="story-answer-form">
          <label class="visually-hidden" for="story-answer">告诉我你的故事</label>
          <textarea id="story-answer" name="answer" maxlength="2400" placeholder="想到哪儿说到哪儿…" ${storyIntake.busy || storyIntake.recording || storyIntake.finalizingVoice ? "disabled" : ""}>${escapeHTML(storyIntake.draftInput)}</textarea>
          ${storyIntake.recording ? renderStoryRecordingPanel() : ""}
          <div class="story-controls">
            <button class="story-voice-button ${storyIntake.recording ? "is-recording" : ""} ${storyIntake.finalizingVoice ? "is-processing" : ""} ${storyIntake.motionSuppressed ? "motion-suppressed" : ""}" type="button" data-action="story-voice" aria-label="${storyIntake.recording ? "结束录音" : storyIntake.finalizingVoice ? "正在转写录音" : "开始录音"}" ${storyIntake.finalizingVoice ? "disabled" : ""}>
              <span class="voice-recording-visual ${storyIntake.recording ? "is-live" : storyIntake.finalizingVoice ? "is-processing" : ""}" aria-hidden="true">${storyIntake.recording ? "<i></i><i></i><i></i><i></i><i></i>" : storyIntake.finalizingVoice ? "<b></b><b></b><b></b>" : "◉"}</span>
              ${storyIntake.recording ? "结束录音" : storyIntake.finalizingVoice ? "MiMo 转写中…" : speechSupported ? "开始录音" : "浏览器不支持录音"}
            </button>
            <span class="story-shortcut">录音不会实时改写草稿 · 手动结束后统一转写 · 电脑端按 R</span>
            ${storyIntake.voiceStatus ? `<span class="story-voice-status" role="status" aria-live="polite">${escapeHTML(storyIntake.voiceStatus)}</span>` : ""}
            <button class="button button--light button--small" type="submit" ${storyIntake.busy || storyIntake.recording || storyIntake.finalizingVoice ? "disabled" : ""}>发送</button>
            <button class="text-button text-button--light" type="button" data-action="story-skip" ${storyIntake.busy || storyIntake.recording || storyIntake.finalizingVoice ? "disabled" : ""}>先跳过</button>
            <button class="text-button text-button--light" type="button" data-action="story-end" ${storyIntake.recording || storyIntake.finalizingVoice ? "disabled" : ""}>归档并结束</button>
          </div>
        </form>
      ` : `
        <div class="story-actions">
          <button class="button button--light" type="button" data-action="story-start">${hasStory ? "继续说" : "告诉我你的故事"} <span aria-hidden="true">→</span></button>
          <button class="story-voice-button" type="button" data-action="story-voice" aria-label="${speechSupported ? "用语音开始记录" : "当前浏览器不支持语音输入"}" ${speechSupported ? "" : "disabled"}>
            <span aria-hidden="true">◉</span>${speechSupported ? "语音输入" : "浏览器不支持语音"}
          </button>
          ${!canUseAgent ? '<small class="story-access-note">需要登录并同意外部 AI 处理说明后开始。</small>' : ""}
        </div>
      `}
      <small class="story-privacy">录音期间只保存在当前设备；手动结束后才把 MP3 发送给 MiMo ASR。转写结果只回填草稿，你点击“发送”后才进入对话。</small>
    </section>
  `;
}

function renderStoryRecordingPanel() {
  const levels = Array.from({ length: 44 }, (_, index) => {
    const offset = storyIntake.waveformLevels.length - 44 + index;
    if (offset >= 0) return storyIntake.waveformLevels[offset];
    return storyIntake.waveformLevels.length ? 4 : 12 + ((index * 17) % 34);
  });
  const progress = Math.min(1, storyIntake.recordingDurationMs / 300_000);
  return `
    <section class="story-recording-panel" aria-label="正在录音">
      <div class="story-recording-meta">
        <span class="story-recording-live"><i aria-hidden="true"></i>REC · MP3</span>
        <time id="story-recording-time" datetime="PT${Math.floor(storyIntake.recordingDurationMs / 1000)}S">${formatRecordingDuration(storyIntake.recordingDurationMs)}</time>
      </div>
      <div class="story-recording-waveform" id="story-recording-waveform" aria-hidden="true">
        ${levels.map((level) => `<i style="transform:scaleY(${Math.max(0.08, Math.min(1, level / 100)).toFixed(2)})"></i>`).join("")}
      </div>
      <div class="story-recording-timeline" aria-hidden="true">
        <span id="story-recording-progress" style="transform:scaleX(${progress.toFixed(4)})"></span>
      </div>
      <div class="story-recording-foot"><span>00:00</span><strong>点击“结束录音”后再统一转写</strong><span>05:00</span></div>
    </section>
  `;
}

function formatRecordingDuration(milliseconds = 0) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function startStoryIntake({ beginVoice = false } = {}) {
  cancelStorySpeech();
  if (!platform.user) {
    showToast("请先在 Agent 页面登录，再开始故事记录", 3600);
    navigate("agent");
    return;
  }
  if (!platform.externalAiConsent?.current) {
    showToast("开始前需要先确认外部 AI 数据处理说明", 3600);
    navigate("agent");
    return;
  }
  if (!platform.capabilities?.agent) {
    showToast("当前账户还没有 Agent 使用权限", 3600);
    navigate("agent");
    return;
  }
  storyIntake.active = true;
  storyIntake.remaining = null;
  storyIntake.startedAt = Date.now();
  storyIntake.draftInput = "";
  storyIntake.voiceStatus = "";
  if (!storyIntake.messages.length) {
    storyIntake.messages.push({
      role: "assistant",
      content: "告诉我你的故事。你可以从你们在哪里认识、那天发生了什么开始，也可以从此刻最让你在意的地方说起。",
    });
    speakCompleteStoryText(storyIntake.messages.at(-1).content);
  }
  renderCurrentView();
  requestAnimationFrame(() => {
    if (beginVoice) toggleStoryVoice();
    else document.querySelector("#story-answer")?.focus();
  });
}

async function endStoryIntake() {
  if (storyIntake.recording || storyIntake.finalizingVoice) {
    showToast("请先结束录音并确认转写文字，再归档故事", 3600);
    return;
  }
  cancelStorySpeech();
  window.clearInterval(storyIntake.timer);
  storyIntake.active = false;
  const pendingInput = clean(storyIntake.draftInput).slice(0, 2400);
  stopStoryVoice();
  storyIntake.voiceStatus = "";
  storyIntake.controller?.abort();
  if (pendingInput) {
    storyIntake.messages.push({ role: "user", content: pendingInput });
  }
  storyIntake.draftInput = "";
  const storyText = storyIntake.messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n")
    .trim();
  storyIntake.busy = false;
  storyIntake.draft = storyIntake.messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n");
  storyIntake.draftInput = "";
  if (!storyText) {
    renderCurrentView();
    showToast("记录已结束；还没有可归档的故事");
    return;
  }
  const archived = await archiveStoryAsContact(storyText);
  renderCurrentView();
  if (archived) {
    showToast("故事已整理并归档到对象档案");
    navigate("people");
  } else {
    showToast("故事已留在当前浏览器，可以继续整理");
  }
}

async function archiveStoryAsContact(storyText) {
  if (state.contacts.length >= MAX_CONTACTS && !getContact(storyIntake.archiveContactId || preferredContactId)) {
    showToast(`最多保存 ${MAX_CONTACTS} 个匿名档案；请先整理现有档案`, 4600);
    return false;
  }
  const targetId = storyIntake.archiveContactId || preferredContactId || "";
  const target = getContact(targetId);
  const summary = await summarizeStoryForArchive(storyText);
  const block = [
    `故事记录（${todayISO()}）`,
    `认识背景：${summary.context || "未提及"}`,
    `已表达目标或需求：${summary.goal || "未提及"}`,
    `边界或待确认点：${summary.boundary || "未提及"}`,
    `\n原始片段\n${storyText.slice(0, 280)}`,
  ].join("\n").slice(0, 1200);
  let archivedId = target?.id || "";
  if (!commitState((next) => {
    if (target) {
      const contact = next.contacts.find((item) => item.id === target.id);
      if (contact) {
        contact.context = `${contact.context ? `${contact.context}\n\n` : ""}${block}`.slice(-1200);
        if (summary.goal && summary.goal !== "未提及") contact.goal = summary.goal.slice(0, 600);
        if (summary.boundary && summary.boundary !== "未提及") contact.boundary = summary.boundary.slice(0, 600);
      }
      return;
    }
    archivedId = uid();
    next.contacts.push({
      id: archivedId,
      alias: nextArchiveAlias(next.contacts),
      stage: "刚认识",
      context: block,
      goal: summary.goal || "",
      boundary: summary.boundary || "",
      createdAt: new Date().toISOString(),
    });
  })) return false;
  preferredContactId = archivedId || target.id;
  storyIntake.archiveContactId = preferredContactId;
  return true;
}

function nextArchiveAlias(contacts) {
  const used = new Set(contacts.map((contact) => contact.alias.toLocaleLowerCase("zh-CN")));
  const base = `对象-${todayISO().replaceAll("-", "")}`;
  let alias = base;
  let index = 2;
  while (used.has(alias.toLocaleLowerCase("zh-CN"))) {
    alias = `${base}-${index}`;
    index += 1;
  }
  return alias.slice(0, 40);
}

async function summarizeStoryForArchive(storyText) {
  const fallback = storyIntake.messages
    .filter((message) => message.role === "assistant" && message.content)
    .at(-1)?.content || storyText;
  const fallbackSummary = { context: fallback, goal: "", boundary: "" };
  const canUseAgent = Boolean(platform.user && platform.externalAiConsent?.current && platform.capabilities?.agent);
  if (!canUseAgent) return fallbackSummary;
  try {
    showToast("正在整理故事并归档…", 2200);
    const transcript = storyIntake.messages
      .slice(-12)
      .map((message) => `${message.role === "user" ? "用户" : "回应"}：${message.content}`)
      .join("\n")
      .slice(-10000);
    const complete = await platformClient.streamAgent([
      {
        role: "user",
        content: `请把下面这段匿名关系故事整理成对象档案字段。只根据原文，不推断对方的想法，也不要给建议。只输出 JSON，不要 Markdown：{"context":"认识背景和可观察事实","goal":"已表达目标或需求；没有就写未提及","boundary":"明确边界、拒绝或待确认点；没有就写未提及"}。\n\n${transcript}`,
      },
    ]);
    return parseContactDraft(complete) || { context: clean(complete || fallback).slice(0, 1050) || fallback, goal: "", boundary: "" };
  } catch {
    return fallbackSummary;
  }
}

async function submitStoryAnswer(answer) {
  if (!storyIntake.active || storyIntake.busy) return;
  cancelStorySpeech();
  const normalized = clean(answer).slice(0, 2400);
  storyIntake.draftInput = "";
  if (!normalized) {
    showToast("可以写一句，也可以选择跳过", 2600);
    return;
  }
  storyIntake.messages.push({ role: "user", content: normalized });
  if (storyIntake.messages.filter((message) => message.role === "user").length === 1) {
    window.clearInterval(storyIntake.timer);
    storyIntake.timer = null;
    storyIntake.remaining = null;
  }
  storyIntake.busy = true;
  storyIntake.controller = new AbortController();
  const conversation = storyIntake.messages.slice(-12).map((message, index, list) => {
    if (message.role === "user" && index === list.length - 1) {
      return {
        role: "user",
        content: `这是故事访谈中的一次回答：${message.content}
你的目标是逐步建立一个可核对的对象档案。优先检查这些信息是否出现：认识背景（时间/地点/场景）、可观察事实与原话、用户当时的状态和感受、对方可观察的回应、已表达目标或需求、明确边界/拒绝/不确定性、用户想要厘清的问题。
保持温和，不替任何人下结论，不把沉默、回避或隐性信号当成同意。每次只追问一个最缺失、最具体的问题，最多两句话；如果用户说“不想回答”就接受并换一个问题。如果仍有关键空白，不要急着总结；只有信息已经覆盖或用户明确想结束时，才用几句事实摘要收束，并邀请用户选择继续或归档。只输出自然的纯文本中文，不要使用 Markdown、星号、标题符号、列表符号或引号包裹。`,
      };
    }
    return message;
  });
  storyIntake.messages.push({ role: "assistant", content: "" });
  const threadScroll = captureStoryThreadScroll();
  const followLatest = !threadScroll || threadScroll.distanceFromBottom <= STORY_SCROLL_BOTTOM_THRESHOLD;
  beginStreamingStorySpeech();
  renderStoryViewPreservingScroll(threadScroll, { followLatest });
  try {
    const complete = await platformClient.streamAgent(conversation, {
      signal: storyIntake.controller.signal,
      onText(chunk, fullText) {
        const target = storyIntake.messages.at(-1);
        if (target?.role === "assistant") {
          target.content = normalizeAssistantText(fullText).slice(0, 5000);
        }
        queueStreamingStorySpeech(chunk);
        const node = document.querySelector(".story-thread .story-bubble--assistant:last-child p");
        if (node) node.textContent = target?.content || "";
        if (followLatest) restoreStoryThreadScroll(null, { followLatest: true });
      },
    });
    const target = storyIntake.messages.at(-1);
    if (target?.role === "assistant" && !target.content) {
      target.content = normalizeAssistantText(complete) || "你还想补充哪一个具体片段？";
    }
    flushStreamingStorySpeech();
  } catch (error) {
    cancelStorySpeech();
    storyIntake.messages.push({
      role: "assistant",
      content: error instanceof PlatformError ? error.message : "这次没有接上回应，你可以继续写下去。",
    });
  } finally {
    storyIntake.busy = false;
    storyIntake.controller = null;
    storyIntake.voiceStatus = "";
    renderStoryViewPreservingScroll(threadScroll, { followLatest });
    requestAnimationFrame(() => document.querySelector("#story-answer")?.focus());
  }
}

async function startStoryAudioRecording() {
  if (!canRecordAudio()) return false;
  if (!(await checkMicrophonePermission())) return true;
  const input = document.querySelector("#story-answer");
  storyIntake.draftInput = clean(input?.value || storyIntake.draftInput).slice(0, 2400);
  let recorder;
  try {
    recorder = await createMp3Recorder({ onProcess: updateStoryRecordingVisual });
  } catch (error) {
    const message = error?.userDenied
      ? "无法取得麦克风权限，请在浏览器地址栏允许录音后重试"
      : "当前浏览器无法建立 MP3 录音，请改用文字输入";
    showToast(message, 4200);
    return true;
  }
  storyIntake.audioRecorder = recorder;
  storyIntake.finalizingVoice = false;
  storyIntake.recording = true;
  storyIntake.recordingDurationMs = 0;
  storyIntake.waveformLevels = [];
  storyIntake.voiceStatus = "录音中 · 草稿不会被实时改写";
  renderStoryViewPreservingScroll();
  return true;
}

async function toggleStoryVoice({ fromKeyboard = false } = {}) {
  if (!storyIntake.active) {
    startStoryIntake({ beginVoice: true });
    return;
  }
  if (storyIntake.recording) {
    stopStoryVoice();
    return;
  }
  storyIntake.motionSuppressed = fromKeyboard;
  if (await startStoryAudioRecording()) return;
  storyIntake.motionSuppressed = false;
  showToast("当前浏览器无法录音，请改用文字输入", 3600);
}

function stopStoryVoice() {
  if (storyIntake.audioRecorder) {
    const recorder = storyIntake.audioRecorder;
    const preview = clean(storyIntake.draftInput).slice(0, 2400);
    storyIntake.audioRecorder = null;
    storyIntake.recording = false;
    storyIntake.finalizingVoice = true;
    storyIntake.voiceStatus = "正在上传 MP3，并用 MiMo ASR 统一转写…";
    renderStoryViewPreservingScroll();
    void recorder.stop()
      .then(({ blob, durationMs }) => finalizeStoryRecording(blob, { preview, durationMs }))
      .catch((error) => handleStoryRecordingFailure(error, preview));
    return;
  }
  storyIntake.recording = false;
  storyIntake.voiceStatus = "";
}

async function finalizeStoryRecording(blob, { preview, durationMs = 0 }) {
  let transcript = preview;
  try {
    if (!blob?.size) throw new Error("audio_empty");
    const recognized = await transcribeRecordedAudio(blob, { timeoutMs: 90_000 });
    transcript = appendVoiceTranscript(preview, recognized).slice(0, 2400);
    if (transcript && storyIntake.active) {
      storyIntake.draftInput = transcript;
      storyIntake.recordingDurationMs = durationMs;
      storyIntake.voiceStatus = "MiMo 转写完成 · 请确认文字后点击发送";
      renderStoryViewPreservingScroll();
      requestAnimationFrame(() => {
        const input = document.querySelector("#story-answer");
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      });
    }
  } catch (error) {
    if (preview && storyIntake.active) {
      storyIntake.draftInput = preview;
      const reason = error instanceof PlatformError ? error.message : "语音识别未完成";
      showToast(`${reason} 已保留已有文字。`, 4200);
    } else if (storyIntake.active) {
      showToast(error instanceof PlatformError ? error.message : "语音识别未完成，请改用文字输入", 4200);
    }
  } finally {
    storyIntake.finalizingVoice = false;
    storyIntake.motionSuppressed = false;
    if (!storyIntake.draftInput) storyIntake.voiceStatus = "";
    renderStoryViewPreservingScroll();
  }
}

async function handleStoryRecordingFailure(error, preview) {
  storyIntake.finalizingVoice = false;
  storyIntake.motionSuppressed = false;
  storyIntake.voiceStatus = "";
  storyIntake.draftInput = preview;
  renderStoryViewPreservingScroll();
  showToast(error?.message || "录音没有成功结束，请重试", 4200);
}

function createMp3Recorder({ onProcess } = {}) {
  const Recorder = window.Recorder;
  if (typeof Recorder !== "function") {
    return Promise.reject(new Error("mp3_recorder_unavailable"));
  }
  const recorder = Recorder({
    type: "mp3",
    sampleRate: 16_000,
    bitRate: 32,
    onProcess(_buffers, powerLevel, bufferDuration) {
      onProcess?.(powerLevel, bufferDuration);
    },
  });
  return new Promise((resolve, reject) => {
    recorder.open(() => {
      recorder.start();
      let stopped = false;
      resolve({
        stop() {
          if (stopped) return Promise.reject(new Error("recording_already_stopped"));
          stopped = true;
          return new Promise((stopResolve, stopReject) => {
            recorder.stop((blob, duration) => {
              recorder.close();
              stopResolve({ blob, durationMs: Number(duration) || 0 });
            }, (message) => {
              recorder.close();
              stopReject(new Error(message || "mp3_encode_failed"));
            });
          });
        },
      });
    }, (message, userDenied) => {
      const error = new Error(message || "microphone_open_failed");
      error.userDenied = Boolean(userDenied);
      reject(error);
    });
  });
}

function updateStoryRecordingVisual(powerLevel, durationMs) {
  if (!storyIntake.recording) return;
  const level = Math.max(4, Math.min(100, Number(powerLevel) || 0));
  storyIntake.recordingDurationMs = Math.max(0, Number(durationMs) || 0);
  storyIntake.waveformLevels = [...storyIntake.waveformLevels.slice(-43), level];

  const time = document.querySelector("#story-recording-time");
  if (time) {
    time.textContent = formatRecordingDuration(storyIntake.recordingDurationMs);
    time.setAttribute("datetime", `PT${Math.floor(storyIntake.recordingDurationMs / 1000)}S`);
  }
  const bars = document.querySelectorAll("#story-recording-waveform > i");
  const levels = storyIntake.waveformLevels;
  bars.forEach((bar, index) => {
    const value = levels.at(index - bars.length) || 4;
    bar.style.transform = `scaleY(${Math.max(0.08, value / 100).toFixed(2)})`;
  });
  const progress = Math.min(1, storyIntake.recordingDurationMs / 300_000);
  const progressBar = document.querySelector("#story-recording-progress");
  if (progressBar) progressBar.style.transform = `scaleX(${progress.toFixed(4)})`;
}

async function createWavRecorder(stream) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("audio_context_unavailable");
  const context = new AudioContextClass();
  if (context.state === "suspended") await context.resume();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const silentGain = context.createGain();
  silentGain.gain.value = 0;
  const chunks = [];
  let sampleCount = 0;
  processor.onaudioprocess = (event) => {
    const chunk = new Float32Array(event.inputBuffer.getChannelData(0));
    chunks.push(chunk);
    sampleCount += chunk.length;
  };
  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(context.destination);
  let stopped = false;
  return {
    snapshot(fromIndex = 0) {
      return encodeMonoWav(chunks.slice(fromIndex), context.sampleRate);
    },
    chunkCount() {
      return chunks.length;
    },
    durationMs() {
      return Math.round((sampleCount / context.sampleRate) * 1000);
    },
    stop() {
      if (stopped) return new Blob([], { type: "audio/wav" });
      stopped = true;
      processor.onaudioprocess = null;
      try { source.disconnect(); } catch { /* already disconnected */ }
      try { processor.disconnect(); } catch { /* already disconnected */ }
      try { silentGain.disconnect(); } catch { /* already disconnected */ }
      const blob = encodeMonoWav(chunks, context.sampleRate);
      void context.close().catch(() => {});
      return blob;
    },
  };
}

async function checkMicrophonePermission() {
  try {
    const permission = await navigator.permissions?.query({ name: "microphone" });
    if (permission?.state === "denied") {
      showToast("麦克风权限已被拒绝，请在浏览器地址栏设置中允许后重试", 4200);
      return false;
    }
  } catch {
    // getUserMedia below will surface any permission problem.
  }
  return true;
}

function canRecordAudio() {
  return Boolean(
    navigator.mediaDevices?.getUserMedia
    && typeof window.Recorder === "function"
  );
}

async function transcribeRecordedAudio(blob, { timeoutMs = 25_000, signal } = {}) {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await platformClient.transcribeVoice(blob, { signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new PlatformError("MiMo ASR 响应超时，已保留已有文字。", {
        code: "asr_timeout",
        status: 504,
      });
    }
    throw error instanceof PlatformError
      ? error
      : new PlatformError("语音识别未完成，请改用文字输入。", { code: "asr_failed" });
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

async function streamTranscribeRecordedAudio(blob, { timeoutMs = 12_000, signal, onText } = {}) {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await platformClient.streamTranscribeVoice(blob, {
      signal: controller.signal,
      onText,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new PlatformError("MiMo ASR 响应超时，已保留实时识别结果。", {
        code: "asr_timeout",
        status: 504,
      });
    }
    throw error instanceof PlatformError
      ? error
      : new PlatformError("语音识别未完成，请改用文字输入。", { code: "asr_failed" });
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
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
  return `
    <div class="page">
      ${renderStorageRecoveryNotice()}
      ${renderStoryIntake()}
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
      <section class="section">
        <div class="section-title">
          <h2>对象卡片</h2>
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
                  <p>在“开始记录”里结束一段故事，AI 会自动建立匿名档案。</p>
                </div>
              </div>
            `
        }
      </section>
      ${renderContactEditor()}
    </div>
  `;
}

function renderPersonCard(item) {
  const events = state.events
    .filter((event) => event.contactId === item.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const latest = events[0] || null;
  const insights = contactInsights(events);
  const latestSignal = latest
    ? signalMeta[latest.analysis?.strength] || signalMeta.weak
    : signalMeta.weak;
  return `
    <article
      class="person-card"
      data-action="open-contact-editor"
      data-contact-id="${escapeAttribute(item.id)}"
      role="button"
      tabindex="0"
      aria-label="编辑对象档案：${escapeAttribute(item.alias)}"
    >
      <header class="person-card-head">
        <div class="person-avatar">${escapeHTML(item.alias.slice(0, 2).toUpperCase())}</div>
        <div>
          <p class="person-kicker">对象档案 · ${escapeHTML(formatDate(item.createdAt?.slice(0, 10)))}</p>
          <h3>${escapeHTML(item.alias)}</h3>
          <span class="person-stage">${escapeHTML(item.stage || "阶段未填写")}</span>
        </div>
      </header>

      <div class="person-summary">
        <span>认识背景</span>
        <p>${escapeHTML(item.context || "尚未添加认识背景。")}</p>
      </div>

      <dl class="person-details">
        <div><dt>已表达目标</dt><dd>${escapeHTML(item.goal || "未知")}</dd></div>
        <div><dt>已知边界</dt><dd>${escapeHTML(item.boundary || "暂未记录")}</dd></div>
      </dl>

      <div class="person-depth-grid" aria-label="档案完整度">
        <div><span>具体程度</span><strong>${escapeHTML(insights.specificity)}</strong></div>
        <div><span>话题深度</span><strong>${escapeHTML(insights.topicDepth)}</strong></div>
        <div><span>情绪深度</span><strong>${escapeHTML(insights.emotionalDepth)}</strong></div>
        <div><span>信号验证</span><strong>${escapeHTML(insights.verification)}</strong></div>
      </div>

      <div class="person-recent">
        <div class="person-recent-head">
          <span>最近互动 · ${events.length} 条记录</span>
          <b class="signal-pill signal-pill--${latestSignal.className}">${latest ? latestSignal.label : "待记录"}</b>
        </div>
        ${latest ? `
          <strong>${escapeHTML(latest.scene || latest.stage || "未命名场景")} · ${escapeHTML(formatDate(latest.date))}</strong>
          <p>${escapeHTML(latest.fact)}</p>
          <small>${escapeHTML(latest.analysis?.informationQuality || "信息质量有限")} · ${escapeHTML(latest.boundaryStatus === "stop" ? "已标记边界" : "持续观察")}</small>
        ` : `<p class="person-empty-note">还没有互动记录，先从一次具体事件开始。</p>`}
      </div>

      ${events.length ? `
        <details class="person-history" open>
          <summary>全部互动记录 <span>${events.length}</span></summary>
          <div class="person-history-list">
            ${events.map((event) => `
              <article>
                <header><strong>${escapeHTML(event.scene || event.stage || "未命名场景")}</strong><time>${escapeHTML(formatDate(event.date))}</time></header>
                <p><b>事实</b>${escapeHTML(event.fact)}</p>
                <p><b>解释</b>${escapeHTML(event.interpretation || "未填写")}</p>
                <p><b>感受</b>${escapeHTML(event.feeling || "未填写")} · <b>回应</b>${escapeHTML(event.reply || "未填写")}</p>
                <small>${escapeHTML(event.analysis?.informationQuality || "信息质量有限")} · ${escapeHTML(event.boundaryStatus === "stop" ? "已标记边界" : "继续观察")}</small>
              </article>
            `).join("")}
          </div>
        </details>
      ` : ""}

      <div class="person-footer">
        <span>${escapeHTML(insights.lastSeen)}</span>
        <span class="inline-actions">
          <button
            class="text-button"
            data-action="open-contact-editor"
            data-contact-id="${escapeAttribute(item.id)}"
          >编辑档案 →</button>
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

function renderContactEditor() {
  const contact = getContact(editingContactId);
  if (!contact) return "";
  const speechSupported = Boolean(canRecordAudio());
  return `
    <dialog class="contact-editor-dialog" id="contact-editor-dialog" aria-labelledby="contact-editor-title">
      <form class="contact-editor" id="contact-editor-form">
        <header class="contact-editor-head">
          <div>
            <p class="eyebrow">OBJECT PROFILE · EDIT</p>
            <h2 id="contact-editor-title">编辑 ${escapeHTML(contact.alias)}</h2>
          </div>
          <button class="text-button" type="button" data-action="close-contact-editor" aria-label="关闭对象档案编辑">关闭</button>
        </header>
        <div class="contact-editor-grid">
          <div class="field">
            <label for="editor-contact-alias">匿名代号</label>
            <input id="editor-contact-alias" name="alias" value="${escapeAttribute(contact.alias)}" maxlength="40" required />
          </div>
          <div class="field">
            <label for="editor-contact-stage">当前阶段</label>
            <select id="editor-contact-stage" name="stage">
              ${["刚认识", "持续了解", "第一次见面", "约会中", "稳定交往", "关系降温", "关系结束"].map((stage) => `<option ${stage === contact.stage ? "selected" : ""}>${stage}</option>`).join("")}
            </select>
          </div>
          <div class="field field--full">
            <label for="editor-contact-context">认识背景</label>
            <textarea id="editor-contact-context" name="context" maxlength="1200">${escapeHTML(contact.context)}</textarea>
          </div>
          <div class="field">
            <label for="editor-contact-goal">已表达目标</label>
            <textarea id="editor-contact-goal" name="goal" maxlength="600">${escapeHTML(contact.goal)}</textarea>
          </div>
          <div class="field">
            <label for="editor-contact-boundary">已知边界</label>
            <textarea id="editor-contact-boundary" name="boundary" maxlength="600">${escapeHTML(contact.boundary)}</textarea>
          </div>
        </div>
        <section class="contact-editor-voice" aria-labelledby="contact-voice-title">
          <div>
            <p class="eyebrow" id="contact-voice-title">VOICE NOTE · OPTIONAL</p>
            <p>说出想补充的内容，先留在草稿里；点击 AI 整理后再写入上面的档案字段。</p>
          </div>
          <textarea id="contact-voice-input" name="voiceDraft" maxlength="2400" placeholder="例如：她最近主动提到下周的展览，但说临时安排不太方便。">${escapeHTML(contactEditor.voiceDraft)}</textarea>
          <div class="contact-editor-actions">
            <button class="story-voice-button ${contactEditor.recording ? "is-recording" : ""} ${contactEditor.finalizingVoice ? "is-processing" : ""}" id="contact-voice-button" type="button" data-action="contact-voice" ${speechSupported && !contactEditor.finalizingVoice ? "" : "disabled"}>
              <span class="voice-recording-visual ${contactEditor.recording ? "is-live" : contactEditor.finalizingVoice ? "is-processing" : ""}" aria-hidden="true">${contactEditor.recording ? "<i></i><i></i><i></i><i></i><i></i>" : contactEditor.finalizingVoice ? "<b></b><b></b><b></b>" : "◉"}</span>${contactEditor.recording ? "停止并校正" : contactEditor.finalizingVoice ? "MiMo 校正中…" : speechSupported ? "语音输入" : "浏览器不支持语音"}
            </button>
            <button class="button button--quiet" type="button" data-action="contact-ai-organize" ${speechSupported || contactEditor.voiceDraft ? "" : ""}>AI 整理补充</button>
            <button class="button button--primary" type="submit">保存档案</button>
          </div>
          <p class="contact-editor-status" id="contact-editor-status" role="status" aria-live="polite">${escapeHTML([contactEditor.voiceStatus, contactEditor.nextQuestion ? `建议继续确认：${contactEditor.nextQuestion}` : ""].filter(Boolean).join(" · ") )}</p>
        </section>
      </form>
    </dialog>
  `;
}

function openContactEditor(contactId) {
  if (!getContact(contactId)) return;
  stopContactVoice({ discard: true });
  editingContactId = contactId;
  contactEditor.voiceDraft = "";
  contactEditor.busy = false;
  contactEditor.organized = false;
  contactEditor.nextQuestion = "";
  contactEditor.voiceStatus = "";
  renderCurrentView();
  requestAnimationFrame(() => {
    const dialog = document.querySelector("#contact-editor-dialog");
    if (dialog && !dialog.open) dialog.showModal();
    dialog?.querySelector("#editor-contact-alias")?.focus({ preventScroll: true });
  });
}

function closeContactEditor() {
  stopContactVoice({ discard: true });
  const dialog = document.querySelector("#contact-editor-dialog");
  if (dialog?.open) dialog.close();
  editingContactId = null;
  contactEditor.voiceDraft = "";
  contactEditor.busy = false;
  contactEditor.organized = false;
  contactEditor.nextQuestion = "";
  contactEditor.voiceStatus = "";
  contactEditor.recordingBaseText = "";
  contactEditor.recordingAsrText = "";
  if (currentView === "people") renderCurrentView();
}

async function toggleContactVoice() {
  if (contactEditor.recording) {
    stopContactVoice({ autoOrganize: true });
    return;
  }
  if (await startContactAudioRecording()) return;
  showToast("当前浏览器无法录音，请改用文字输入", 3600);
}

async function startContactAudioRecording() {
  if (!canRecordAudio()) return false;
  if (!(await checkMicrophonePermission())) return true;
  const input = document.querySelector("#contact-voice-input");
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    showToast("无法取得麦克风权限，请允许录音后重试", 3600);
    return true;
  }
  let recorder;
  try {
    recorder = await createWavRecorder(stream);
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    showToast("当前浏览器无法建立 WAV 录音，将改用实时语音识别", 3600);
    return false;
  }
  contactEditor.audioRecorder = recorder;
  contactEditor.recordingStream = stream;
  contactEditor.recordingBaseText = clean(input?.value || contactEditor.voiceDraft).slice(0, 2400);
  contactEditor.recordingAsrText = "";
  contactEditor.finalizingVoice = false;
  contactEditor.recording = true;
  contactEditor.voiceAutoOrganize = true;
  contactEditor.voiceStatus = "实时识别中 · MiMo 将校正最终文本";
  contactEditor.voiceTimeout = window.setTimeout(
    () => stopContactVoice({ autoOrganize: true }),
    30_000
  );
  startContactLiveAsr();
  updateContactVoiceButton();
  return true;
}

function stopContactVoice({ autoOrganize = false, discard = false } = {}) {
  window.clearTimeout(contactEditor.voiceTimeout);
  if (discard) contactEditor.voiceAutoOrganize = false;
  else if (autoOrganize) contactEditor.voiceAutoOrganize = true;
  if (contactEditor.audioRecorder) {
    const recorder = contactEditor.audioRecorder;
    const stream = contactEditor.recordingStream;
    const shouldOrganize = !discard && contactEditor.voiceAutoOrganize;
    const preview = clean(contactEditor.voiceDraft).slice(0, 2400);
    const stableText = contactEditor.recordingAsrText;
    const tail = recorder.snapshot(contactEditor.lastAsrChunkIndex || 0);
    stopContactLiveAsr();
    contactEditor.audioRecorder = null;
    contactEditor.recordingStream = null;
    contactEditor.recording = false;
    contactEditor.voiceAutoOrganize = false;
    contactEditor.finalizingVoice = true;
    contactEditor.voiceStatus = "正在用 MiMo ASR 校正语音…";
    const blob = recorder.stop();
    stream?.getTracks().forEach((track) => track.stop());
    updateContactVoiceButton();
    if (discard) {
      contactEditor.recordingBaseText = "";
      contactEditor.recordingAsrText = "";
      contactEditor.finalizingVoice = false;
      contactEditor.voiceStatus = "";
      return;
    }
    void finalizeContactRecording(blob, { preview, shouldOrganize, tail, stableText });
    return;
  }
  contactEditor.recording = false;
  contactEditor.voiceStatus = "";
  updateContactVoiceButton();
}

async function finalizeContactRecording(blob, { preview, shouldOrganize, tail, stableText = "" }) {
  let transcript = preview;
  try {
    // Append the newly recognized tail to whatever is already in the input.
    if (tail?.size > 44) {
      const corrected = await transcribeRecordedAudio(tail, { timeoutMs: 45_000 });
      const newTail = extractNewTranscript(stableText, corrected);
      transcript = appendVoiceTranscript(preview || contactEditor.voiceDraft, newTail).slice(0, 2400);
    } else if (stableText) {
      transcript = appendVoiceTranscript(preview || contactEditor.voiceDraft, "").slice(0, 2400) || stableText;
    } else if (blob.size) {
      const corrected = await transcribeRecordedAudio(blob, { timeoutMs: 45_000 });
      const newTail = extractNewTranscript(stableText, corrected);
      transcript = appendVoiceTranscript(preview || contactEditor.voiceDraft, newTail).slice(0, 2400);
    }
    if (transcript && editingContactId) {
      contactEditor.voiceDraft = transcript;
      contactEditor.voiceStatus = shouldOrganize ? "MiMo 校正完成 · 正在整理档案" : "MiMo 校正完成";
      const input = document.querySelector("#contact-voice-input");
      if (input) input.value = transcript;
      updateContactVoiceButton();
      if (shouldOrganize) await organizeContactDraft();
    }
  } catch (error) {
    if (preview && editingContactId) {
      contactEditor.voiceDraft = preview;
      showToast("MiMo 校正超时，已保留实时识别文字", 3800);
      if (shouldOrganize) await organizeContactDraft();
    } else if (editingContactId) {
      showToast(error instanceof PlatformError ? error.message : "语音识别未完成，请改用文字输入", 4200);
    }
  } finally {
    contactEditor.recordingBaseText = "";
    contactEditor.recordingAsrText = "";
    contactEditor.finalizingVoice = false;
    contactEditor.voiceStatus = "";
    updateContactVoiceButton();
  }
}

function startContactLiveAsr() {
  stopContactLiveAsr();
  contactEditor.liveAsrTimer = window.setInterval(() => {
    void refreshContactLiveAsr();
  }, 2_200);
}

function stopContactLiveAsr() {
  window.clearInterval(contactEditor.liveAsrTimer);
  contactEditor.liveAsrTimer = null;
  contactEditor.liveAsrController?.abort();
  contactEditor.liveAsrController = null;
  contactEditor.lastAsrChunkIndex = 0;
}

async function refreshContactLiveAsr() {
  const recorder = contactEditor.audioRecorder;
  if (!contactEditor.recording || !recorder || contactEditor.liveAsrController) return;
  if (recorder.durationMs() < 1_200) return;
  // Incremental snapshot: only the audio recorded since the last correction.
  const fromIndex = contactEditor.lastAsrChunkIndex || 0;
  const snapshot = recorder.snapshot(fromIndex);
  if (snapshot.size <= 44) return;
  const previewAtRequest = contactEditor.voiceDraft;
  const controller = new AbortController();
  contactEditor.liveAsrController = controller;
  try {
    let corrected = "";
    try {
      corrected = await streamTranscribeRecordedAudio(snapshot, {
        timeoutMs: 12_000,
        signal: controller.signal,
        onText(partial) {
          const newTail = extractNewTranscript(contactEditor.recordingAsrText, partial);
          if (!newTail) return;
          const live = appendVoiceTranscript(contactEditor.voiceDraft, newTail).slice(0, 2400);
          const input = document.querySelector("#contact-voice-input");
          if (input) input.value = live;
          contactEditor.voiceDraft = live;
        },
      });
    } catch (error) {
      if (error?.code === "asr_stream_failed" || error?.code === "asr_stream_incomplete") {
        corrected = await transcribeRecordedAudio(snapshot, { timeoutMs: 18_000, signal: controller.signal });
      } else throw error;
    }
    corrected = corrected.slice(0, 2400);
    if (!corrected || !contactEditor.recording || contactEditor.liveAsrController !== controller) return;
    contactEditor.lastAsrChunkIndex = recorder.chunkCount();
    // Only append the genuinely new tail of this ASR result.
    const newTail = extractNewTranscript(contactEditor.recordingAsrText, corrected);
    contactEditor.recordingAsrText = appendVoiceTranscript(contactEditor.recordingAsrText, corrected).slice(0, 2400);
    if (newTail) {
      contactEditor.voiceDraft = appendVoiceTranscript(contactEditor.voiceDraft, newTail).slice(0, 2400);
    }
    const input = document.querySelector("#contact-voice-input");
    if (input) input.value = contactEditor.voiceDraft;
    contactEditor.voiceStatus = "MiMo 已实时识别 · 继续说即可";
    window.setTimeout(() => {
      if (!contactEditor.recording) return;
      contactEditor.voiceStatus = "实时识别中 · MiMo 将追加识别文本";
      updateContactVoiceButton();
    }, 1_200);
    updateContactVoiceButton();
  } catch {
    // The final full-WAV pass still runs on stop.
  } finally {
    if (contactEditor.liveAsrController === controller) contactEditor.liveAsrController = null;
  }
}

function updateContactVoiceButton() {
  const button = document.querySelector("#contact-voice-button");
  if (!button) return;
  button.classList.toggle("is-recording", contactEditor.recording);
  button.classList.toggle("is-processing", contactEditor.finalizingVoice);
  button.disabled = contactEditor.finalizingVoice;
  button.innerHTML = `<span class="voice-recording-visual ${contactEditor.recording ? "is-live" : contactEditor.finalizingVoice ? "is-processing" : ""}" aria-hidden="true">${contactEditor.recording ? "<i></i><i></i><i></i><i></i><i></i>" : contactEditor.finalizingVoice ? "<b></b><b></b><b></b>" : "◉"}</span>${contactEditor.recording ? "停止并校正" : contactEditor.finalizingVoice ? "MiMo 校正中…" : "语音输入"}`;
  const status = document.querySelector("#contact-editor-status");
  if (status) {
    status.textContent = [
      contactEditor.voiceStatus,
      contactEditor.nextQuestion ? `建议继续确认：${contactEditor.nextQuestion}` : "",
    ].filter(Boolean).join(" · ");
  }
}

async function organizeContactDraft() {
  const input = document.querySelector("#contact-voice-input");
  const status = document.querySelector("#contact-editor-status");
  const contact = getContact(editingContactId);
  const existing = {
    context: clean(document.querySelector("#editor-contact-context")?.value || contact?.context),
    goal: clean(document.querySelector("#editor-contact-goal")?.value || contact?.goal),
    boundary: clean(document.querySelector("#editor-contact-boundary")?.value || contact?.boundary),
  };
  const draft = clean(input?.value).slice(0, 2400);
  if (!draft) {
    showToast("先输入或说一段想补充的内容", 2800);
    input?.focus();
    return;
  }
  contactEditor.voiceDraft = draft;
  const canUseAgent = Boolean(platform.user && platform.externalAiConsent?.current && platform.capabilities?.agent);
  if (!canUseAgent) {
    const context = document.querySelector("#editor-contact-context");
    if (context) context.value = `${context.value ? `${context.value}\n\n` : ""}${draft}`.slice(-1200);
    contactEditor.organized = true;
    if (status) status.textContent = "当前未连接 Agent，已把语音草稿放入认识背景。";
    return;
  }
  contactEditor.busy = true;
  setContactEditorBusy(true);
  if (status) status.textContent = "正在用 Agent 整理这段补充…";
  try {
    const complete = await platformClient.streamAgent([
      {
        role: "user",
        content: `请结合已有档案和这次补充，整理成 JSON。只允许包含 context、goal、boundary、question 四个字符串字段：context 写认识背景和可观察事实，goal 写用户已表达的目标，boundary 写明确边界/拒绝/待确认点，question 只提出一个当前最缺失且具体的事实问题；没有问题时 question 写空字符串。不确定的信息写“未提及”，不要推断对方想法，不要输出 markdown。不要丢失已有事实。\n\n已有档案：\n${JSON.stringify(existing)}\n\n本次补充：\n${draft}`,
      },
    ]);
    const parsed = parseContactDraft(complete);
    if (parsed) {
      const context = document.querySelector("#editor-contact-context");
      const goal = document.querySelector("#editor-contact-goal");
      const boundary = document.querySelector("#editor-contact-boundary");
      if (parsed.context) context.value = parsed.context;
      if (parsed.goal) goal.value = parsed.goal;
      if (parsed.boundary) boundary.value = parsed.boundary;
      contactEditor.nextQuestion = parsed.question || "";
      contactEditor.organized = true;
      if (status) status.textContent = parsed.question
        ? `已整理到档案字段。建议继续确认：${parsed.question}`
        : "已整理到档案字段，确认无误后保存。";
    } else {
      const context = document.querySelector("#editor-contact-context");
      if (context) context.value = `${context.value ? `${context.value}\n\n` : ""}${clean(complete || draft)}`.slice(-1200);
      if (status) status.textContent = "模型返回了普通文本，已放入认识背景，请检查后保存。";
    }
  } catch (error) {
    if (status) status.textContent = error instanceof PlatformError ? error.message : "AI 整理未完成，草稿仍保留在输入框。";
  } finally {
    contactEditor.busy = false;
    setContactEditorBusy(false);
  }
}

function parseContactDraft(text) {
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      context: clean(parsed.context).slice(0, 1200),
      goal: clean(parsed.goal).slice(0, 600),
      boundary: clean(parsed.boundary).slice(0, 600),
      question: clean(parsed.question).slice(0, 300),
    };
  } catch {
    return null;
  }
}

function setContactEditorBusy(busy) {
  document.querySelectorAll("#contact-editor-form input, #contact-editor-form textarea, #contact-editor-form select, #contact-editor-form button").forEach((node) => {
    if (node.matches('[data-action="close-contact-editor"]')) return;
    node.disabled = busy;
  });
}

function saveContactEditor(form, formData) {
  const contact = getContact(editingContactId);
  if (!contact || contactEditor.busy) return;
  const alias = clean(formData.get("alias")).slice(0, 40);
  const duplicate = state.contacts.some((item) => item.id !== contact.id && item.alias.toLocaleLowerCase("zh-CN") === alias.toLocaleLowerCase("zh-CN"));
  if (!alias) {
    form.querySelector("#editor-contact-alias")?.focus();
    showToast("请先填写匿名代号", 2800);
    return;
  }
  if (duplicate) {
    showToast("匿名代号已存在，请换一个可区分的代号", 3200);
    form.querySelector("#editor-contact-alias")?.focus();
    return;
  }
  const voiceDraft = clean(formData.get("voiceDraft")).slice(0, 2400);
  const context = clean(formData.get("context"));
  if (!commitState((next) => {
    const target = next.contacts.find((item) => item.id === contact.id);
    if (!target) return;
    target.alias = alias;
    target.stage = clean(formData.get("stage"));
    target.context = (!contactEditor.organized && voiceDraft
      ? `${context ? `${context}\n\n` : ""}语音补充\n${voiceDraft}`
      : context).slice(-1200);
    target.goal = clean(formData.get("goal")).slice(0, 600);
    target.boundary = clean(formData.get("boundary")).slice(0, 600);
  })) return;
  preferredContactId = contact.id;
  closeContactEditor();
  showToast(`对象档案已更新：${alias}`);
}

function contactInsights(events) {
  if (!events.length) {
    return {
      specificity: "待补充",
      topicDepth: "待补充",
      emotionalDepth: "待补充",
      verification: "待补充",
      lastSeen: "尚无互动",
    };
  }
  const count = events.length;
  const specificCount = events.filter(
    (event) => event.scene && event.fact.length >= 30 && event.date
  ).length;
  const topicCount = events.filter(
    (event) => event.interpretation.length >= 10 || event.reply.length >= 8
  ).length;
  const emotionalCount = events.filter(
    (event) => event.feeling.length >= 2 || event.review?.learning
  ).length;
  const verifiedCount = events.filter(
    (event) => event.signals.length >= 2 && event.boundaryStatus
  ).length;
  const level = (value) => value / count >= 0.66 ? "深入" : value / count >= 0.34 ? "展开" : "初步";
  const latestDate = events[0].date || events[0].createdAt?.slice(0, 10);
  return {
    specificity: level(specificCount),
    topicDepth: level(topicCount),
    emotionalDepth: level(emotionalCount),
    verification: verifiedCount / count >= 0.66 ? "充分" : verifiedCount ? "部分" : "不足",
    lastSeen: latestDate ? `最近记录 ${formatDate(latestDate)}` : "最近记录日期未知",
  };
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
        "关系日记留在本地，匿名档案只在你提交 Agent 问题时同步。",
        "规则分析、复盘和完整本地日记不会上传；经同意后，Agent 会把匿名 profile/contact/event 的最少必要字段更新到当前账号的隔离知识库。"
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

function canSpeakStoryText() {
  return Boolean(
    platform.user
    && platform.externalAiConsent?.current
    && platform.capabilities?.agent
  );
}

function beginStreamingStorySpeech() {
  cancelStorySpeech();
  ttsState.streamBuffer = "";
  ttsState.errorNotified = false;
}

function queueStreamingStorySpeech(rawChunk) {
  if (!canSpeakStoryText() || typeof rawChunk !== "string" || !rawChunk) return;
  ttsState.streamBuffer += rawChunk;
  const result = extractCompletedSpeechChunks(ttsState.streamBuffer);
  ttsState.streamBuffer = result.remainder;
  enqueueStorySpeechChunks(result.chunks);
}

function flushStreamingStorySpeech() {
  if (!canSpeakStoryText()) return;
  const result = extractCompletedSpeechChunks(ttsState.streamBuffer, { flush: true });
  ttsState.streamBuffer = "";
  enqueueStorySpeechChunks(result.chunks);
}

function speakCompleteStoryText(text) {
  beginStreamingStorySpeech();
  ttsState.streamBuffer = text || "";
  flushStreamingStorySpeech();
}

function enqueueStorySpeechChunks(chunks) {
  for (const chunk of chunks) {
    const text = normalizeAssistantText(chunk).slice(0, 220);
    if (text) ttsState.queue.push(text);
  }
  if (!ttsState.playing && ttsState.queue.length) {
    void playStorySpeechQueue(ttsState.generation);
  }
}

async function playStorySpeechQueue(generation) {
  if (ttsState.playing || generation !== ttsState.generation) return;
  ttsState.playing = true;
  document.body.classList.add("is-agent-speaking");
  try {
    while (generation === ttsState.generation && ttsState.queue.length) {
      const text = ttsState.queue.shift();
      const controller = new AbortController();
      ttsState.controller = controller;
      let url = "";
      try {
        const blob = await platformClient.synthesizeVoice(text, {
          voice: "茉莉",
          signal: controller.signal,
        });
        if (generation !== ttsState.generation) break;
        if (!(await playStoryAudioBlob(blob, controller.signal))) {
          url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          ttsState.currentAudio = audio;
          ttsState.currentUrl = url;
          await playAudioToEnd(audio, controller.signal);
        }
      } catch (error) {
        if (controller.signal.aborted || generation !== ttsState.generation) break;
        console.info("story_tts_unavailable", { code: error?.code || error?.name || "request_failed" });
        if (!ttsState.errorNotified) {
          ttsState.errorNotified = true;
          showToast(
            error instanceof PlatformError
              ? `AI 语音未播放：${error.message}`
              : "AI 语音被浏览器阻止，请点击一次输入区后继续",
            4600
          );
        }
        ttsState.queue = [];
        break;
      } finally {
        if (url) URL.revokeObjectURL(url);
        if (ttsState.currentUrl === url) {
          ttsState.currentAudio = null;
          ttsState.currentUrl = "";
        }
        if (ttsState.controller === controller) ttsState.controller = null;
      }
    }
  } finally {
    if (generation === ttsState.generation) {
      ttsState.playing = false;
      document.body.classList.remove("is-agent-speaking");
    }
  }
}

async function unlockStoryAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;
  try {
    if (!ttsState.audioContext || ttsState.audioContext.state === "closed") {
      ttsState.audioContext = new AudioContextClass();
    }
    if (ttsState.audioContext.state !== "running") {
      await ttsState.audioContext.resume();
    }
    return ttsState.audioContext.state === "running";
  } catch {
    return false;
  }
}

function decodePcm16Base64(base64) {
  const binary = atob(String(base64 || "").replaceAll(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function schedulePcm16Audio(base64) {
  const context = ttsState.audioContext;
  if (!context || context.state !== "running") return false;
  const bytes = decodePcm16Base64(base64);
  const frameCount = Math.floor(bytes.byteLength / 2);
  if (!frameCount) return false;
  const buffer = context.createBuffer(1, frameCount, 24_000);
  const channel = buffer.getChannelData(0);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < frameCount; index += 1) {
    channel[index] = view.getInt16(index * 2, true) / 32768;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  const startAt = Math.max(context.currentTime + 0.03, ttsState.nextAudioTime || 0);
  ttsState.nextAudioTime = startAt + buffer.duration;
  source.onended = () => {
    ttsState.sources.delete(source);
    if (ttsState.currentSource === source) ttsState.currentSource = null;
  };
  ttsState.sources.add(source);
  ttsState.currentSource = source;
  source.start(startAt);
  return true;
}

async function playStreamingStoryText(text, signal) {
  const unlocked = await unlockStoryAudio();
  if (!unlocked || !ttsState.audioContext) return 0;
  let scheduledChunks = 0;
  try {
    await platformClient.streamVoice(text, {
      voice: "茉莉",
      signal,
      onAudio(audio) {
        if (schedulePcm16Audio(audio)) scheduledChunks += 1;
      },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    if (scheduledChunks) return scheduledChunks;
    throw error;
  }
  if (!scheduledChunks) return 0;
  const waitUntil = Math.max(ttsState.nextAudioTime, ttsState.audioContext.currentTime);
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const tick = () => {
      if (signal.aborted) return finish();
      if (ttsState.audioContext.currentTime >= waitUntil - 0.01) return finish();
      window.setTimeout(tick, 30);
    };
    signal.addEventListener("abort", finish, { once: true });
    tick();
  });
  return scheduledChunks;
}

async function playStoryAudioBlob(blob, signal) {
  const unlocked = await unlockStoryAudio();
  const context = ttsState.audioContext;
  if (!unlocked || !context) return false;
  const bytes = await blob.arrayBuffer();
  if (signal.aborted) return true;
  let buffer;
  try {
    buffer = await context.decodeAudioData(bytes.slice(0));
  } catch {
    return false;
  }
  if (signal.aborted) return true;
  await new Promise((resolve) => {
    let settled = false;
    const source = context.createBufferSource();
    const finish = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      if (ttsState.currentSource === source) ttsState.currentSource = null;
      resolve();
    };
    const abort = () => {
      try { source.stop(); } catch { /* source may not have started */ }
      finish();
    };
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = finish;
    signal.addEventListener("abort", abort, { once: true });
    ttsState.currentSource = source;
    source.start();
  });
  return true;
}

function playAudioToEnd(audio, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      audio.onended = null;
      audio.onerror = null;
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => {
      audio.pause();
      finish();
    };
    audio.onended = finish;
    audio.onerror = () => finish(new Error("audio_decode_failed"));
    signal.addEventListener("abort", abort, { once: true });
    audio.play().catch((error) => finish(error));
  });
}

function cancelStorySpeech() {
  ttsState.generation += 1;
  ttsState.controller?.abort();
  for (const source of ttsState.sources) {
    try { source.stop(); } catch { /* source may already be stopped */ }
  }
  ttsState.sources.clear();
  ttsState.currentAudio?.pause();
  if (ttsState.currentUrl) URL.revokeObjectURL(ttsState.currentUrl);
  ttsState.queue = [];
  ttsState.playing = false;
  ttsState.controller = null;
  ttsState.currentAudio = null;
  ttsState.currentSource = null;
  ttsState.nextAudioTime = 0;
  ttsState.currentUrl = "";
  ttsState.streamBuffer = "";
  document.body.classList.remove("is-agent-speaking");
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

function isTypingTarget(target) {
  return Boolean(target?.matches?.("input, textarea, select, [contenteditable='true']"));
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
