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
  "我": "ME",
  "当前场景：": "Current scene: ",
  "打开": "Open ",
  "一间只属于你的关系工作室": "A private space to make sense of relationships",
  "本地优先 · 尊重边界 · 只保留你愿意留下的部分": "Privacy first · Boundary aware · Keep only what you choose",
  "滚轮切换场景 · 点击卡片进入": "Scroll to change scenes · Select a card to open it",
  "主页场景卡片轮播": "Home scene carousel",
  "场景切换": "Change scene",
  "上一个场景": "Previous scene",
  "下一个场景": "Next scene",
  "归档对象": "Save to profile",
  "结束后新建匿名对象": "Create a new anonymous profile when finished",
  "我在听，你慢慢说。": "I'm listening. Take your time.",
  "不用准备好答案，也不用从头讲起。我会听着你的线索，一次只问一个最有帮助的问题；不想回答，就跳过去。": "You don't need a polished answer or the whole backstory. I'll follow the details and ask one useful question at a time. Skip anything you don't want to answer.",
  "你可以从这里开始": "Start here",
  "告诉我你的故事。你们在哪里认识？那天发生了什么？": "Tell me what happened. Where did you meet, and what stood out that day?",
  "想到哪儿说到哪儿…": "Write whatever comes to mind…",
  "边说边识别 · 结束后整段校正并整理句读 · 电脑端按 R": "Live transcription · Final cleanup after recording · Press R on desktop",
  "立即使用当前文字": "Use Current Text Now",
  "正在完成整段识别 · 通常需要 3–8 秒": "Finishing the full transcript · Usually 3–8 seconds",
  "仍在校正 · 已保留当前文字，最迟数秒后自动采用": "Still refining · Your current text is safe and will be used within a few seconds",
  "整段识别完成 · 正在校正文字": "Full transcript ready · Cleaning up the text",
  "正在补全句读并修正明显错字 · 最多 10 秒": "Adding punctuation and fixing clear recognition errors · Up to 10 seconds",
  "句读整理完成 · 请确认文字后点击发送": "Punctuation cleanup complete · Review the text, then select Send",
  "已保留识别文字 · 请确认后点击发送": "Transcript preserved · Review it, then select Send",
  "已采用实时文字并整理句读 · 请确认后发送": "Live transcript restored and punctuated · Review it, then send",
  "已采用实时识别文字 · 请检查可能的错字": "Live transcript restored · Check for possible recognition errors",
  "已采用当前文字 · 可编辑并发送": "Current text selected · You can edit and send it",
  "归档并结束": "Save & Finish",
  "需要登录并同意外部 AI 处理说明后开始。": "Sign in and accept the AI data notice to begin.",
  "录音期间只保存在当前设备；结束后 WAV 会发送给语音识别服务，并在进入对话前由 DeepSeek 整理句读。本地 FunASR 优先，失败时回退 MiMo；你点击“发送”后才进入对话。": "Audio stays on this device while recording. When you stop, the WAV file is sent for transcription and DeepSeek cleans up punctuation before it enters the conversation. FunASR is used first, with MiMo as fallback. Nothing is sent to the Agent until you select Send.",
  "正在录音": "Recording",
  "边录边识别；手动结束后会用完整 WAV 校正，最长 5 分钟": "Live transcription with a full-WAV correction after you stop · 5-minute maximum",
  "关系思考": "Relationship Reflection",
  "已登录": "Signed in",
  "首次提问时同步匿名档案": "Profiles sync with your first question",
  "个人档案": "Private profile",
  "撤回 AI 同意": "Withdraw AI Consent",
  "清空临时会话": "Clear This Conversation",
  "当前会话": "Current conversation",
  "给未来的自己留一句话": "A note to your future self",
  "写下此刻最想弄清楚的事。": "What do you most want to understand right now?",
  "发送给关系思考 Agent 的内容": "Message to the relationship reflection Agent",
  "不用组织得很漂亮。写下必要信息即可，请用代号，不要粘贴姓名、地址、账号或完整聊天记录。": "It doesn't need to sound polished. Include only what matters, use aliases, and don't paste names, addresses, account details, or full chat logs.",
  "陪我理一理": "Help Me Think It Through",
  "停止生成": "Stop Response",
  "发送问题时，当前浏览器里的匿名对象档案会先更新到该账号的隔离知识库，再由 DeepSeek 只检索这个账号的数据。你主动发送的消息与模型回复会在服务端加密存档，并可由授权管理员在审计后台查看；对象档案正文仍保持账户隔离。": "When you send a question, anonymous profiles in this browser are updated in your account's isolated knowledge base. DeepSeek can retrieve only that account's data. Messages you send and model responses are stored encrypted and may be reviewed by authorized administrators for support and auditing; profile content remains isolated by account.",
  "把一段关系里的困惑交给我一起理一理吧。我会陪你看看发生过什么、你感受到了什么，以及还有哪些地方值得直接问一问。": "Bring me the part of a relationship that feels unclear. We'll look at what happened, what you felt, and what may be worth asking directly.",
  "我有点分不清了": "Help Me Separate Facts from Assumptions",
  "帮我说得自然一点": "Help Me Say It Naturally",
  "我想先确认边界": "Help Me Check the Boundary",
  "先坐下来，": "Take a moment,",
  "听听自己真正担心什么。": "and notice what you're really worried about.",
  "发送之前，": "Before anything is sent,",
  "先把数据去向说清楚。": "let's be clear about where your data goes.",
  "登录或打开页面不会上传本地日记。你确认本说明并提交 Agent 问题时，匿名 profile/contact/event 的最少必要字段会更新到账号专属空间，让 Agent 只检索你的资料。": "Signing in or opening this page does not upload your local journal. After you accept this notice and submit an Agent question, only the minimum necessary anonymous profile, contact, and event fields are updated in your private account space so the Agent can retrieve only your information.",
  "这项同意与会员资格分开。": "This consent is separate from membership.",
  "处理说明": "Data Processing Notice",
  "请只使用代号和最少必要上下文，不发送姓名、账号、地址、定位或完整聊天记录。": "Use aliases and only the context that is necessary. Do not send names, account details, addresses, locations, or complete chat logs.",
  "你主动发送的 Agent/故事消息与模型回复会在 GAME 服务端使用 AES-256-GCM 加密存档，供授权管理员排查服务与处理用户支持；管理员读取会写入审计日志。": "Agent and story messages you actively send, along with model responses, are stored with AES-256-GCM encryption. Authorized administrators may review them only for service troubleshooting and user support, and every review is logged.",
  "你发起 Agent 提问时，当前匿名档案会同步到自己的隔离知识库，供本次和后续提问检索；不同账户之间不能互相检索。": "When you submit an Agent question, your current anonymous profiles sync to your isolated knowledge base for this and future questions. Accounts can never retrieve one another's data.",
  "DeepSeek 作为外部模型提供方会接收你明确发送的文字；其处理受相应服务政策约束。": "DeepSeek, the external model provider, receives only the text you explicitly send and processes it under its own service policies.",
  "你可以随时撤回。撤回后新的 Agent 请求会被服务端拒绝，并清空服务器个人知识库；本地日记不受影响。": "You can withdraw consent at any time. New Agent requests will be blocked and your server-side knowledge base will be cleared; your local journal will remain unchanged.",
  "我已阅读并同意：发起 Agent 或故事对话时，将我主动发送的文字与模型回复加密存档，并将当前匿名档案同步到账号专属知识库、交给 DeepSeek 处理。": "I understand and agree that when I start an Agent or story conversation, text I send and model responses will be stored encrypted, and my current anonymous profiles will sync to my private knowledge base for DeepSeek processing.",
  "账户已创建并安全登录": "Account created. You're signed in securely.",
  "AI 调用额度": "AI call allowance",
  "外部 AI 处理同意已记录": "AI data-processing consent saved.",
  "账户与 Agent 授权状态已刷新": "Account and Agent access refreshed.",
  "同意并继续": "Agree & Continue",
  "账户已准备，": "Your account is ready,",
  "Agent 尚未开放。": "but Agent access is currently paused.",
  "管理员需要同时启用全局 Agent 服务、有效会员资格与此账户的单独授权。当前状态不会影响本地关系记录。": "Your included AI calls have been used, or the service is currently unavailable. An administrator can enable ongoing Agent access. Your local journal is not affected.",
  "会员状态": "Membership",
  "外部 AI 同意": "External AI consent",
  "已确认，可随时撤回。": "Accepted · You can withdraw anytime.",
  "刷新授权": "Refresh Access",
  "撤回外部 AI 同意": "Withdraw AI Consent",
  "把不确定写成": "Turn uncertainty into",
  "可以讨论的问题。": "a question you can explore.",
  "登录本身不会上传档案；同意外部 AI 并发起 Agent 提问后，匿名档案才会同步到账号专属空间。": "Signing in does not upload your profiles. After you accept the AI data notice and submit an Agent question, anonymous profiles are synced only to your private account space.",
  "当前以纯静态方式打开，账号服务不可用；本地记录功能仍可正常使用。请通过 Node 服务启动后再登录。": "Account services are unavailable in this static preview. Local journaling still works. Start the Node service to sign in.",
  "已有账户": "Already have an account",
  "创建账户": "Create an account",
  "从一页空白开始": "Start with a blank page",
  "密码": "Password",
  "至少 12 个字符；密码只提交给同源服务。": "At least 12 characters. Your password is sent only to this site.",
  "两个空间，清楚分开。": "Two spaces, clearly separated.",
  "本地日记": "Local journal",
  "匿名档案、事件、分析和复盘保留在浏览器里。": "Anonymous profiles, events, analysis, and reviews stay in your browser.",
  "显式 Agent 对话": "Messages you explicitly send",
  "只有你按下发送的内容才进入模型请求；消息与回复会加密存档，并可由授权管理员审计查看。": "Only content you actively send enters a model request. Messages and responses are stored encrypted and may be reviewed by authorized administrators.",
  "未读取会员状态": "Membership unavailable",
  "普通账户": "Free account",
  "有效": "Active",
  "弱信号": "Weak signal",
  "中等信号": "Moderate signal",
  "强信号": "Strong signal",
  "停止推进": "Stop and respect the boundary",
  "信息质量有限": "Limited information",
  "不足": "Insufficient",
  "初步": "Early",
  "充分": "Substantial",
  "仍不确定，信息不足": "Still uncertain · Not enough information",
  "持续观察": "Keep observing",
  "等待真实反馈": "Wait for direct feedback",
  "直接沟通确认": "Ask directly",
  "尊重边界并停止": "Respect the boundary and stop",
  "刚认识": "Just met",
  "第一次见面": "First meeting",
  "约会中": "Dating",
  "持续了解": "Getting to know each other",
  "稳定交往": "In a relationship",
  "关系降温": "Growing distant",
  "关系结束": "Relationship ended",
  "尚无互动": "No interactions yet",
  "尚未明确": "Not yet clear",
  "日期未知": "Date unknown",
  "未命名场景": "Untitled moment",
  "档案完整度": "Profile completeness",
  "对象卡片": "Profile Cards",
  "个匿名对象": "anonymous profiles",
  "背景、目标、边界和互动记录会在故事结束后归档成匿名卡片，随时可以修正。": "Background, goals, boundaries, and interactions become an anonymous profile you can revise anytime.",
  "在“开始记录”里结束一段故事，AI 会自动建立匿名档案。": "Finish a story in Tell Your Story and AI will create an anonymous profile.",
  "这次回应没有完成，请稍后重试。": "The response was interrupted. Please try again.",
  "生成已由你停止。": "You stopped the response.",
  "你的 50 次试用额度已用完，请联系管理员开通 Agent 权限。": "You've used all 50 included AI calls. Ask an administrator to enable ongoing Agent access.",
};

