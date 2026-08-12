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
    tagline: "A private space to make sense of relationships",
    overview: "Home",
    localMode: "On-device",
    startRecord: "Tell Your Story",
    people: "People & Stories",
    thinkTogether: "Think It Through",
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
    if (window.location.pathname === "/en" || window.location.pathname.startsWith("/en/")) {
      return "en";
    }
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
  const target = next === "en" ? "/en/" : "/";
  if (window.location.pathname !== target) window.location.assign(target);
  else localizePage();
  return next;
}

export function t(key, locale) {
  const l = locale || detectLocale();
  return translations[l]?.[key] || translations.en[key] || key;
}

export function localizePage() {
  const locale = detectLocale();
  document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
  // data-i18n attribute-based elements
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key, locale);
  }
  for (const el of document.querySelectorAll("[data-i18n-html]")) {
    const key = el.getAttribute("data-i18n-html");
    if (key) el.innerHTML = t(key, locale);
  }
  // Global DOM phrase replacement for en locale (covers hardcoded Chinese in templates)
  if (locale !== "zh") translateDOM(document.body, locale);
}

const EN_PHRASES = {
  "我的空间": "My Space",
  "今日概览": "Dashboard",
  "开始记录": "Tell Your Story",
  "对象档案": "People & Stories",
  "一起想想": "Think It Through",
  "行动复盘": "Review",
  "信号分析": "Analysis",
  "表达设置": "Profile",
  "最近记录": "Recent Entries",
  "没有记录": "No entries",
  "添加对象": "Add Person",
  "设置目标": "Set Goal",
  "欢迎回来": "Welcome back",
  "查看全部复盘 →": "All reviews →",
  "本地日记": "Local Journal",
  "匿名档案": "Anonymous Profile",
  "用语音开始记录": "Start with voice",
  "当前浏览器不支持语音输入": "Voice not supported",
  "故事已整理并归档到对象档案": "Story organized and archived",
  "对象档案未能进入专属知识库": "Profile sync failed",
  "对象档案同步失败，请稍后重试。": "Profile sync failed, try again later.",
  "对象档案 · ": "Profile · ",
  "编辑对象档案：": "Edit profile: ",
  "最近心里挂着什么？": "What have you been trying to make sense of?",
  "登出": "Logout",
  "导出数据": "Export Data",
  "导入数据": "Import Data",
  "清空数据": "Clear Data",
  "隐私政策": "Privacy Policy",
  "登录": "Sign In",
  "注册": "Register",
  "保存": "Save",
  "取消": "Cancel",
  "删除": "Delete",
  "确认": "Confirm",
  "发送": "Send",
  "停止": "Stop",
  "复盘": "Review",
  "分析": "Analysis",
  "已登录": "Signed in",
  "登录 Agent": "Sign In",
  "账户": "Account",
  "会员": "Member",
  "退出账户": "Sign Out",
  "导出数据": "Export Data",
  "导入数据": "Import Data",
  "清空数据": "Clear Data",
  "隐私政策": "Privacy Policy",
  "实时识别中 ·": "Listening ·",
  "录音中 ·": "Recording ·",
  "校正中…": "Correcting…",
  "识别完成": "Recognition done",
  "校正完成": "Correction done",
  "语音输入": "Voice Input",
  "停止并校正": "Stop & Correct",
  "停止语音输入": "Stop Voice",
  "开始语音输入": "Start Voice",
  "用语音开始记录": "Start with Voice",
  "当前浏览器不支持语音输入": "Voice input not supported",
  "当前浏览器无法录音，请改用文字输入": "Recording unavailable. Use text instead.",
  "无法取得麦克风权限，请允许录音后重试": "Microphone access denied. Please allow and retry.",
  "故事已整理并归档到对象档案": "Story organized and archived to profile.",
  "对象档案未能进入专属知识库": "Profile could not enter knowledge base:",
  "对象档案同步失败，请稍后重试。": "Profile sync failed. Try again later.",
  "对象档案 · ": "Profile · ",
  "编辑对象档案：": "Edit Profile: ",
  "条事件": "events",
  "条记录": "entries",
  "事件已保存，结构化分析已生成": "Event saved. Analysis generated.",
  "复盘已保存，真实结果已加入记录": "Review saved. Real outcome added.",
  "复盘已保存，真实结果已修正当前行动策略": "Review saved. Strategy updated with real outcome.",
  "语音识别未完成，请改用文字输入": "Voice recognition incomplete. Use text instead.",
  "语音识别未完成，请改用文字输入。": "Voice recognition incomplete. Use text instead.",
  "校正超时，已保留实时识别文字": "Correction timed out. Live text kept.",
  "识别超时，已保留已有文字": "Recognition timed out. Existing text kept.",
  "识别完成 · 正在发送": "Done · Sending",
  "校正完成 · 正在整理档案": "Done · Organizing",
  "已实时识别 · 继续说即可": "Live recognition active · Keep talking",
  "将持续追加识别文本": "Appending recognized text",
  "将校正最终文本": "Correcting final text",
  "这将删除服务器上的个人知识库": "This will delete your knowledge base on the server.",
  "不记录本地事件正文": "Does not record local event content.",
  "退出未完成": "Sign-out incomplete",
  "已退出账户；本地关系记录未受影响": "Signed out. Local records unaffected.",
  "已登录关系思考": "Signed in for Agent",
  "当前未连接": "Not connected",
  "正在连接同源服务…": "Connecting to service…",
  "服务启动后再登录。": "Login after the service starts.",
  "正在用": "Using",
  "校正语音…": "Correcting voice…",
  "正在校正语音": "Correcting voice",
  "生成已由你停止。": "Generation stopped by you.",
  "这次没有接上回应，你可以继续写下去。": "No response received. You can keep writing.",
  "这次回应没有完成，请稍后重试。": "Response incomplete. Try again later.",
  "这次没有收到可显示的文本，请稍后再试。": "No displayable text. Try again later.",
  "我还想再确认一下你的边界": "Let me confirm your boundaries",
  "我有点分不清了": "I'm a bit confused",
  "帮我说得自然一点": "Help me sound natural",
  "告诉我你的故事": "Tell me your story",
  "陪我理一理": "Help me think it through",
  "先坐下来，": "Take a seat,",
  "我在听，你慢慢说。": "I'm listening. Take your time.",
  "想到哪儿说到哪儿": "Just speak as you think",
  "从一句话开始就好": "Start with one sentence",
  "说清楚就好，不用": "Just be clear, no need to",
  "返回今日概览": "Back to Dashboard",
  "查看全部复盘": "All reviews",
  "前往隐私与数据": "Privacy & Data",
  "开始说说": "Start talking",
  "继续说": "Continue",
  "先跳过": "Skip",
  "展开": "Expand",
  "没有记录": "No entries",
  "还没有档案": "No profiles yet",
  "保存": "Save",
  "取消": "Cancel",
  "删除": "Delete",
  "确认": "Confirm",
  "发送": "Send",
  "停止": "Stop",
  "登录": "Sign In",
  "注册": "Register",
  "登出": "Sign Out",
  "复盘": "Review",
  "分析": "Analysis",
  "下一步": "Next Step",
  "账号": "Account",
  "用户名": "Username",
  "昵称即可": "Nickname is fine",
  "创建账户": "Create Account",
  "已有账户": "Existing Account",
  "注册并登录": "Sign Up",
  "同意并继续": "Agree & Continue",
  "我已阅读并同意": "I have read and agree",
  "年龄确认之前": "Before age verification",
  "仅面向年满": "For ages",
  "的成年人": "and above",
  "数据以明文保存在当前浏览器": "Data stored in plaintext in this browser",
  "不保存真实姓名": "Do not save real names",
  "匿名代号": "Alias",
  "场景": "Scene",
  "日期": "Date",
  "事实": "Facts",
  "回应": "Response",
  "未知": "Unknown",
  "未提及": "Not mentioned",
  "未填写": "Not filled",
  "未记录": "Not recorded",
  "待补充": "To be completed",
  "待记录": "To be recorded",
  "保存档案": "Save Profile",
  "编辑档案": "Edit Profile",
  "删除档案": "Delete Profile",
  "新建档案": "New Profile",
  "我要补充": "Add",
  "结果反馈": "Outcome",
  "更新复盘": "Update Review",
  "保存复盘": "Save Review",
  "保存我的表达": "Save Expression",
  "我的空间": "My Space",
  "我的表达": "My Expression",
  "我的边界": "My Boundaries",
  "我的回应": "My Response",
  "我的解释": "My Interpretation",
  "你的解释": "Your Interpretation",
  "返回概览": "Back to Overview",
};

function translateDOM(root, locale) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      // Skip script/style, inputs, and textareas
      const tag = n.parentElement?.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "INPUT" || tag === "TEXTAREA") return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const entries = Object.entries(EN_PHRASES).sort((a, b) => b[0].length - a[0].length);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    let changed = false;
    let text = node.textContent;
    for (const [zh, en] of entries) {
      if (text.includes(zh)) {
        text = text.replaceAll(zh, en);
        changed = true;
      }
    }
    if (changed) node.textContent = text;
  }
}
