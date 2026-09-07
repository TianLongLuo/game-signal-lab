import {
  BOUNDARY_STATUSES,
  REVIEW_OUTCOMES,
  SIGNAL_NAMES,
  normalizeBoundaryStatus,
} from "./signal-engine.js";

export const STATE_VERSION = 2;
export const AGE_POLICY_VERSION = "2026-07-30";
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

const VOICES = new Set(["natural", "gentle", "direct", "humor"]);
export const MAX_CONTACTS = 500;
export const MAX_EVENTS = 5000;

export function createDefaultState() {
  return {
    version: STATE_VERSION,
    adultConfirmed: false,
    adultConfirmedAt: "",
    agePolicyVersion: "",
    profile: {
      name: "",
      goal: "",
      voice: "natural",
      boundaries: "",
      anxiety: "",
    },
    contacts: [],
    events: [],
  };
}

export function normalizeState(input) {
  const defaults = createDefaultState();
  if (!isObject(input)) return defaults;

  const profileInput = isObject(input.profile) ? input.profile : {};
  const profile = {
    name: text(profileInput.name, 40),
    goal: text(profileInput.goal, 1000),
    voice: VOICES.has(profileInput.voice) ? profileInput.voice : "natural",
    boundaries: text(profileInput.boundaries, 1000),
    anxiety: text(profileInput.anxiety, 1000),
  };

  const { contacts, contactIdMap } = normalizeContacts(input.contacts);
  const knownContactIds = new Set(contacts.map((contact) => contact.id));
  const events = normalizeEvents(input.events, knownContactIds, contactIdMap);

  return {
    version: STATE_VERSION,
    adultConfirmed: input.adultConfirmed === true,
    adultConfirmedAt: isoDateTime(input.adultConfirmedAt),
    agePolicyVersion: text(input.agePolicyVersion, 40),
    profile,
    contacts,
    events,
  };
}

export function toPortableState(input) {
  return normalizeState(input);
}

export function inspectStoredState(input) {
  if (!isObject(input) || !Array.isArray(input.contacts) || !Array.isArray(input.events)) {
    return {
      safe: false,
      reason: "unreadable",
      message: "本地数据缺少完整的档案或事件列表。",
    };
  }
  if (Number.isFinite(input.version) && input.version > STATE_VERSION) {
    return {
      safe: false,
      reason: "future",
      message: "本地数据来自更新版本。",
    };
  }

  try {
    assertBackupLimits(input);
    const normalized = normalizeState(input);
    if (
      normalized.contacts.length !== input.contacts.length ||
      normalized.events.length !== input.events.length
    ) {
      return {
        safe: false,
        reason: "lossy",
        message: "自动迁移会丢弃部分档案或事件。",
      };
    }
    return { safe: true, reason: "", message: "", state: normalized };
  } catch (error) {
    const message = error instanceof Error ? error.message : "本地数据无法安全迁移。";
    return {
      safe: false,
      reason: /超过 \d+ 个/.test(message) ? "capacity" : "lossy",
      message,
    };
  }
}

export function parseBackup(textContent) {
  const source = String(textContent);
  if (new TextEncoder().encode(source).byteLength > MAX_BACKUP_BYTES) {
    throw new Error("备份文件超过 20 MB，已取消导入。");
  }

  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("文件不是有效的 JSON。");
  }

  const candidate = isObject(parsed?.data) ? parsed.data : parsed;
  if (!isObject(candidate)) throw new Error("备份中没有可识别的数据对象。");
  if (Number.isFinite(candidate.version) && candidate.version > STATE_VERSION) {
    throw new Error("备份来自更新版本的 GAME Signal Lab；请升级应用后再导入，当前数据未被替换。");
  }
  assertBackupLimits(candidate);

  const normalized = normalizeState(candidate);
  if (
    (Array.isArray(candidate.contacts) && normalized.contacts.length !== candidate.contacts.length) ||
    (Array.isArray(candidate.events) && normalized.events.length !== candidate.events.length)
  ) {
    throw new Error("备份包含缺失必填字段、重复 ID 或无效记录；为避免静默丢失，未执行导入。");
  }
  if (!normalized.contacts.length && !normalized.events.length && !hasProfileContent(normalized.profile)) {
    throw new Error("备份中没有可导入的档案、事件或个人设置。");
  }
  return normalized;
}

