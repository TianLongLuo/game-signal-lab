(function () {
  "use strict";

  const runtime = window.__GAME_RUNTIME__ || {};
  const measurementId = String(runtime.gaMeasurementId || "").trim().toUpperCase();
  if (!/^G-[A-Z0-9]{6,14}$/.test(measurementId)) return;

  const CONSENT_KEY = "game-analytics-consent-v1";
  let initialized = false;
  let initialPageSent = false;

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }

  function readConsent() {
    try {
      const value = localStorage.getItem(CONSENT_KEY);
      return value === "granted" || value === "denied" ? value : null;
    } catch {
      return null;
    }
  }

  function saveConsent(value) {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {}
  }

  function initialize() {
    if (initialized || readConsent() !== "granted") return;
    initialized = true;
    gtag("js", new Date());
    gtag("config", measurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      anonymize_ip: true,
    });
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    script.referrerPolicy = "strict-origin-when-cross-origin";
    document.head.append(script);
  }

  function safeText(value, max = 80) {
    return String(value || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
  }

  function page(screen, title) {
    if (readConsent() !== "granted") return;
    initialize();
    const locale = location.pathname.startsWith("/en") ? "en" : "zh-CN";
    const screenName = safeText(screen || "home", 40).replace(/[^a-z0-9_-]/gi, "_");
    const pagePath = `${location.pathname.replace(/\/$/, "") || "/"}#${screenName}`;
    gtag("event", "page_view", {
      page_title: safeText(title || document.title, 120),
      page_location: `${location.origin}${pagePath}`,
      page_path: pagePath,
      content_group: locale,
      app_screen: screenName,
    });
    initialPageSent = true;
  }

  function event(name, parameters) {
    if (readConsent() !== "granted") return;
    initialize();
    const eventName = safeText(name, 40).toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!eventName) return;
    const allowed = {};
    for (const [key, value] of Object.entries(parameters || {})) {
      if (!/^[a-z][a-z0-9_]{0,39}$/i.test(key)) continue;
      if (typeof value === "boolean" || typeof value === "number") allowed[key] = value;
      if (typeof value === "string") allowed[key] = safeText(value, 80);
    }
    gtag("event", eventName, allowed);
  }

  window.gameAnalytics = Object.freeze({
    page,
    event,
    preferences() {
      removeBanner();
      renderConsent(true);
    },
  });

  document.addEventListener("click", (clickEvent) => {
    const target = clickEvent.target.closest("button, a");
    if (!target) return;
    if (target.id === "enter-app") event("app_enter");
    if (target.id === "story-voice-toggle" || target.dataset.action === "story-voice-toggle") {
      event("voice_recording_toggle", { screen: "story" });
    }
    if (target.dataset.action === "story-end") event("story_archive_requested");
    if (target.dataset.action === "cancel-agent") event("agent_generation_cancelled");
    if (target.dataset.action === "analytics-preferences") {
      window.gameAnalytics.preferences();
    }
    if (target.matches('a[href^="/blog/"]')) event("blog_link_opened");
    if (target.matches('a[href^="/privacy/"], a[href^="/en/privacy/"]')) {
      event("privacy_notice_opened", { from: location.pathname });
    }
  });

  document.addEventListener("submit", (submitEvent) => {
    const id = submitEvent.target?.id || "";
    const events = {
      "story-form": "story_answer_submitted",
      "agent-form": "agent_prompt_submitted",
      "login-form": "login_submitted",
      "register-form": "registration_submitted",
    };
    if (events[id]) event(events[id]);
  });

  function removeBanner() {
    document.querySelector("#analytics-consent")?.remove();
  }

  function renderConsent(force = false) {
    if ((!force && readConsent() !== null) || document.querySelector("#analytics-consent")) return;
    const english = document.documentElement.lang.toLowerCase().startsWith("en");
    const banner = document.createElement("aside");
    banner.id = "analytics-consent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", english ? "Analytics preference" : "分析数据偏好");
    banner.style.cssText = "position:fixed;z-index:10000;right:18px;bottom:18px;width:min(420px,calc(100vw - 36px));padding:18px;border:1px solid rgba(255,255,255,.22);background:#100d15;color:#f7f3fb;box-shadow:0 18px 70px rgba(0,0,0,.48);font:14px/1.6 system-ui,-apple-system,sans-serif";
    const copy = document.createElement("p");
    copy.style.cssText = "margin:0 0 14px";
    copy.textContent = english
      ? "Help us improve GAME with privacy-conscious Google Analytics. It measures pages, feature completion, approximate region, and browser/device information—never journal text, profile content, recordings, AI messages, usernames, or GAME user IDs."
      : "帮助我们通过 Google Analytics 改进 GAME。它会统计页面、功能完成、粗略地区和浏览器/设备信息，但不收集日记正文、对象档案、录音、AI 消息、用户名或站内用户 ID。";
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;justify-content:flex-end;gap:10px";
    const decline = document.createElement("button");
    const accept = document.createElement("button");
    for (const button of [decline, accept]) {
      button.type = "button";
      button.style.cssText = "border:1px solid rgba(255,255,255,.32);padding:9px 14px;background:transparent;color:inherit;cursor:pointer";
    }
    decline.textContent = english ? "No thanks" : "暂不参与";
    accept.textContent = english ? "Allow analytics" : "允许匿名分析";
    accept.style.background = "#ff3b30";
    accept.style.borderColor = "#ff3b30";
    decline.addEventListener("click", () => {
      const needsReload = initialized;
      saveConsent("denied");
      removeBanner();
      if (needsReload) window.location.reload();
    });
    accept.addEventListener("click", () => {
      saveConsent("granted");
      removeBanner();
      initialize();
      page("home", document.title);
    });
    actions.append(decline, accept);
    banner.append(copy, actions);
    document.body.append(banner);
  }

  if (readConsent() === "granted") {
    initialize();
    window.addEventListener("DOMContentLoaded", () => {
      const initialScreen = location.pathname.includes("/privacy/")
        ? "privacy_notice"
        : location.pathname.includes("/blog")
          ? "blog"
          : "home";
      if (!initialPageSent) page(initialScreen, document.title);
    }, { once: true });
  } else if (readConsent() === null) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", renderConsent, { once: true });
    } else {
      renderConsent();
    }
  }
})();
