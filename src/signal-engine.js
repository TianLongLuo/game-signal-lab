export const ENGINE_VERSION = "2.0.0";

export const SIGNAL_NAMES = Object.freeze([
  "directInterest",
  "futurePlan",
  "repeatedInitiative",
  "detailedFollowup",
  "politeOnly",
  "delayAvoidance",
  "explicitDecline",
  "discomfort",
]);

export const BOUNDARY_STATUSES = Object.freeze(["clear", "uncertain", "stop"]);
export const REVIEW_OUTCOMES = Object.freeze([
  "unknown",
  "continued",
  "declined",
  "discomfort",
  "avoidance",
]);

const POSITIVE_SIGNALS = Object.freeze([
  "directInterest",
  "futurePlan",
  "repeatedInitiative",
  "detailedFollowup",
]);

const WEIGHTS = Object.freeze({
  directInterest: 5,
  futurePlan: 3,
  repeatedInitiative: 2,
  detailedFollowup: 1,
});

const EVIDENCE_REASONS = Object.freeze({
  directInterest: "对方有明确表达；这是最强的一类证据，但仍以当下、持续的双方意愿为准。",
  futurePlan: "对方提出了具体的未来互动安排，说明存在现实投入。",
  repeatedInitiative: "主动联系或投入多次出现，比单次礼貌更值得观察。",
  detailedFollowup: "对方记得细节并继续追问，但这也可能来自其一贯的细心与社交方式。",
  politeOnly: "目前只确认到普通礼貌，没有超出常规社交的持续投入。",
  delayAvoidance: "存在持续回避或多次失约且无替代安排；行动策略必须降级。",
  explicitDecline: "存在明确拒绝；该边界不可被任何积极信号覆盖。",
  discomfort: "存在不舒服或要求停止；该边界不可被任何积极信号覆盖。",
});

const NO_CONTACT_PATTERN =
  /不要(?:再)?联系|别(?:再)?联系|请勿联系|不想(?:再|继续)?联系|停止联系|不再联系|不要(?:再)?找我|别(?:再)?找我|不要(?:再)?给我发/;
const DISCOMFORT_PATTERN =
  /感到不舒服|让我不舒服|表达不舒服|别碰我|不要碰我|不要靠近|超过.{0,6}边界/;
const DECLINE_PATTERN =
  /不想(?:继续|见面|认识|约会)|没有兴趣|不感兴趣|明确拒绝|要求停止|不要(?:再)?推进/;

export function normalizeBoundaryStatus(value, signals = []) {
  if (BOUNDARY_STATUSES.includes(value)) return value;
  if (signals.some((signal) => signal === "explicitDecline" || signal === "discomfort")) return "stop";
  if (signals.includes("delayAvoidance")) return "uncertain";
  return "clear";
}