function assertBackupLimits(candidate) {
  const strictCurrent = candidate.version === STATE_VERSION;
  if ("contacts" in candidate && !Array.isArray(candidate.contacts)) {
    throw new Error("备份中的 contacts 必须是数组。");
  }
  if ("events" in candidate && !Array.isArray(candidate.events)) {
    throw new Error("备份中的 events 必须是数组。");
  }
  if (candidate.contacts?.length > MAX_CONTACTS) {
    throw new Error(`备份包含超过 ${MAX_CONTACTS} 个档案，未执行导入。`);
  }
  if (candidate.events?.length > MAX_EVENTS) {
    throw new Error(`备份包含超过 ${MAX_EVENTS} 条事件，未执行导入。`);
  }

  assertObjectTextLimits(candidate, "state", {
    adultConfirmedAt: 40,
    agePolicyVersion: 40,
  });
  assertOptionalDateTime(candidate.adultConfirmedAt, "state.adultConfirmedAt");
  assertObjectTextLimits(candidate.profile, "profile", {
    name: 40,
    goal: 1000,
    boundaries: 1000,
    anxiety: 1000,
  });
  if (
    strictCurrent &&
    candidate.profile?.voice !== undefined &&
    !VOICES.has(candidate.profile.voice)
  ) {
    throw new Error("备份字段 profile.voice 不是受支持的枚举值，未执行导入。");
  }

  const aliases = new Set();
  const contactIds = new Set();
  candidate.contacts?.forEach((contact, index) => {
    assertObjectTextLimits(contact, `contacts[${index}]`, {
      id: 120,
      alias: 40,
      stage: 40,
      context: 1200,
      goal: 600,
      boundary: 600,
      createdAt: 40,
    });
    assertOptionalDateTime(contact?.createdAt, `contacts[${index}].createdAt`);
    if (strictCurrent) {
      if (!isSafeId(contact?.id)) {
        throw new Error(`备份字段 contacts[${index}].id 无效，未执行导入。`);
      }
      if (contactIds.has(contact.id)) {
        throw new Error(`备份包含重复的档案 ID“${contact.id}”，未执行导入。`);
      }
      contactIds.add(contact.id);
    }
    const aliasKey =
      typeof contact?.alias === "string"
        ? contact.alias.trim().toLocaleLowerCase("zh-CN")
        : "";
    if (aliasKey && aliases.has(aliasKey) && strictCurrent) {
      throw new Error(`备份包含重复的匿名代号“${contact.alias.trim()}”，未执行导入。`);
    }
    if (aliasKey) aliases.add(aliasKey);
  });

  const eventIds = new Set();
  candidate.events?.forEach((event, index) => {
    assertObjectTextLimits(event, `events[${index}]`, {
      id: 120,
      contactId: 120,
      stage: 40,
      scene: 300,
      fact: 3000,
      interpretation: 1500,
      feeling: 300,
      reply: 600,
      createdAt: 40,
    });
    assertOptionalDate(event?.date, `events[${index}].date`);
    assertOptionalDateTime(event?.createdAt, `events[${index}].createdAt`);
    if (strictCurrent) {
      if (!isSafeId(event?.id)) {
        throw new Error(`备份字段 events[${index}].id 无效，未执行导入。`);
      }
      if (eventIds.has(event.id)) {
        throw new Error(`备份包含重复的事件 ID“${event.id}”，未执行导入。`);
      }
      eventIds.add(event.id);
      if (!isSafeId(event?.contactId) || !contactIds.has(event.contactId)) {
        throw new Error(`备份字段 events[${index}].contactId 没有对应档案，未执行导入。`);
      }
      if (
        !Array.isArray(event.signals) ||
        event.signals.some((signal) => !SIGNAL_NAMES.includes(signal))
      ) {
        throw new Error(`备份字段 events[${index}].signals 包含无效枚举，未执行导入。`);
      }
      if (!BOUNDARY_STATUSES.includes(event.boundaryStatus)) {
        throw new Error(`备份字段 events[${index}].boundaryStatus 无效，未执行导入。`);
      }
      if (isObject(event.review) && !REVIEW_OUTCOMES.includes(event.review.outcome)) {
        throw new Error(`备份字段 events[${index}].review.outcome 无效，未执行导入。`);
      }
    }
    assertObjectTextLimits(event?.review, `events[${index}].review`, {
      actionTaken: 1200,
      result: 2000,
      learning: 1200,
      naturalness: 40,
      nextStep: 40,
      updatedAt: 40,
    });
    assertOptionalDateTime(event?.review?.updatedAt, `events[${index}].review.updatedAt`);
  });
}

function assertObjectTextLimits(value, path, limits) {
  if (value == null) return;
  if (!isObject(value)) throw new Error(`备份中的 ${path} 必须是对象。`);

  for (const [field, maxLength] of Object.entries(limits)) {
    if (typeof value[field] === "string" && value[field].length > maxLength) {
      throw new Error(`备份字段 ${path}.${field} 超过 ${maxLength} 个字符，未执行导入。`);
    }
  }
}

