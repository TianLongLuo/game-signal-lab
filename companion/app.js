import { getScenePreset } from "/src/companion-scenes.js";
import {
  chooseStageScene,
  stageDialogue,
  atmosphereSvg,
  TypewriterText,
} from "/src/companion-stage.js";
import { PORTRAIT_PRESETS, getPortraitPreset } from "/src/companion-presets.js";
import { PlatformClient } from "/src/platform-client.js";
import {
  CompanionClient,
  VoiceDraftGuard,
  encodeWav,
  preserveVoiceTranscript,
  canLeaveCompanionView,
  resolveCompanionLocale,
  ImageRequestLedger,
} from "/src/companion-client.js";
const $ = (s) => document.querySelector(s),
  platform = new PlatformClient(),
  api = new CompanionClient(platform),
  guard = new VoiceDraftGuard(),
  imageRequests = new ImageRequestLedger(sessionStorage);
let locale = resolveCompanionLocale(
    location.pathname,
    localStorage.getItem("game-companion-locale"),
  ),
  tab = "together",
  account = null,
  state = null,
  draft = null,
  draftSceneTitles = [],
  draftAdultConfirmed = false,
  draftPortraitPresetId = null,
  worldPortraitPresetId = null,
  worldPortraitStoryId = null,
  characterAge = 25,
  imageEnqueueing = false,
  input = "",
  description = "",
  busy = false,
  streamText = "",
  turnAbort = null,
  retry = null,
  jobTimer = null,
  voice = null,
  voicePending = false,
  voiceAbort = null,
  polishAbort = null,
  typewriter = null,
  pendingPlayerText = "",
  responseDrawerOpen = false,
  reduceMotion =
    localStorage.getItem("game-companion-reduce-motion") === "true",
  voiceTimer = null,
  epoch = 0;
const copy = {
  together: ["相伴", "Together"],
  memories: ["回忆", "Memories"],
  world: ["世界", "World"],
  settings: ["设置", "Settings"],
  title: ["你希望遇见怎样的人？", "Who would you like to meet?"],
  intro: [
    "从一个想象开始。写下你心中的成年角色，一起续写只属于你们的故事。",
    "Begin with a person you imagine. Describe an adult character, then write a story together.",
  ],
  ai: ["AI 虚拟角色 · 虚构故事", "AI character · Fictional story"],
  describe: [
    "外貌、性格、生活的世界，或你们相遇的方式……",
    "Their appearance, personality, world, or how you first meet…",
  ],
  generate: ["生成可编辑设定", "Create editable character"],
  login: ["登录", "Sign in"],
  register: ["创建账号", "Create account"],
  send: ["发送", "Send"],
  record: ["录音", "Record"],
  stop: ["停止并转写", "Stop & transcribe"],
  cancel: ["取消", "Cancel"],
  save: ["保存", "Save"],
  delete: ["删除", "Delete"],
  edit: ["修改", "Edit"],
  name: ["名字", "Name"],
  age: ["年龄（18+）", "Age (18+)"],
  description: ["人物描述", "Character description"],
  appearance: ["外貌", "Appearance"],
  personality: ["性格与表达习惯", "Personality & manner"],
  worldLabel: ["生活的世界", "Their world"],
  opening: ["初遇简介", "First meeting"],
  confirm: ["确认设定，开始故事", "Confirm & begin"],
  review: ["认识一下，再决定", "Meet them before you begin"],
  adult: [
    "我确认自己及故事中的恋爱角色均已成年（18 岁以上）。",
    "I confirm I and all romantic characters are adults (18+).",
  ],
  voiceHint: [
    "录音仅在停止后转写；可修改文字，确认后自行发送。无语音播放。",
    "Recording is transcribed after you stop. Edit before sending. No voice playback.",
  ],
  placeholder: ["想对 TA 说些什么？", "What would you like to say?"],
  saved: ["已保存", "Saved"],
  history: ["你们的对话", "Your conversations"],
  shared: ["共同记忆", "Shared memories"],
  emptyMemory: [
    "还没有保留的记忆。从右侧对话中选择一句，留在这里。",
    "No saved memories yet. Save a moment from the conversation.",
  ],
  keep: ["留作记忆", "Save memory"],
  source: ["查看来源", "View source"],
  you: ["你", "You"],
  private: [
    "设定、对话和记忆保存在账号私有的服务端空间，不是仅保存在此设备。",
    "Character details, conversations and memories are saved privately on the server, not only on this device.",
  ],
  consentTitle: ["在故事开始之前", "Before your story begins"],
  consentText: [
    "为生成内容，你的设定和对话会交给外部文本服务；主动生成图片或转写录音时，相应内容会交给图像或语音供应商。旧版关系记录不会自动用作素材。你可以在设置中删除故事或撤回同意。",
    "Your character and messages are processed by external text services. Image prompts and voice recordings are sent to image or speech providers only when requested. Legacy relationship records are not used automatically. Delete your story or withdraw consent in Settings.",
  ],
  agree: [
    "我理解并同意以上处理方式",
    "I understand and agree to this processing",
  ],
  continue: ["同意并继续", "Agree & continue"],
  logout: ["退出登录", "Sign out"],
  legacy: ["原有关系记录", "Original relationship records"],
  withdraw: ["撤回生成服务同意", "Withdraw generation consent"],
  deleteStory: ["删除整个故事", "Delete entire story"],
  deleteWarning: [
    "删除人物、对话、记忆和私有素材引用？此操作不可撤销，后台素材清理可能稍后完成。",
    "Delete this character, conversations, memories and private asset references? This cannot be undone. Background asset cleanup may finish later.",
  ],
  images: ["人物与场景插画", "Character & scene illustrations"],
  imageOff: [
    "自定义图片生成尚未启用；仍可选择下方内置人物插画，文字故事也可继续。",
    "Custom image generation is not enabled. Built-in portraits below remain available, and your text story can continue.",
  ],
  imageQuota: ["剩余图片额度", "Images remaining"],
  portrait: ["生成人物插画", "Generate portrait"],
  scene: ["生成当前场景", "Generate current scene"],
  imageCost: [
    "本次生成使用 1 次图片额度，确认继续？",
    "This generation uses 1 image credit. Continue?",
  ],
  approveImage: ["确认使用这张插画", "Use this illustration"],
  locked: ["尚未解锁", "Not yet unlocked"],
  current: ["当前场景", "Current scene"],
  unlocked: ["已解锁", "Unlocked"],
  loading: ["正在加载故事…", "Loading your story…"],
  pending: ["正在续写…", "Writing the next moment…"],
  incomplete: [
    "回复未完成，输入已保留。点击发送可重试。",
    "Reply incomplete. Your draft is preserved; Send retries it.",
  ],
  transcribing: [
    "正在转写，可取消并继续编辑…",
    "Transcribing. You can cancel and edit…",
  ],
  timeout: [
    "转写等待已结束，原文字已保留。请重试录音。",
    "Transcription timed out. Your text is preserved; try recording again.",
  ],
  late: [
    "转写完成，但你已修改草稿；保留你的修改。",
    "Transcription finished after you edited. Your edits were preserved.",
  ],
  wait: [
    "已等待超过 60 秒，可以继续等待或取消。",
    "Waiting over 60 seconds. Keep waiting or cancel.",
  ],
  queued: ["排队中", "Queued"],
  running: ["生成中", "Generating"],
  succeeded: ["待确认", "Ready to review"],
  failed: [
    "生成失败，已确认图片不变",
    "Generation failed; approved art is unchanged",
  ],
  cancelled: ["已取消", "Cancelled"],
  refresh: ["刷新状态", "Refresh status"],
  disabled: [
    "此部署未启用伴侣模式。",
    "Companion mode is not enabled on this deployment.",
  ],
};
const t = (k) => copy[k]?.[locale === "en" ? 1 : 0] || k;
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const button = (key, id, cls = "") =>
  `<button ${id ? `id="${id}"` : ""} class="${cls}">${t(key)}</button>`;