export function validateEventInput(item) {
  const signals = normalizeSignals(item?.signals);
  const issues = [];
  const hasPositive = signals.some((signal) => POSITIVE_SIGNALS.includes(signal));

  if (!BOUNDARY_STATUSES.includes(item?.boundaryStatus)) {
    issues.push("请先确认是否存在明确拒绝、不舒服或边界风险。");
  }

  if (signals.includes("politeOnly") && hasPositive) {
    issues.push("“只有普通礼貌”不能与明确兴趣、未来安排或持续投入同时选择。");
  }

  if (
    item?.boundaryStatus === "clear" &&
    signals.some((signal) => signal === "explicitDecline" || signal === "discomfort")
  ) {
    issues.push("已勾选拒绝或不舒服信号，请把边界状态改为“停止推进”。");
  }

  if (item?.boundaryStatus === "clear" && classifyBoundaryLanguage(item?.fact)) {
    issues.push("事实文字中可能包含拒绝、停止联系或不舒服表达，请重新确认边界状态。");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function validateReviewInput(review) {
  const issues = [];
  const boundaryReason = classifyBoundaryLanguage(review?.result);
  const outcome = REVIEW_OUTCOMES.includes(review?.outcome) ? review.outcome : "";

  if (!outcome) {
    issues.push("请选择最符合真实反馈的边界信号。");
  }

  if (boundaryReason && outcome !== "declined" && outcome !== "discomfort") {
    issues.push("真实回应中包含拒绝、停止联系或不舒服表达，请把边界信号改为拒绝或不舒服。");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function classifyBoundaryLanguage(value) {
  const text = String(value || "");
  if (NO_CONTACT_PATTERN.test(text)) return "no_contact";
  if (DISCOMFORT_PATTERN.test(text)) return "discomfort";
  if (DECLINE_PATTERN.test(text)) return "decline";
  return "";
}

export function analyzeEvent(item, context = {}) {
  const signals = normalizeSignals(item?.signals);
  const outcome = REVIEW_OUTCOMES.includes(item?.review?.outcome) ? item.review.outcome : "unknown";
  const boundaryStatus = normalizeBoundaryStatus(item?.boundaryStatus, signals);
  const textBoundaries = {
    fact: classifyBoundaryLanguage(item?.fact),
    review: classifyBoundaryLanguage(item?.review?.result),
    contact: classifyBoundaryLanguage(context.contactBoundary),
  };
  const hasTextBoundary = Object.values(textBoundaries).some(Boolean);
  const hasHardStop =
    boundaryStatus === "stop" ||
    hasTextBoundary ||
    signals.includes("explicitDecline") ||
    signals.includes("discomfort") ||
    outcome === "declined" ||
    outcome === "discomfort";
  const hasAvoidance = signals.includes("delayAvoidance") || outcome === "avoidance";
  const hasConflict = signals.includes("politeOnly") && signals.some((signal) => POSITIVE_SIGNALS.includes(signal));
  const stopReason = resolveStopReason({
    signals,
    outcome,
    boundaryStatus,
    textBoundaries,
  });

  const score = signals.reduce((total, signal) => total + (WEIGHTS[signal] || 0), 0);
  const positiveCount = signals.filter((signal) => POSITIVE_SIGNALS.includes(signal)).length;

  let evidenceLevel = "weak";
  if (score >= 7 && positiveCount >= 2) evidenceLevel = "strong";
  else if (score >= 3 && positiveCount >= 1) evidenceLevel = "medium";

  let actionPolicy = evidenceLevel === "weak" ? "observe" : "engage";
  if (boundaryStatus === "uncertain" || hasAvoidance || hasConflict) actionPolicy = "deescalate";
  if (hasHardStop) actionPolicy = "stop";

  if (
    evidenceLevel === "strong" &&
    (boundaryStatus === "uncertain" || hasAvoidance || hasConflict)
  ) {
    evidenceLevel = "medium";
  }

  const strength = actionPolicy === "stop" ? "stop" : evidenceLevel;
  const evidenceReasons = buildEvidenceReasons(signals, boundaryStatus, outcome, textBoundaries);
  const alternatives = buildAlternatives(signals, actionPolicy);
  const uncertainties = buildUncertainties(signals, actionPolicy);
  const personalNotes = buildPersonalNotes(context);
  const responseMode = actionPolicy === "stop" && stopReason === "no_contact" ? "action" : "message";

  return {
    engineVersion: ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    score,
    strength,
    evidenceLevel,
    actionPolicy,
    stopReason,
    responseMode,
    boundaryStatus,
    informationQuality: informationQuality(item, signals),
    evidenceReasons,
    summary: buildSummary(evidenceLevel, actionPolicy, outcome, stopReason),
    alternatives,
    uncertainties,
    personalNotes,
    responses: buildResponses(evidenceLevel, actionPolicy, context.voice, stopReason),
    stopCondition: buildStopCondition(actionPolicy, stopReason),
  };
}

function normalizeSignals(signals) {
  if (!Array.isArray(signals)) return [];
  return [...new Set(signals.filter((signal) => SIGNAL_NAMES.includes(signal)))];
}

function resolveStopReason({ signals, outcome, boundaryStatus, textBoundaries }) {
  const textReasons = Object.values(textBoundaries);
  if (textReasons.includes("no_contact")) return "no_contact";
  if (
    textReasons.includes("discomfort") ||
    signals.includes("discomfort") ||
    outcome === "discomfort"
  ) {
    return "discomfort";
  }
  if (
    textReasons.includes("decline") ||
    signals.includes("explicitDecline") ||
    outcome === "declined"
  ) {
    return "decline";
  }
  if (boundaryStatus === "stop") return "boundary";
  return "";
}

function buildEvidenceReasons(signals, boundaryStatus, outcome, textBoundaries) {
  const reasons = signals.map((signal) => EVIDENCE_REASONS[signal]).filter(Boolean);

  const textReasons = [];
  if (textBoundaries.fact) {
    textReasons.push("事实文字包含明确拒绝、停止联系或不舒服表达，系统按停止条件处理；请人工核对原话。");
  }
  if (textBoundaries.review) {
    textReasons.push("后续真实回应的文字包含拒绝、停止联系或不舒服表达，优先级高于所选标签和原始判断。");
  }
  if (textBoundaries.contact) {
    textReasons.push("关系档案中已保存明确拒绝、停止联系或不舒服边界，系统不会再输出推进建议。");
  }
  reasons.unshift(...textReasons);
  if (!signals.length) {
    reasons.push("尚未选择可确认的行为证据，因此当前只能按信息不足处理。");
  }
  if (boundaryStatus === "uncertain" && !signals.includes("delayAvoidance")) {
    reasons.unshift("你对边界状态仍不确定；在澄清之前，系统不会建议提高推进强度。");
  }
  if (boundaryStatus === "stop" && !signals.includes("explicitDecline") && !signals.includes("discomfort")) {
    reasons.unshift("你已确认存在明确边界，系统将其作为不可被覆盖的停止条件。");
  }
  if (outcome === "declined" || outcome === "discomfort") {
    reasons.unshift("后续真实反馈已经出现明确拒绝或不舒服，优先级高于原始信号判断。");
  }
  if (outcome === "avoidance") {
    reasons.unshift("后续真实反馈是持续无回应或回避，当前行动策略已降级。");
  }

  return reasons.slice(0, 5);
}

function informationQuality(item, signals) {
  let points = 0;
  if (String(item?.fact || "").trim().length >= 30) points += 1;
  if (String(item?.interpretation || "").trim().length >= 10) points += 1;
  if (signals.length >= 2) points += 1;
  if (BOUNDARY_STATUSES.includes(item?.boundaryStatus)) points += 1;

  if (points >= 4) return "较完整";
  if (points >= 2) return "基本完整";
  return "有限";
}

function buildSummary(evidenceLevel, actionPolicy, outcome, stopReason) {
  if (actionPolicy === "stop") {
    if (stopReason === "no_contact") {
      return "记录中存在明确的停止联系要求。不要再发送解释、道歉或告别消息，也不要通过其他账号、朋友或线下出现绕过该边界。";
    }
    if (outcome === "declined" || outcome === "discomfort") {
      return "后续真实反馈已经给出拒绝或不舒服信号。当前结论由真实反馈修正为停止推进，不再使用原来的积极推断。";
    }
    return "记录包含明确拒绝、不舒服或停止要求。该边界不能被其他积极信号抵消；最安全的行动是尊重表达并停止推进。";
  }
  if (actionPolicy === "deescalate") {
    return "记录里存在持续回避、边界不确定或相互冲突的证据。此时不应继续增加邀请和追问，更适合降低互动强度并等待清楚、主动的反馈。";
  }
  if (evidenceLevel === "strong") {
    return "记录中出现了明确表达与多个一致、持续的投入信号。即便如此，关系意愿仍应由双方清楚沟通和持续反馈确认。";
  }
  if (evidenceLevel === "medium") {
    return "记录中出现了主动联系、未来安排或持续投入等证据，但仍不能替代明确表达。可以自然回应，并给对方充分的选择空间。";
  }
  return "目前证据更接近普通礼貌、单次行为或信息不足。不要把希望或担忧当成结论；更适合继续观察，避免反复试探。";
}

function buildAlternatives(signals, actionPolicy) {
  if (actionPolicy === "stop") {
    return [
      "对方的明确表达本身已经足够，不需要寻找隐藏的相反含义。",
      "拒绝可能来自匹配度、时机、精力或个人选择；不等同于对你整体价值的评价。",
      "继续说服不会让信号更清楚，只会增加对方压力。",
    ];
  }

  const options = [];
  if (signals.includes("futurePlan")) {
    options.push("未来安排可能代表兴趣，也可能是友好、合作或群体活动中的自然安排。");
  }
  if (signals.includes("repeatedInitiative")) {
    options.push("持续主动值得观察，但仍需结合内容、场景以及对方平时对其他人的方式。");
  }
  if (signals.includes("detailedFollowup")) {
    options.push("记得细节可能说明关注，也可能来自对方本身细心或善于社交。");
  }
  if (signals.includes("politeOnly") || !signals.length) {
    options.push("当前行为可能只是普通礼貌，暂时没有足够证据区分友好与特别兴趣。");
  }
  if (signals.includes("delayAvoidance") || actionPolicy === "deescalate") {
    options.push("推迟可能来自忙碌；如果反复发生且没有替代安排，也可能表示投入意愿有限。");
  }

  const defaults = [
    "单次互动容易受到当天状态、场景和沟通习惯影响。",
    "你的期待或焦虑可能会放大某些细节，同时忽略其他证据。",
    "最准确的信息通常来自对方后续持续行为与明确表达。",
  ];

  return [...options, ...defaults].slice(0, 3);
}

function buildUncertainties(signals, actionPolicy) {
  const items = [];
  if (signals.length < 2) items.push("目前证据点较少，无法判断是否形成持续模式。");
  if (!signals.includes("directInterest") && actionPolicy !== "stop") {
    items.push("对方尚未明确表达关系兴趣，现阶段仍是推断。");
  }
  if (!signals.includes("futurePlan") && actionPolicy !== "stop") {
    items.push("尚未看到具体的下一次互动安排或现实投入。");
  }
  if (signals.includes("delayAvoidance")) {
    items.push("需要区分一次客观冲突与持续回避；是否主动提供替代安排很重要。");
  }
  if (actionPolicy === "stop") {
    items.push("对方的边界不需要通过更多分析才能生效。");
  }
  items.push("记录只包含你的视角，无法覆盖对方未表达的想法和处境。");
  return items.slice(0, 3);
}

function buildPersonalNotes(context) {
  const notes = [];
  if (context.goal) notes.push(`当前目标：${String(context.goal).trim()}`);
  if (context.anxiety) notes.push(`留意焦虑触发点是否放大了解读：${String(context.anxiety).trim()}`);
  if (context.boundaries) notes.push(`行动前对照你希望坚持的边界：${String(context.boundaries).trim()}`);
  if (context.contactBoundary) notes.push(`对方已明确的边界：${String(context.contactBoundary).trim()}`);
  return notes.slice(0, 4);
}

function buildResponses(evidenceLevel, actionPolicy, voice = "natural", stopReason = "") {
  if (actionPolicy === "stop") {
    if (stopReason === "no_contact") {
      return [
        "不发送新的解释、道歉或告别消息；立即停止联系。",
        "不通过其他账号、朋友、群聊或线下出现来绕过该边界。",
        "删除待发送内容，把注意力转向自己的情绪调节与现实支持。",
      ];
    }
    return [
      "收到，谢谢你直接告诉我。我会尊重你的决定，之后不再推进。",
      "我明白了，也谢谢你说清楚。祝你之后一切顺利。",
      "了解，我会尊重这个边界。保重。",
    ];
  }

  if (actionPolicy === "deescalate") {
    const sets = {
      natural: [
        "看起来最近不太方便，我先不继续约了。之后如果你想联系，可以再找我。",
        "收到，我先给彼此一点空间，不用急着回复。",
        "我不想让你有压力，所以先停在这里；你不需要解释。",
      ],
      gentle: [
        "感觉你最近可能需要一些空间，我先不继续打扰。照顾好自己。",
        "不用急着回应，我会尊重你的节奏，也先停下后续邀请。",
        "谢谢你目前的回应。我先退一步，让事情保持轻松。",
      ],
      direct: [
        "我注意到几次安排都没有继续，我先停止邀请。你之后若有明确意愿，可以直接联系我。",
        "目前信息不够清楚，我不会继续推进。",
        "我先停在这里，避免给你压力。",
      ],
      humor: [
        "我先把“续集申请”收起来，不催更。之后你想聊再找我。",
        "读心术依旧没上线，所以我选择先退一步，不继续猜。",
        "这回合先暂停，不追问，也不给你压力。",
      ],
    };
    return sets[voice] || sets.natural;
  }

  if (evidenceLevel === "weak") {
    const sets = {
      natural: [
        "谢谢你刚才的分享。先不用急着定义什么，我们按自然的节奏聊就好。",
        "我不想靠猜，所以先继续观察；如果合适，我会用一次低压力的方式直接确认。",
        "这次我先不追加邀请，等双方都有更清楚的投入再决定下一步。",
      ],
      gentle: [
        "谢谢你愿意交流，我们先按舒服的节奏慢慢了解，不急着下结论。",
        "我会先把期待放轻一点，留意后续真实反馈。",
        "现在还不够清楚，我先尊重彼此的空间。",
      ],
      direct: [
        "目前证据不足，我先不把礼貌当成兴趣。",
        "我会等更清楚、持续的反馈，再决定是否邀请。",
        "如果之后需要确认，我只会直接问一次，并尊重任何答案。",
      ],
      humor: [
        "证据还没集齐，先不让脑内编剧开拍。",
        "读心术没上线，我先观察真实反馈。",
        "这次先不申请续集，等剧情自己更清楚一点。",
      ],
    };
    return sets[voice] || sets.natural;
  }

  const sets = {
    natural: [
      "刚才和你聊天挺舒服的。如果你也愿意，我们下周可以再找个时间见面；不方便也没关系。",
      "我想继续了解你。你有兴趣的话，我们可以挑个轻松的活动再见一次。",
      "我不太想靠猜，所以直接问一下：你愿意继续认识看看吗？任何答案都可以。",
    ],
    gentle: [
      "谢谢你今天愿意分享这些，我觉得相处很舒服。如果你也愿意，我们可以慢慢继续了解。",
      "我有一点想再见你的期待，不过你按自己的节奏来就好。",
      "我不确定自己有没有理解对，所以想轻轻确认一下：你会愿意继续认识看看吗？",
    ],
    direct: [
      "我对你有兴趣，想继续了解。你愿意的话，我们约下周再见；如果不想也可以直接告诉我。",
      "我想邀请你周末见面。你愿意就一起，不方便或没兴趣也没关系。",
      "我不想继续猜：你有继续了解的意愿吗？我会尊重你的答案。",
    ],
    humor: [
      "这次聊天我给了高分，但不替你评分。你愿意的话，我们下周再见？",
      "我想申请一次续集：找个轻松的地方再见面。没空或不想都可以直接说。",
      "我的读心术显然没上线，所以直接问：你愿意继续认识看看吗？",
    ],
  };
  return sets[voice] || sets.natural;
}

function buildStopCondition(actionPolicy, stopReason = "") {
  if (actionPolicy === "stop") {
    if (stopReason === "no_contact") {
      return "对方已经要求停止联系：不再发送任何新消息，不换账号、不借他人转达，也不在线下出现来继续推进。";
    }
    return "明确拒绝、要求停止或表达不舒服时，不需要等待更多证据。停止联系、试探、说服或借他人施压。";
  }
  if (actionPolicy === "deescalate") {
    return "当前应降低互动强度。除非对方之后主动给出清楚、持续的意愿，否则不要重复邀请或追问。";
  }
  return "一旦对方明确拒绝、持续回避、表现不舒服或要求停止，应立即降低互动强度或停止推进。";
}
