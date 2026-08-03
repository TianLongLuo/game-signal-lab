/**
 * Minimal i18n layer for GAME Signal Lab.
 * Locale is set from window.__GAME_RUNTIME__.locale (server-side IP detection).
 */
const translations = {
  zh: {
    appName: "GAME Signal Lab",
    tagline: "一间只属于你的关系工作室",
    overview: "今日概览",
    localMode: "本地模式",
    startRecord: "开始记录",
    people: "对象档案",
    thinkTogether: "一起想想",
    blog: "博客",
    privacyNote: "你的故事，由你决定放在哪里",
    privacySub: "默认留在本机；使用 Agent 前需明确同意。",
    navLabel: "三项主导航",
    mobileMenuLabel: "打开导航",
    closeNav: "关闭导航",
    ageTitle: "关系里的答案，<br />应该来自双方。",
    ageEyebrow: "使用前确认",
    ageIntro: "GAME 像一张安静的桌子，帮你把发生过的事、心里的感受和还不确定的部分放在一起看。它不会读心，也不会教你突破拒绝。",
    agePrinciple1: "仅面向年满 18 岁的成年人",
    agePrinciple2: "明确表达始终高于信号推断",
    agePrinciple3: "尊重拒绝、边界与自由退出",
    ageCheck: "我已年满 18 岁，并理解分析只作参考。",
    enterApp: "进入 Signal Lab",
    safetyNote: "如遇暴力、胁迫、跟踪或严重心理困扰，请优先寻求现实中的专业支持。",
    noscriptTitle: "GAME Signal Lab",
    noscriptH1: "GAME Signal Lab｜把关系信号整理成可复盘的观察",
    noscriptIntro: "从一个故事开始，把关系里的困惑慢慢说清楚。",
    noscriptWhat: "这是什么工具？",
    noscriptWhatBody: "GAME Signal Lab 是面向成年人的本地优先关系记录与信号分析工具。你可以匿名记录关系事件，把「发生了什么」与「我猜测什么」分开，理解带不确定性的互动信号，并依据真实反馈复盘。",
    noscriptFeatures: "核心功能",
    noscriptFeature1: "关系事件日记：记录事实、解释、感受与回应",
    noscriptFeature2: "信号分析：区分证据强弱与行动策略",
    noscriptFeature3: "行动复盘：用真实结果修正原来的判断",
    noscriptFeature4: "尊重边界：明确拒绝与不舒服优先于任何信号推断",
    noscriptPrivacy: "隐私",
    noscriptPrivacyBody: "你的关系记录默认只保存在当前浏览器的本地存储中，不会被自动上传。只有在你明确同意并主动使用时，才会连接账号与 AI 服务。",
    noscriptJs: "本应用需要 JavaScript 才能在浏览器本地完成记录和分析。",
    agentThinking: "正在思考...",
    agentStop: "停止",
  },
  en: {
    appName: "GAME Signal Lab",
    tagline: "Your personal relationship studio",
    overview: "Dashboard",
    localMode: "Local mode",
    startRecord: "New entry",
    people: "People",
    thinkTogether: "Reflect",
    blog: "Blog",
    privacyNote: "Your stories stay where you choose",
    privacySub: "Stored locally by default; AI consent required before use.",
    navLabel: "Main navigation",
    mobileMenuLabel: "Open navigation",
    closeNav: "Close navigation",
    ageTitle: "Real answers in relationships<br />come from both sides.",
    ageEyebrow: "Before you continue",
    ageIntro: "GAME is a quiet table — a place to lay out what happened, what you felt, and what you're still not sure about. It won't read minds, and it won't teach you to override a no.",
    agePrinciple1: "For adults 18 and over only",
    agePrinciple2: "A clear yes beats every signal",
    agePrinciple3: "Respect refusals, boundaries, and the freedom to leave",
    ageCheck: "I'm 18 or older and understand the analysis is for reference only.",
    enterApp: "Enter Signal Lab",
    safetyNote: "If you are experiencing violence, stalking, or severe distress, please seek real-world professional support first.",
    noscriptTitle: "GAME Signal Lab",
    noscriptH1: "GAME Signal Lab — Turn relationship signals into reviewable observations",
    noscriptIntro: "Start with a story. Talk through what's confusing, one piece at a time.",
    noscriptWhat: "What is this?",
    noscriptWhatBody: "GAME Signal Lab is a privacy-first relationship journal and signal analysis tool for adults. Record relationship events anonymously, separate facts from interpretation, understand uncertain signals, and review against real feedback.",
    noscriptFeatures: "Core features",
    noscriptFeature1: "Event journal: record facts, interpretations, feelings, and responses",
    noscriptFeature2: "Signal analysis: distinguish strong evidence from weak signals",
    noscriptFeature3: "Action review: refine your judgment with real outcomes",
    noscriptFeature4: "Respect boundaries: a clear no outweighs every other signal",
    noscriptPrivacy: "Privacy",
    noscriptPrivacyBody: "Your relationship entries are stored locally in your browser by default and are never automatically uploaded. Account and AI features connect only after your explicit consent.",
    noscriptJs: "This application requires JavaScript for local recording and analysis.",
    agentThinking: "Thinking...",
    agentStop: "Stop",
  },
};

export function detectLocale() {
  try {
    const stored = localStorage.getItem("game-locale");
    if (stored === "zh" || stored === "en") return stored;
    return window.__GAME_RUNTIME__?.locale === "zh" ? "zh" : "en";
  } catch {
    return "en";
  }
}

export function toggleLocale() {
  const current = detectLocale();
  const next = current === "zh" ? "en" : "zh";
  try { localStorage.setItem("game-locale", next); } catch {}
  localizePage();
  return next;
}

export function t(key, locale) {
  const l = locale || detectLocale();
  return translations[l]?.[key] || translations.en[key] || key;
}

export function localizePage() {
  const locale = detectLocale();
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key, locale);
  }
  for (const el of document.querySelectorAll("[data-i18n-html]")) {
    const key = el.getAttribute("data-i18n-html");
    if (key) el.innerHTML = t(key, locale);
  }
  // Update toggle button text
  const btn = document.getElementById("lang-toggle");
  if (btn) btn.textContent = locale === "zh" ? "🌐" : "🌐";
}