function notify(message) {
  $("#notice").textContent = message;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => ($("#notice").textContent = ""), 7000);
}
const errors = {
  companion_busy: [
    "上一条回复仍在处理中，请稍后重试。",
    "A reply is still processing. Try again shortly.",
  ],
  version_conflict: [
    "故事已在另一处更新。请在设置中刷新状态，草稿会保留。",
    "The story changed elsewhere. Refresh in Settings; your draft is preserved.",
  ],
  stale_story: [
    "故事已更新。请在设置中刷新状态。",
    "The story changed. Refresh in Settings.",
  ],
  companion_consent_required: [
    "请先确认数据处理说明。",
    "Review and accept the data processing notice first.",
  ],
  external_ai_consent_required: [
    "请先确认外部 AI 数据处理说明。",
    "Accept the external AI processing notice first.",
  ],
  image_not_configured: [
    "图片服务尚未启用，可以继续文字故事。",
    "Image service is not enabled. Continue your text story.",
  ],
  image_quota_exhausted: [
    "图片额度已用完，已确认图片不受影响。",
    "No image credits remain. Approved art is unchanged.",
  ],
  image_job_active: [
    "已有图片正在生成，请等待或取消当前任务。",
    "An image is already processing. Wait or cancel it first.",
  ],
  image_queue_full: [
    "图片队列已满，请稍后重试。",
    "The image queue is full. Try again later.",
  ],
  image_provider_error: [
    "图片服务暂时失败，可稍后重新生成。",
    "The image service failed. Try generating again later.",
  ],
  invalid_character_draft: [
    "人物设定生成不完整，请重新生成。",
    "The character draft was incomplete. Generate it again.",
  ],
  invalid_text: [
    "文字为空或超出长度限制，请缩短后重试。",
    "Text is empty or too long. Shorten it and try again.",
  ],
  choice_not_available: [
    "这个选择已不适用，请刷新故事。",
    "That choice is no longer available. Refresh your story.",
  ],
  text_provider_error: [
    "文字服务暂时失败，输入已保留，可稍后重试。",
    "Text service failed. Your draft is preserved; try again later.",
  ],
  incomplete_provider_stream: [
    "回复未完整结束，输入已保留，可重试。",
    "The reply did not finish. Your draft is preserved; retry.",
  ],
  story_turn_limit: [
    "本篇对话已达到存储上限，可在回忆中回看。",
    "This story has reached its conversation limit. Review it in Memories.",
  ],
  memory_limit: [
    "记忆已达到上限，请先删除不需要的记忆。",
    "Memory storage is full. Remove an unwanted memory first.",
  ],
  adult_character_required: [
    "请填写并确认 18–100 岁的成年角色。",
    "Enter and confirm an adult character aged 18–100.",
  ],
  idempotency_conflict: [
    "请求状态发生冲突，请刷新状态后重试。",
    "Request state conflicted. Refresh before trying again.",
  ],
  agent_quota_exhausted: [
    "文字调用额度已用完。请查看账号额度。",
    "Your text allowance is exhausted. Check your account allowance.",
  ],
};
function error(e) {
  notify(
    e.name === "AbortError"
      ? t("incomplete")
      : errors[e.code]?.[locale === "en" ? 1 : 0] || e.message || String(e),
  );
}
function showModal(title, html) {
  $("#modal-title").textContent = title;
  $("#modal-content").innerHTML = html;
  if (!$("#modal").open) $("#modal").showModal();
}
$("#close-modal").onclick = () => $("#modal").close();
function syncLocale() {
  document.documentElement.lang = locale;
  document.title = `GAME Signal Lab · ${t("together")}`;
  document
    .querySelectorAll("[data-i18n]")
    .forEach((n) => (n.textContent = t(n.dataset.i18n)));
  $("#language").textContent = locale === "zh" ? "EN" : "中文";
}
$("#language").onclick = () => {
  if (
    !canLeaveCompanionView({
      busy,
      recording: voice || voicePending,
      transcribing: voiceAbort,
    })
  )
    return;
  locale = locale === "zh" ? "en" : "zh";
  localStorage.setItem("game-companion-locale", locale);
  syncLocale();
  render();
};
document.querySelectorAll("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      if (
        !canLeaveCompanionView({
          busy,
          recording: voice || voicePending,
          transcribing: voiceAbort,
        })
      ) {
        notify(t("pending"));
        return;
      }
      tab = b.dataset.tab;
      render();
    }),
);
$("#settings").onclick = () => {
  if (busy) {
    notify(t("pending"));
    return;
  }
  settings();
};
function render() {
  typewriter?.dispose();
  typewriter = null;
  cancelPolish();
  document.body.classList.toggle(
    "stage-active",
    Boolean(state?.story && tab === "together"),
  );
  document.body.classList.toggle("reduce-motion", reduceMotion);
  document.body.dataset.scene = String(state?.story?.scene ?? 0);
  syncLocale();
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  if (!state) {
    renderIntro();
    return;
  }
  if (!state.story) {
    draft ? renderDraft() : renderIntro();
    return;
  }
  if (tab === "together") renderTogether();
  else if (tab === "memories") renderMemories();
  else renderWorld();
}
function renderIntro() {
  $("#main").innerHTML =
    `<section class="intro"><h1>${t("title")}</h1><p>${t("intro")}</p><div class="intro-form"><label class="sr-only" for="description">${t("description")}</label><textarea id="description" maxlength="2500" placeholder="${t("describe")}">${esc(description)}</textarea><div class="hint-chips"><span>${t("appearance")}</span><span>${t("personality")}</span><span>${t("opening")}</span></div><div class="actions"><label style="width:115px">${t("age")}<input id="age" type="number" min="18" max="100" value="${esc(characterAge)}"></label>${button("generate", "generate", "primary")}${button("record", "record")}</div><div class="actions"><span id="voice-status" role="status"></span>${button("cancel", "cancel-voice")}</div><p class="fine">${t("voiceHint")}</p><p class="fine">${t("ai")}<br>${t("private")}</p></div></section>`;
  $("#age").oninput = (e) => {
    characterAge = e.target.value;
  };
  $("#cancel-voice").hidden = true;
  $("#description").oninput = (e) => {
    description = e.target.value;
    guard.edit();
  };
  $("#record").onclick = () => record($("#description"));
  $("#cancel-voice").onclick = cancelVoice;
  $("#generate").onclick = async () => {
    if (voice || voicePending || voiceAbort || busy) {
      notify(t("stop"));
      return;
    }
    description = $("#description").value;
    const age = Number($("#age").value);
    if (!description.trim() || age < 18 || age > 100) {
      notify(
        locale === "zh"
          ? "请描述人物并填写 18–100 岁的成年年龄。"
          : "Describe the character and enter an adult age (18–100).",
      );
      return;
    }
    await ensureReady(async () => {
      if (state.story) {
        render();
        return;
      }
      busy = true;
      $("#generate").disabled = true;
      try {
        const generated = await api.request("/draft", {
          method: "POST",
          body: { description, age, locale },
        });
        draft = generated.character;
        draftSceneTitles = generated.sceneTitles || [];
        draftAdultConfirmed = false;
        draftPortraitPresetId = null;
        render();
      } catch (e) {
        error(e);
      } finally {
        busy = false;
        if ($("#generate")) $("#generate").disabled = false;
      }
    });
  };
}
function portraitPickerMarkup(
  presets,
  selectedId,
  { lang, disabled = false, scope },
) {
  const english = lang === "en";
  const off = disabled ? " disabled" : "";
  const none = english
    ? "Use my generated portrait / no preset"
    : "使用自生成肖像 / 不选预设";
  const heading = english
    ? "An illustrated face for your story"
    : "为故事选一张人物插画";
  const note = english
    ? "20 built-in illustrations, generated in advance. Optional and free of image credits. Choosing one never changes your character’s written settings."
    : "20 张预先生成的内置插画，自由选择，不消耗图片额度。选图不会改变你已填写的人物设定。";
  return `<fieldset class="portrait-picker" data-preset-scope="${esc(scope)}"><legend>${heading}</legend><p class="fine">${note}</p><button type="button" class="preset-none" data-preset-id="" aria-pressed="${selectedId === null}"${off}>${none}</button><div class="portrait-grid">${presets
    .map((preset) => {
      const selected = selectedId === preset.id;
      const label = english ? preset.en : preset.zh;
      return `<button type="button" class="portrait-option" data-preset-id="${esc(preset.id)}" aria-pressed="${selected}"${off}><img src="${esc(preset.thumbnail)}" alt="" loading="lazy" decoding="async" width="240" height="320"><span class="portrait-label">${esc(label)}</span><span class="preset-selected" aria-hidden="true">✓</span></button>`;
    })
    .join(
      "",
    )}</div><p class="fine preset-selection-note" aria-live="polite">${scope === "world" ? (english ? "Select an illustration, then Apply to save it to this story." : "先选择插画，再点击“应用形象”保存到当前故事。") : english ? "Your selection is saved when you confirm the character." : "确认人物设定时，所选插画才会一起保存。"}</p></fieldset>`;
}
function bindPortraitPicker(scope, onSelect) {
  const picker = document.querySelector(`[data-preset-scope="${scope}"]`);
  if (!picker) return;
  picker.addEventListener("click", (event) => {
    const selected = event.target.closest("button[data-preset-id]");
    if (!selected || !picker.contains(selected) || selected.disabled) return;
    if (
      !canLeaveCompanionView({
        busy: busy || imageEnqueueing,
        recording: voice || voicePending,
        transcribing: voiceAbort,
      })
    )
      return;
    const id = selected.dataset.presetId || null;
    if (id && !getPortraitPreset(id)) return;
    picker.querySelectorAll("[data-preset-id]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String((button.dataset.presetId || null) === id),
      );
    });
    onSelect(id);
  });
}
function renderWorldPortraitPicker() {
  const story = state.story;
  if (worldPortraitStoryId !== story.id) {
    worldPortraitStoryId = story.id;
    worldPortraitPresetId =
      getPortraitPreset(story.portraitPresetId)?.id || null;
  }
  const selected = worldPortraitPresetId;
  const applied = getPortraitPreset(story.portraitPresetId)?.id || null;
  const section = document.createElement("section");
  section.className = "world-portrait-library";
  section.innerHTML =
    portraitPickerMarkup(PORTRAIT_PRESETS, selected, {
      lang: locale,
      scope: "world",
      disabled: busy,
    }) +
    `<div class="actions"><button type="button" id="apply-portrait-preset" class="primary" ${selected === applied || busy ? "disabled" : ""}>${locale === "en" ? "Apply portrait" : "应用形象"}</button><span class="fine" id="preset-save-status" role="status">${selected === applied ? (locale === "en" ? "Matches your saved selection" : "与当前已保存选择一致") : ""}</span></div>`;
  document.querySelector(".document").append(section);
  bindPortraitPicker("world", (id) => {
    worldPortraitPresetId = id;
    $("#apply-portrait-preset").disabled =
      id === (getPortraitPreset(state.story.portraitPresetId)?.id || null);
    $("#preset-save-status").textContent =
      locale === "en" ? "Not saved yet" : "尚未保存";
  });
  $("#apply-portrait-preset").onclick = async () => {
    if (
      !canLeaveCompanionView({
        busy: busy || imageEnqueueing,
        recording: voice || voicePending,
        transcribing: voiceAbort,
      })
    )
      return;
    const mine = epoch;
    const storyId = state.story.id;
    const presetId = worldPortraitPresetId;
    busy = true;
    $("#apply-portrait-preset").disabled = true;
    section.querySelectorAll("[data-preset-id]").forEach((button) => {
      button.disabled = true;
    });
    try {
      const result = await api.request(`/stories/${storyId}/portrait-preset`, {
        method: "POST",
        body: { presetId, expectedVersion: state.story.version },
      });
      if (mine !== epoch || state.story.id !== storyId) return;
      state.story = result.story;
      worldPortraitPresetId =
        getPortraitPreset(result.story.portraitPresetId)?.id || null;
      notify(t("saved"));
    } catch (e) {
      if (mine === epoch) error(e);
    } finally {
      busy = false;
      if (mine === epoch) render();
    }
  };
}
function renderDraft() {
  const fields = [
    "name",
    "age",
    "description",
    "appearance",
    "personality",
    "world",
    "opening",
  ];
  $("#main").innerHTML =
    `<section class="document" style="max-width:850px"><h1>${t("review")}</h1><p class="fine">${locale === "zh" ? "以下是系统建议，可逐项修改；确认后将保存为故事设定。" : "These are editable suggestions. Confirming saves them as your story setting."}</p><form id="character"><div class="form-grid">${fields.map((k) => `<label class="${["name", "age"].includes(k) ? "" : "full"}">${t(k === "world" ? "worldLabel" : k)}${k === "age" ? `<input name="age" type="number" min="18" max="100" required value="${esc(draft.age)}">` : k === "name" ? `<input name="name" maxlength="80" required value="${esc(draft.name)}">` : `<textarea name="${k}" maxlength="2500" rows="3" required>${esc(draft[k])}</textarea>`}</label>`).join("")}</div>${portraitPickerMarkup(PORTRAIT_PRESETS, draftPortraitPresetId, { lang: locale, scope: "draft", disabled: busy })}<label class="check"><input id="adult" type="checkbox" ${draftAdultConfirmed ? "checked" : ""} required>${t("adult")}</label><div class="actions">${button("confirm", "create", "primary")}<button type="button" id="back">${locale === "zh" ? "返回描述" : "Back to description"}</button></div></form></section>`;
  bindPortraitPicker("draft", (id) => {
    draftPortraitPresetId = id;
  });
  $("#character").oninput = (e) => {
    if (e.target.id === "adult") draftAdultConfirmed = e.target.checked;
    else if (fields.includes(e.target.name)) {
      draft[e.target.name] =
        e.target.name === "age" ? Number(e.target.value) : e.target.value;
    }
  };
  $("#back").onclick = () => {
    draft = null;
    render();
  };
  $("#character").onsubmit = async (e) => {
    e.preventDefault();
    draft = Object.fromEntries(new FormData(e.target));
    draft.age = Number(draft.age);
    busy = true;
    $("#create").disabled = true;
    try {
      state.story = (
        await api.request("/stories", {
          method: "POST",
          body: {
            character: draft,
            portraitPresetId: draftPortraitPresetId,
            ...(draftSceneTitles.length === 3
              ? { sceneTitles: draftSceneTitles }
              : {}),
            locale,
            adultConfirmed: $("#adult").checked,
          },
        })
      ).story;
      draft = null;
      tab = "together";
      render();
    } catch (e) {
      error(e);
    } finally {
      busy = false;
      if ($("#create")) $("#create").disabled = false;
    }
  };
}
function relationshipLabel(tone) {
  const labels = {
    normal: ["平静相处", "At ease"],
    sweet: ["亲近时刻", "A tender moment"],
    conflict: ["意见不同", "A disagreement"],
    painful: ["难过时刻", "A difficult moment"],
    repair: ["重新沟通", "Talking again"],
    breakup: ["故事落幕", "An ending"],
  };
  return (labels[tone] || labels.normal)[locale === "en" ? 1 : 0];
}
function renderTogether() {
  const s = state.story;
  const view = stageDialogue(s, {
    locale,
    pendingPlayerText,
    streamText,
    streaming: busy,
  });
  const sceneId = chooseStageScene(s);
  const background = getScenePreset(sceneId);
  const preset = getPortraitPreset(s.portraitPresetId);
  const approved = s.assets || [];
  const portrait = approved.find(
    (a) => a.kind === "portrait" && a.confirmed === true,
  );
  const scene = approved.find(
    (a) => a.kind === "scene" && a.scene === s.scene && a.confirmed === true,
  );
  const safeAsset = (a) =>
    a && /^\/api\/companion\/assets\/[\w-]+$/.test(a.url);
  const sceneUrl = safeAsset(scene) ? scene.url : background?.url;
  const portraitUrl =
    preset?.url || (safeAsset(portrait) ? portrait.url : null);
  const narrator = view.narrator.content;
  const choices = view.ended ? [] : s.choices || [];
  $("#main").innerHTML =
    `<section class="stage galgame-stage tone-${view.tone}" aria-label="${locale === "en" ? "Visual novel stage" : "视觉小说舞台"}">
    ${sceneUrl ? `<img class="scene-image" src="${esc(sceneUrl)}" alt="" fetchpriority="high">` : ""}
    <div class="stage-shade" aria-hidden="true"></div>
    ${atmosphereSvg(sceneId, view.tone)}
    ${portraitUrl ? `<img class="portrait ${preset ? "preset-portrait" : ""}" src="${esc(portraitUrl)}" alt="${esc(s.character.name)}" fetchpriority="high">` : ""}
    <header class="chapter"><div><h1>${esc(s.character.name)}</h1><p>${esc(s.sceneTitles?.[s.scene] || "")}<span class="relationship-tone">${relationshipLabel(view.tone)}</span></p></div><span class="fine">${t("ai")}</span></header>
    <div class="stage-spacer" aria-hidden="true"></div>
    <section class="dialogue stage-dialogue" aria-label="${locale === "en" ? "Dialogue" : "对白"}">
      <div class="dialogue-tools"><span class="fine">${locale === "en" ? "Your story, one moment at a time" : "此刻的故事，由你回应"}</span><button class="quiet" id="history">${t("history")}</button><a href="/companion/guide/" target="_blank" rel="noopener">${locale === "en" ? "Relationship guide" : "相处参考"}</a></div>
      <section class="narrator-speech" id="narrator-speech" ${narrator ? "" : "hidden"}><span class="speech-label">${view.narrator.label}</span><p>${esc(narrator)}</p></section>
      <section class="player-speech" id="player-speech" ${view.player.content ? "" : "hidden"}><span class="speech-label">${view.player.label}<small class="speech-state" id="player-state">${pendingPlayerText ? (locale === "en" ? "Awaiting confirmation" : "等待发送确认") : ""}</small></span><p id="player-line">${esc(view.player.content)}</p></section>
      <section class="companion-speech" id="companion-speech" ${view.companion.content || busy ? "" : "hidden"}><div class="speaker"><span class="speech-label">${esc(view.companion.label)}</span><button class="reveal-line" id="reveal-line" type="button" aria-label="${locale === "en" ? "Show all received dialogue" : "显示当前完整台词"}">${locale === "en" ? "Show full line" : "显示完整台词"}</button></div><div class="line" id="reply" aria-live="polite" aria-atomic="true">${esc(view.companion.content)}</div></section>
      ${view.ended ? `<div class="story-ending" role="status"><strong>${locale === "en" ? "This chapter of your relationship has ended." : "这段关系的故事已结束。"}</strong><p>${locale === "en" ? "Your conversations and memories remain yours to read. There is no need to reply." : "对话与回忆仍可回看，不需要再做回应。"}</p></div>` : `<details class="response-drawer" id="response-drawer" ${responseDrawerOpen ? "open" : ""}><summary>${locale === "en" ? "Choose a response" : "选择回应"}<span>${choices.length ? (locale === "en" ? "or write in your own words" : "也可以自由输入") : locale === "en" ? "Write in your own words" : "自由输入你的想法"}</span></summary><div class="choices">${choices.map((c) => `<button data-choice="${esc(c.id)}">${esc(c.label)}</button>`).join("")}</div></details><div id="composer-slot"></div>`}
    </section></section>`;
  const reply = $("#reply");
  typewriter = new TypewriterText(
    (text) => {
      if (reply.isConnected) reply.textContent = text;
    },
    {
      reducedMotion:
        reduceMotion || matchMedia("(prefers-reduced-motion: reduce)").matches,
    },
  );
  const reveal = () => {
    if (busy) typewriter?.flush();
  };
  $("#reveal-line").onclick = reveal;
  reply.onclick = reveal;
  $("#history").onclick = () => {
    if (
      !canLeaveCompanionView({
        busy,
        recording: voice || voicePending,
        transcribing: voiceAbort,
      })
    ) {
      notify(t("pending"));
      return;
    }
    tab = "memories";
    render();
  };
  if (view.ended) return;
  $("#response-drawer").ontoggle = (e) => {
    responseDrawerOpen = e.target.open;
  };
  $("#composer-slot").append($("#composer").content.cloneNode(true));
  $("#message").placeholder = t("placeholder");
  $("#message").setAttribute(
    "aria-label",
    locale === "en" ? "Your reply" : "你的回应",
  );
  $("#message").value = input;
  $("#message").oninput = (e) => {
    input = e.target.value;
    guard.edit();
  };
  $("#record").textContent = t("record");
  $("#record").onclick = () => record($("#message"));
  $("#cancel-voice").textContent = t("cancel");
  $("#cancel-voice").onclick = cancelVoice;
  $("#voice-hint").textContent = t("voiceHint");
  $("#send").textContent = t("send");
  $("#send").onclick = () => send();
  document
    .querySelectorAll("[data-choice]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          send(s.choices.find((c) => c.id === button.dataset.choice))),
    );
  $("#message").onkeydown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  };
}
async function send(choice) {
  if (state?.story?.relationship?.ended) return;
  if (
    !canLeaveCompanionView({
      busy,
      recording: voice || voicePending,
      transcribing: voiceAbort,
    })
  )
    return;
  if (
    choice?.id === "end-relationship" &&
    !confirm(
      locale === "en"
        ? "End this relationship? The story will close. Your conversations and memories will remain available to read."
        : "确认结束这段关系吗？故事将落幕，所有对话与回忆仍会保留，供你回看。",
    )
  )
    return;
  cancelPolish();
  const text = choice?.label || input.trim();
  if (!text) return;
  await ensureReady(async () => {
    const s = state.story;
    const body =
      retry &&
      retry.text === text &&
      retry.expectedVersion === s.version &&
      retry.choiceId === choice?.id
        ? retry
        : {
            clientTurnId: crypto.randomUUID(),
            expectedVersion: s.version,
            text,
            ...(choice ? { choiceId: choice.id } : {}),
          };
    retry = body;
    busy = true;
    $("#narrator-speech").hidden = true;
    $("#companion-speech").hidden = false;
    streamText = "";
    pendingPlayerText = text;
    $("#player-speech").hidden = false;
    $("#player-line").textContent = text;
    $("#player-state").textContent =
      locale === "en" ? "Awaiting confirmation" : "等待发送确认";
    typewriter?.reset();
    turnAbort = new AbortController();
    const mine = epoch;
    $("#send").disabled = true;
    document
      .querySelectorAll("[data-choice]")
      .forEach((b) => (b.disabled = true));
    $("#reply").textContent = t("pending");
    $("#reply").setAttribute("aria-busy", "true");
    const cancel = document.createElement("button");
    cancel.textContent = t("cancel");
    cancel.onclick = () => turnAbort?.abort();
    $(".composer-controls").append(cancel);
    try {
      const story = await api.turn(s.id, body, {
        signal: turnAbort.signal,
        onText: (fragment) => {
          if (epoch !== mine) return;
          streamText += fragment;
          typewriter?.append(fragment);
        },
      });
      if (epoch !== mine) return;
      state.story = story;
      pendingPlayerText = "";
      typewriter?.flush();
      if (!choice && input.trim() === text) input = "";
      retry = null;
      pendingPlayerText = "";
      streamText = "";
    } catch (e) {
      if (epoch === mine) {
        streamText = "";
        error(e);
      }
    } finally {
      busy = false;
      turnAbort = null;
      if (epoch === mine) render();
    }
  });
}
function renderMemories() {
  const s = state.story;
  $("#main").innerHTML =
    `<section class="document"><header class="document-header"><h1>${t("memories")}</h1><p class="fine">${t("private")}</p></header><div class="notebook"><section><h2>${t("shared")}</h2>${s.memories.length ? s.memories.map((m) => `<article class="memory"><p>${esc(m.content)}</p><div class="actions"><button data-source="${esc(m.sourceTurnId)}">${t("source")}</button><button data-edit="${esc(m.id)}">${t("edit")}</button><button data-delete="${esc(m.id)}">${t("delete")}</button></div></article>`).join("") : `<p class="empty">${t("emptyMemory")}</p>`}</section><section><h2>${t("history")}</h2><div class="history">${s.turns.map((turn) => `<article class="turn" id="turn-${esc(turn.id)}">${turn.role === "assistant" && turn.narration ? `<section class="history-narration"><strong>${locale === "en" ? "Narrator" : "旁白"}</strong><p>${esc(turn.narration)}</p></section>` : ""}<strong>${esc(turn.role === "user" ? t("you") : s.character.name)}</strong><p>${esc(turn.content)}</p><button data-keep="${esc(turn.id)}">${t("keep")}</button></article>`).join("")}</div></section></div></section>`;
  document
    .querySelectorAll("[data-source]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          document
            .getElementById(`turn-${b.dataset.source}`)
            ?.scrollIntoView({ block: "center" })),
    );
  document.querySelectorAll("[data-keep]").forEach(
    (b) =>
      (b.onclick = () =>
        editMemory(
          null,
          s.turns.find((x) => x.id === b.dataset.keep),
        )),
  );
  document
    .querySelectorAll("[data-edit]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          editMemory(s.memories.find((x) => x.id === b.dataset.edit))),
    );
  document.querySelectorAll("[data-delete]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (
          !confirm(
            locale === "zh"
              ? "删除这条记忆？后续对话将不再检索它。"
              : "Delete this memory from future conversation context?",
          )
        )
          return;
        try {
          state.story = (
            await api.request(`/stories/${s.id}/memories/${b.dataset.delete}`, {
              method: "DELETE",
            })
          ).story;
          render();
        } catch (e) {
          error(e);
        }
      }),
  );
}
function editMemory(memory, turn) {
  showModal(
    t("shared"),
    `<p class="fine">${locale === "zh" ? "仅保留实际发生的虚构事件或你愿意记住的偏好。修改会影响后续对话。" : "Save only events that occurred or preferences you choose to retain. Changes affect future conversations."}</p><textarea id="memory-content" maxlength="2000" rows="6">${esc(memory?.content || turn.content)}</textarea><div class="actions">${button("save", "save-memory", "primary")}</div>`,
  );
  $("#save-memory").onclick = async () => {
    const content = $("#memory-content").value.trim();
    if (!content) return;
    $("#save-memory").disabled = true;
    try {
      state.story = (
        await api.request(
          `/stories/${state.story.id}/memories${memory ? `/${memory.id}` : ""}`,
          {
            method: memory ? "PATCH" : "POST",
            body: { content, ...(!memory ? { sourceTurnId: turn.id } : {}) },
          },
        )
      ).story;
      $("#modal").close();
      render();
    } catch (e) {
      error(e);
    } finally {
      if ($("#save-memory")) $("#save-memory").disabled = false;
    }
  };
}
function renderWorld() {
  const s = state.story;
  $("#main").innerHTML =
    `<section class="document"><header class="document-header"><h1>${t("world")}</h1><p class="fine">${t("ai")}</p></header><div class="world-grid"><section><h2>${esc(s.character.name)} <small>${esc(s.character.age)}</small></h2>${["description", "appearance", "personality", "world"].map((k) => `<div class="setting"><small>${t(k === "world" ? "worldLabel" : k)}</small><p>${esc(s.character[k])}</p></div>`).join("")}</section><section><h2>${locale === "zh" ? "故事的所在" : "Places in your story"}</h2>${[0, 1, 2].map((i) => `<div class="scene-tile ${i > s.scene ? "locked" : ""}"><span>${i > s.scene ? "◇" : esc(s.sceneTitles?.[i] || "")}</span><small>${t(i > s.scene ? "locked" : i === s.scene ? "current" : "unlocked")}</small></div>`).join("")}<p class="fine">${locale === "zh" ? "明确的剧情选择推进场景；普通聊天不会自动跳转。首版是一段三幕开篇，不是无限章节。" : "Explicit story choices advance scenes; ordinary chat does not. This release is a three-scene opening, not unlimited chapters."}</p><h3>${t("images")}</h3><p class="fine" id="image-quota">${state.imageEnabled ? `${t("imageQuota")}: ${state.imageRemaining}` : t("imageOff")}</p><div class="actions">${button("portrait", "portrait")}${button("scene", "scene")}</div><div id="jobs"></div></section></div></section>`;
  for (const kind of ["portrait", "scene"]) {
    $(`#${kind}`).disabled = !state.imageEnabled || state.imageRemaining <= 0;
    $(`#${kind}`).onclick = () => generateImage(kind);
  }
  renderJobs();
  renderWorldPortraitPicker();
  const relationship = stageDialogue(s, { locale });
  const status = document.createElement("section");
  status.className = "world-relationship";
  status.innerHTML = `<h2>${locale === "en" ? "Where you are together" : "你们正在经历"}</h2><p>${relationshipLabel(relationship.tone)}</p>${relationship.narrator.content ? `<p class="fine">${locale === "en" ? "Narrator" : "旁白"}</p><p>${esc(relationship.narrator.content)}</p>` : ""}<a href="/companion/guide/" target="_blank" rel="noopener">${locale === "en" ? "Open the optional relationship guide" : "主动打开相处参考"}</a>`;
  document.querySelector(".world-portrait-library").before(status);
}
function renderJobs() {
  if (!$("#jobs")) return;
  $("#jobs").innerHTML = (state.jobs || [])
    .map((j) => {
      const asset = state.story.assets?.find((a) => a.id === j.assetId);
      return `<div class="job"><p>${t(j.status)} <small>${Math.max(0, Math.floor((Date.now() - new Date(j.createdAt).getTime()) / 1000))}s</small></p>${["queued", "running"].includes(j.status) ? `<p class="fine">${Date.now() - new Date(j.createdAt) > 60000 ? t("wait") : ""}</p><button data-cancel-job="${esc(j.id)}">${t("cancel")}</button>` : ""}${j.status === "failed" ? `<p class="fine">${esc(j.errorCode || "")}</p>` : ""}${j.status === "succeeded" && j.assetId ? `<img class="preview" alt="${locale === "zh" ? "待确认插画" : "Illustration preview"}" src="/api/companion/assets/${encodeURIComponent(j.assetId)}"><button data-approve="${esc(j.assetId)}">${t("approveImage")}</button>` : ""}</div>`;
    })
    .join("");
  document.querySelectorAll("[data-cancel-job]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          const { job } = await api.request(`/jobs/${b.dataset.cancelJob}`, {
            method: "DELETE",
          });
          replaceJob(job);
          await refreshImageState();
        } catch (e) {
          error(e);
        }
      }),
  );
  document.querySelectorAll("[data-approve]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (busy) return;
        busy = true;
        try {
          state.story = (
            await api.request(
              `/stories/${state.story.id}/images/${b.dataset.approve}/confirm`,
              { method: "POST", body: {} },
            )
          ).story;
          worldPortraitStoryId = null;
          notify(t("saved"));
        } catch (e) {
          error(e);
        } finally {
          busy = false;
          render();
        }
      }),
  );
}
function replaceJob(job) {
  state.jobs = [...(state.jobs || []).filter((j) => j.id !== job.id), job];
}
async function refreshImageState(mine = epoch) {
  const latest = await api.request();
  if (mine !== epoch || !state || latest.story?.id !== state.story?.id) return;
  state.imageRemaining = latest.imageRemaining;
  state.imageEnabled = latest.imageEnabled;
  state.jobs = latest.jobs;
  if ($("#image-quota"))
    $("#image-quota").textContent = state.imageEnabled
      ? `${t("imageQuota")}: ${state.imageRemaining}`
      : t("imageOff");
  for (const kind of ["portrait", "scene"]) {
    if ($(`#${kind}`))
      $(`#${kind}`).disabled =
        imageEnqueueing || !state.imageEnabled || state.imageRemaining <= 0;
  }
  renderJobs();
}
async function generateImage(kind) {
  if (busy || imageEnqueueing || !confirm(t("imageCost"))) return;
  await ensureReady(async () => {
    const mine = epoch;
    const storyId = state.story.id;
    const scene = kind === "portrait" ? 0 : state.story.scene;
    const requestKey = `${storyId}:${kind}:${scene}`;
    // Retained in session storage until acknowledged: retrying a lost response never buys a second job.
    const clientJobId = imageRequests.begin(requestKey);
    imageEnqueueing = true;
    try {
      const { job } = await api.request(`/stories/${storyId}/images`, {
        method: "POST",
        body: { kind, scene, clientJobId },
      });
      imageRequests.acknowledge(requestKey);
      if (mine !== epoch) return;
      replaceJob(job);
      renderJobs();
    } catch (e) {
      if (mine === epoch) error(e);
    } finally {
      imageEnqueueing = false;
      if (mine === epoch) {
        try {
          await refreshImageState(mine);
        } catch (e) {
          error(e);
        }
        pollJobs();
      }
    }
  });
}
function pollJobs() {
  clearTimeout(jobTimer);
  if (!state?.jobs?.some((j) => ["queued", "running"].includes(j.status)))
    return;
  const mine = epoch;
  jobTimer = setTimeout(async () => {
    try {
      let completed = false;
      for (const j of state.jobs.filter((j) =>
        ["queued", "running"].includes(j.status),
      )) {
        const result = await api.request(`/jobs/${j.id}`);
        if (mine !== epoch) return;
        replaceJob(result.job);
        if (!["queued", "running"].includes(result.job.status))
          completed = true;
        if (
          result.story &&
          (!state.story || result.story.version >= state.story.version)
        )
          state.story = result.story;
      }
      if (completed) await refreshImageState(mine);
      renderJobs();
    } catch (e) {
      error(e);
    }
    if (mine === epoch) pollJobs();
  }, 3000);
}
async function ensureReady(action) {
  if (!account) {
    auth(() => ensureReady(action));
    return;
  }
  if (!state?.consent || !account.externalAiConsent?.current) {
    consent(action);
    return;
  }
  await action();
}
function auth(after) {
  let registering = false;
  const paint = () => {
    showModal(
      t(registering ? "register" : "login"),
      `<form id="auth"><label>${locale === "zh" ? "用户名" : "Username"}<input name="username" autocomplete="username" required minlength="3" maxlength="64"></label><label>${locale === "zh" ? "密码" : "Password"}<input name="password" type="password" autocomplete="${registering ? "new-password" : "current-password"}" required minlength="${registering ? 12 : 1}"></label><p class="error" id="auth-error" role="alert"></p><div class="actions">${button(registering ? "register" : "login", "auth-submit", "primary")}<button type="button" id="auth-switch">${t(registering ? "login" : "register")}</button></div></form>`,
    );
    $("#auth-switch").onclick = () => {
      registering = !registering;
      paint();
    };
    $("#auth").onsubmit = async (e) => {
      e.preventDefault();
      $("#auth-submit").disabled = true;
      const f = new FormData(e.target);
      try {
        await platform[registering ? "register" : "login"](
          f.get("username"),
          f.get("password"),
        );
        account = await platform.me();
        state = await api.request();
        $("#modal").close();
        render();
        pollJobs();
        if (after) await after();
      } catch (e) {
        $("#auth-error").textContent = e.message;
      } finally {
        if ($("#auth-submit")) $("#auth-submit").disabled = false;
      }
    };
  };
  paint();
}
function consent(after) {
  showModal(
    t("consentTitle"),
    `<p>${t("private")}</p><p>${t("consentText")}</p><label class="check"><input type="checkbox" id="consent-check">${t("agree")}</label>${button("continue", "consent-save", "primary")}`,
  );
  $("#consent-save").onclick = async () => {
    if (!$("#consent-check").checked) return;
    $("#consent-save").disabled = true;
    try {
      await platform.setExternalAiConsent(
        true,
        account.externalAiConsent?.policyVersion,
      );
      await api.request("/consent", {
        method: "PUT",
        body: { accepted: true, policyVersion: state.policyVersion },
      });
      account = await platform.me();
      state = await api.request();
      $("#modal").close();
      await after?.();
    } catch (e) {
      error(e);
    } finally {
      if ($("#consent-save")) $("#consent-save").disabled = false;
    }
  };
}
function settings() {
  if (!account) {
    auth();
    return;
  }
  showModal(
    t("settings"),
    `<p>${t("private")}</p><p class="fine">${t("consentText")}</p><p class="fine">${t("imageQuota")}: ${state?.imageRemaining ?? 0}</p><p class="fine">${locale === "zh" ? "文字调用状态" : "Text usage"}: ${state?.usage?.unlimited ? (locale === "zh" ? "不限次数" : "Unlimited") : `${state?.usage?.remaining ?? "—"} ${locale === "zh" ? "次剩余" : "remaining"}`} </p><label class="check"><input id="reduce-motion" type="checkbox" ${reduceMotion ? "checked" : ""}>${locale === "en" ? "Reduce motion (system preference is also respected)" : "减少动态效果（同时遵循系统设置）"}</label><p><a href="/companion/guide/" target="_blank" rel="noopener">${locale === "en" ? "Optional relationship guide" : "相处参考（自由选择阅读）"}</a></p><div class="actions">${button("refresh", "refresh")}${button("withdraw", "withdraw")}${state?.story ? button("deleteStory", "delete-story") : ""}${button("logout", "logout")}</div><p><a href="/legacy/">${t("legacy")}</a></p>`,
  );
  $("#reduce-motion").onchange = (e) => {
    reduceMotion = e.target.checked;
    localStorage.setItem("game-companion-reduce-motion", String(reduceMotion));
    document.body.classList.toggle("reduce-motion", reduceMotion);
    if (typewriter)
      typewriter.reducedMotion =
        reduceMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) typewriter?.flush();
  };
  $("#refresh").onclick = async () => {
    cancelVoice();
    try {
      state = await api.request();
      $("#modal").close();
      render();
      pollJobs();
    } catch (e) {
      error(e);
    }
  };
  $("#withdraw").onclick = async () => {
    if (!confirm(t("withdraw") + "?")) return;
    cancelVoice();
    turnAbort?.abort();
    try {
      await api.request("/consent", {
        method: "PUT",
        body: { accepted: false, policyVersion: state.policyVersion },
      });
      await platform.setExternalAiConsent(false);
      state.consent = false;
      account = await platform.me();
      $("#modal").close();
      notify(t("saved"));
    } catch (e) {
      error(e);
    }
  };
  $("#logout").onclick = async () => {
    epoch++;
    cancelVoice();
    turnAbort?.abort();
    clearTimeout(jobTimer);
    try {
      await platform.logout();
      account = null;
      state = null;
      draft = null;
      input = "";
      description = "";
      retry = null;
      pendingPlayerText = "";
      $("#modal").close();
      render();
    } catch (e) {
      error(e);
    }
  };
  if ($("#delete-story"))
    $("#delete-story").onclick = async () => {
      if (!confirm(t("deleteWarning"))) return;
      epoch++;
      cancelVoice();
      turnAbort?.abort();
      clearTimeout(jobTimer);
      try {
        await api.request(`/stories/${state.story.id}`, { method: "DELETE" });
        state = await api.request();
        input = "";
        retry = null;
        pendingPlayerText = "";
        $("#modal").close();
        render();
      } catch (e) {
        error(e);
      }
    };
}
async function record(target) {
  if (state?.story?.relationship?.ended && target?.id === "message") return;
  cancelPolish();
  if (voice) {
    await finishVoice();
    return;
  }
  if (voiceAbort || voicePending || busy) return;
  await ensureReady(async () => {
    target = document.getElementById(target.id) || target;
    const token = guard.begin(target.value),
      mine = epoch;
    voicePending = token;
    $("#cancel-voice").hidden = false;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (mine !== epoch || token.epoch !== guard.epoch) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      const Context = window.AudioContext || window.webkitAudioContext;
      const context = new Context();
      await context.resume();
      if (
        mine !== epoch ||
        token.epoch !== guard.epoch ||
        !target.isConnected
      ) {
        media.getTracks().forEach((track) => track.stop());
        await context.close();
        return;
      }
      const source = context.createMediaStreamSource(media),
        processor = context.createScriptProcessor(4096, 1, 1),
        gain = context.createGain();
      gain.gain.value = 0;
      const chunks = [];
      source.connect(processor);
      processor.connect(gain);
      gain.connect(context.destination);
      voice = {
        media,
        context,
        source,
        processor,
        gain,
        chunks,
        token,
        target,
        started: Date.now(),
      };
      processor.onaudioprocess = (e) => {
        if (!voice) return;
        const data = new Float32Array(e.inputBuffer.getChannelData(0));
        chunks.push(data);
        if ($("#voice-status")) {
          const elapsed = Math.min(
            60,
            Math.floor((Date.now() - voice.started) / 1000),
          );
          const bars = Array.from({ length: 24 }, (_, i) => {
            const start = Math.floor((i * data.length) / 24);
            const end = Math.floor(((i + 1) * data.length) / 24);
            let peak = 0;
            for (let j = start; j < end; j++)
              peak = Math.max(peak, Math.abs(data[j]));
            return `<i style="height:${Math.round(4 + Math.min(1, peak * 5) * 24)}px"></i>`;
          }).join("");
          $("#voice-status").innerHTML =
            `<span class="voice-wave" aria-hidden="true">${bars}</span><span>${elapsed}s / 60s</span><progress class="voice-progress" max="60" value="${elapsed}" aria-label="${locale === "zh" ? "已录音时长" : "Recording duration"}"></progress>`;
        }
      };
      $("#record").textContent = t("stop");
      $("#cancel-voice").hidden = false;
      if ($("#send")) $("#send").disabled = true;
      voiceTimer = setTimeout(() => finishVoice(), 60000);
    } catch (e) {
      guard.cancel();
      error(e);
    } finally {
      if (voicePending === token) voicePending = false;
      if (!voice && !voicePending && !voiceAbort) voiceUiReset();
    }
  });
}
function releaseRecording() {
  clearTimeout(voiceTimer);
  if (!voice) return null;
  const old = voice;
  voice = null;
  old.processor.onaudioprocess = null;
  old.source.disconnect();
  old.processor.disconnect();
  old.gain.disconnect();
  old.media.getTracks().forEach((t) => t.stop());
  old.context.close().catch(() => {});
  return old;
}
function cancelPolish() {
  if (!polishAbort) return;
  polishAbort.abort("cancel");
  polishAbort = null;
  guard.cancel();
}
async function finishVoice() {
  const recording = releaseRecording();
  if (!recording) return;
  const controller = new AbortController();
  voiceAbort = controller;
  $("#record").disabled = true;
  $("#voice-status").textContent = t("transcribing");
  const timeout = setTimeout(() => controller.abort("timeout"), 35000);
  try {
    if (!recording.chunks.length)
      throw new Error(
        locale === "en"
          ? "No audio captured. Record again; content may be missing."
          : "未捕获音频，可能有遗漏，请重新录音。",
      );
    const wav = new Blob(
      [encodeWav(recording.chunks, recording.context.sampleRate)],
      { type: "audio/wav" },
    );
    const text = await platform.transcribeVoice(wav, {
      priority: "final",
      signal: controller.signal,
      language: locale === "zh" ? "zh" : "en",
    });
    if (controller.signal.aborted) return;
    const raw = guard.finish(recording.token, text);
    if (raw === null || !recording.target.isConnected) {
      notify(t("late"));
      return;
    }
    const target = recording.target;
    const apply = (value) => {
      target.value = value;
      if (target.id === "description") description = value;
      else input = value;
    };
    apply(raw);
    // The raw result is immediately sendable. Punctuation is opt-in and never owns the composer lock.
    document.getElementById("transcript-actions")?.remove();
    const actions = document.createElement("span");
    actions.id = "transcript-actions";
    actions.className = "transcript-actions";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.textContent =
      locale === "en" ? "Restore raw transcript" : "恢复原始转写";
    restore.onclick = () => {
      if (target.isConnected) {
        cancelPolish();
        guard.edit();
        apply(raw);
      }
    };
    const tidy = document.createElement("button");
    tidy.type = "button";
    tidy.textContent =
      locale === "en" ? "Tidy punctuation (optional)" : "整理标点（可选）";
    tidy.onclick = () => {
      if (busy || voice || voicePending || voiceAbort || !target.isConnected)
        return;
      if (polishAbort) {
        cancelPolish();
        tidy.textContent =
          locale === "en" ? "Tidy punctuation (optional)" : "整理标点（可选）";
        return;
      }
      const original = target.value;
      const token = guard.begin("");
      const polishController = new AbortController();
      polishAbort = polishController;
      tidy.textContent =
        locale === "en"
          ? "Cancel punctuation · keep text"
          : "取消整理 · 保留文字";
      const timer = setTimeout(() => polishController.abort("timeout"), 10000);
      platform
        .organizeVoiceText(original, { signal: polishController.signal })
        .then((polished) => {
          if (polishController.signal.aborted) return;
          const candidate = guard.finish(
            token,
            preserveVoiceTranscript(original, polished),
          );
          if (candidate !== null && target.isConnected) apply(candidate);
        })
        .catch((error) => {
          if (!polishController.signal.aborted)
            notify(
              locale === "en"
                ? "Punctuation cleanup failed. Your draft is preserved."
                : "标点整理失败，当前草稿已保留。",
            );
        })
        .finally(() => {
          clearTimeout(timer);
          if (polishAbort !== polishController) return;
          polishAbort = null;
          if (tidy.isConnected)
            tidy.textContent =
              locale === "en"
                ? "Tidy punctuation (optional)"
                : "整理标点（可选）";
        });
    };
    actions.append(tidy, restore);
    $("#record").parentElement.append(actions);
  } catch (errorValue) {
    if (controller.signal.reason === "timeout") notify(t("timeout"));
    else if (errorValue.name !== "AbortError") error(errorValue);
  } finally {
    clearTimeout(timeout);
    if (voiceAbort === controller) {
      voiceAbort = null;
      voiceUiReset();
    }
  }
}
function voiceUiReset() {
  if ($("#record")) {
    $("#record").textContent = t("record");
    $("#record").disabled = false;
  }
  if ($("#voice-status")) $("#voice-status").textContent = "";
  if ($("#cancel-voice")) $("#cancel-voice").hidden = true;
  if ($("#send"))
    $("#send").disabled = busy || Boolean(state?.story?.relationship?.ended);
}
function cancelVoice() {
  cancelPolish();
  voicePending = false;
  guard.cancel();
  releaseRecording();
  voiceAbort?.abort("cancel");
  voiceAbort = null;
  voiceUiReset();
}
window.addEventListener("pagehide", () => {
  epoch++;
  typewriter?.dispose();
  cancelVoice();
  turnAbort?.abort();
  clearTimeout(jobTimer);
});
async function boot() {
  syncLocale();
  $("#main").innerHTML =
    `<section class="intro"><p>${t("loading")}</p></section>`;
  try {
    const health = await platform.health();
    if (!health.capabilities?.companion) {
      $("#main").innerHTML =
        `<section class="intro"><h1>GAME</h1><p>${t("disabled")}</p><a href="/legacy/">${t("legacy")}</a></section>`;
      return;
    }
    try {
      account = await platform.me();
      state = await api.request();
    } catch (e) {
      if (e.status !== 401) throw e;
    }
    render();
    pollJobs();
  } catch (e) {
    renderIntro();
    error(e);
  }
}
boot();

document.addEventListener("visibilitychange", () => {
  document.body.classList.toggle("page-hidden", document.hidden);
});

matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
  "change",
  (event) => {
    if (typewriter) typewriter.reducedMotion = event.matches || reduceMotion;
    if (event.matches || reduceMotion) typewriter?.flush();
  },
);