function translateDOM(root, locale) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      // Skip script/style, inputs, and textareas
      const tag = n.parentElement?.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "INPUT" || tag === "TEXTAREA") return NodeFilter.FILTER_REJECT;
      if (
        n.parentElement?.closest(
          "[data-user-content], .story-bubble p, .agent-message p, .event-copy p, .contact-card h2"
        )
      ) {
        return NodeFilter.FILTER_REJECT;
      }
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

  for (const element of root.querySelectorAll?.("[placeholder], [aria-label], [title]") || []) {
    for (const attribute of ["placeholder", "aria-label", "title"]) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const translated = translateText(value, entries);
      if (translated !== value) element.setAttribute(attribute, translated);
    }
  }
}

function translateText(value, entries) {
  const exact = EN_PHRASES[value.trim()];
  if (exact) return value.replace(value.trim(), exact);
  let translated = value;
  for (const [zh, en] of entries) translated = translated.replaceAll(zh, en);
  return translated;
}

let observer;
function watchDynamicEnglishUI() {
  observer?.disconnect();
  if (detectLocale() !== "en" || !document.body) return;
  observer = new MutationObserver((mutations) => {
    observer.disconnect();
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) translateDOM(node.parentElement || document.body, "en");
        if (node.nodeType === Node.ELEMENT_NODE) translateDOM(node, "en");
      }
      if (mutation.type === "characterData" && mutation.target.parentElement) {
        translateDOM(mutation.target.parentElement, "en");
      }
    }
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", watchDynamicEnglishUI, { once: true });
} else {
  watchDynamicEnglishUI();
}