function assertOptionalDate(value, path) {
  if (typeof value === "string" && value.trim() && !isoDate(value)) {
    throw new Error(`备份字段 ${path} 不是有效日期，未执行导入。`);
  }
}

function assertOptionalDateTime(value, path) {
  if (typeof value === "string" && value.trim() && !isoDateTime(value)) {
    throw new Error(`备份字段 ${path} 不是有效时间，未执行导入。`);
  }
}

function normalizeContacts(value) {
  if (!Array.isArray(value)) return { contacts: [], contactIdMap: new Map() };
  const seenIds = new Set();
  const seenAliases = new Set();
  const contactIdMap = new Map();

  const contacts = value.slice(0, MAX_CONTACTS).flatMap((item, index) => {
    if (!isObject(item)) return [];
    const rawId = text(item.id, 120);
    const id = safeId(rawId, `contact-${index + 1}`);
    if (seenIds.has(id)) return [];
    seenIds.add(id);
    if (rawId) contactIdMap.set(rawId, id);
    contactIdMap.set(id, id);

    const baseAlias = text(item.alias, 40);
    if (!baseAlias) return [];
    const alias = uniqueAlias(baseAlias, seenAliases);

    return [
      {
        id,
        alias,
        stage: text(item.stage, 40) || "刚认识",
        context: text(item.context, 1200),
        goal: text(item.goal, 600),
        boundary: text(item.boundary, 600),
        createdAt: isoDateTime(item.createdAt) || new Date(0).toISOString(),
      },
    ];
  });

  return { contacts, contactIdMap };
}

function uniqueAlias(baseAlias, seenAliases) {
  let candidate = baseAlias;
  let suffixNumber = 2;
  while (seenAliases.has(candidate.toLocaleLowerCase("zh-CN"))) {
    const suffix = ` (${suffixNumber})`;
    candidate = `${baseAlias.slice(0, Math.max(1, 40 - suffix.length))}${suffix}`;
    suffixNumber += 1;
  }
  seenAliases.add(candidate.toLocaleLowerCase("zh-CN"));
  return candidate;
}

function normalizeEvents(value, knownContactIds, contactIdMap) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();

  return value.slice(0, MAX_EVENTS).flatMap((item, index) => {
    if (!isObject(item)) return [];
    const id = safeId(item.id, `event-${index + 1}`);
    if (seen.has(id)) return [];
    seen.add(id);

    const rawContactId = text(item.contactId, 120);
    const contactId = contactIdMap.get(rawContactId) || safeId(rawContactId, "");
    const fact = text(item.fact, 3000);
    if (!fact) return [];

    const signals = Array.isArray(item.signals)
      ? [...new Set(item.signals.filter((signal) => SIGNAL_NAMES.includes(signal)))]
      : [];
    const boundaryStatus = BOUNDARY_STATUSES.includes(item.boundaryStatus)
      ? item.boundaryStatus
      : normalizeBoundaryStatus("", signals);

    return [
      {
        id,
        contactId: knownContactIds.has(contactId) ? contactId : "",
        date: isoDate(item.date),
        stage: text(item.stage, 40),
        scene: text(item.scene, 300),
        fact,
        interpretation: text(item.interpretation, 1500),
        feeling: text(item.feeling, 300),
        reply: text(item.reply, 600),
        signals,
        boundaryStatus,
        review: normalizeReview(item.review),
        createdAt: isoDateTime(item.createdAt) || new Date(0).toISOString(),
      },
    ];
  });
}

function normalizeReview(value) {
  if (!isObject(value)) return null;
  const outcome = REVIEW_OUTCOMES.includes(value.outcome) ? value.outcome : "unknown";
  const result = text(value.result, 2000);
  const actionTaken = text(value.actionTaken, 1200);
  const learning = text(value.learning, 1200);

  if (!result && !actionTaken && !learning && outcome === "unknown") return null;

  return {
    actionTaken,
    result,
    learning,
    naturalness: text(value.naturalness, 40),
    nextStep: text(value.nextStep, 40),
    outcome,
    updatedAt: isoDateTime(value.updatedAt),
  };
}

function hasProfileContent(profile) {
  return Boolean(profile.name || profile.goal || profile.boundaries || profile.anxiety);
}

function safeId(value, fallback) {
  const candidate = text(value, 120);
  if (!candidate) return fallback;
  return isSafeId(candidate) ? candidate : fallback;
}

function isSafeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,120}$/.test(value);
}

function isoDate(value) {
  const candidate = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return "";
  const date = new Date(`${candidate}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === candidate
    ? candidate
    : "";
}

function isoDateTime(value) {
  const candidate = text(value, 40);
  if (!candidate) return "";
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function text(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
