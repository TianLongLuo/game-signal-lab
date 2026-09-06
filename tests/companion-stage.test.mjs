import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseStageScene,
  stageDialogue,
  atmosphereSvg,
  TypewriterText,
} from "../src/companion-stage.js";
const story = {
  character: { name: "林澈", world: "一座海边城市", opening: "你好" },
  scene: 0,
  sceneTitles: ["雨中的车站"],
  turns: [
    { role: "user", content: "我想听听你的想法" },
    { role: "assistant", content: "我愿意慢慢说。" },
  ],
  relationship: {
    tone: "repair",
    ended: false,
    event: {
      id: "event-1",
      narration: { zh: "雨渐渐停了。", en: "The rain eases." },
    },
  },
};
test("scene selection is deterministic visual-only and recognizes bilingual places", () => {
  const before = JSON.stringify(story);
  assert.equal(chooseStageScene(story), "rain");
  for (const [title, id] of [
    ["Cafe at dusk", "cafe"],
    ["海边散步", "coast"],
    ["庭院的风", "garden"],
    ["Home again", "home"],
  ])
    assert.equal(chooseStageScene({ ...story, sceneTitles: [title] }), id);
  assert.equal(JSON.stringify(story), before);
});
test("player, companion and event narration remain separately labelled", () => {
  const view = stageDialogue(story, { locale: "en" });
  assert.equal(view.player.label, "You");
  assert.equal(view.player.content, "我想听听你的想法");
  assert.equal(view.companion.label, "林澈");
  assert.equal(view.narrator.label, "Narrator");
  assert.equal(view.narrator.content, "The rain eases.");
  assert.equal(
    stageDialogue(story, { locale: "zh", pendingPlayerText: "这次先聊到这里" })
      .player.content,
    "这次先聊到这里",
  );
});
test("ending disables new conversation without dropping history or prior dialogue", () => {
  const view = stageDialogue({
    ...story,
    relationship: { ...story.relationship, ended: true, tone: "breakup" },
  });
  assert.equal(view.ended, true);
  assert.equal(view.companion.content, "我愿意慢慢说。");
  assert.equal(story.turns.length, 2);
});
test("atmosphere SVG is decorative, scene-specific and rejects unknown tone", () => {
  for (const id of ["rain", "cafe", "coast", "garden", "home"]) {
    const svg = atmosphereSvg(id, "normal");
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, /focusable="false"/);
    assert.match(svg, new RegExp(`data-atmosphere="${id}"`));
    assert.doesNotMatch(svg, /<script/);
  }
  assert.doesNotMatch(atmosphereSvg("rain", "<evil>"), /<evil>/);
});
test("typewriter handles unicode, flush, late fragments and disposal", () => {
  const queue = [];
  let shown = "";
  const writer = new TypewriterText((value) => (shown = value), {
    schedule: (fn) => {
      queue.push(fn);
      return queue.length;
    },
    cancel: () => {},
  });
  writer.append("你好🌙");
  assert.equal(shown, "");
  queue.shift()();
  assert.equal(shown, "你");
  writer.flush();
  assert.equal(shown, "你好🌙");
  writer.append("！");
  assert.equal(shown, "你好🌙！");
  writer.reset();
  writer.append("旧回复");
  writer.dispose();
  for (const fn of queue) fn();
  assert.equal(shown, "");
});
test("reduced motion reveals current text without scheduling animation", () => {
  let shown = "";
  const writer = new TypewriterText((value) => (shown = value), {
    reducedMotion: true,
    schedule: () => {
      throw Error("should not schedule");
    },
  });
  writer.append("Full text");
  assert.equal(shown, "Full text");
});

async function appFunction(name, next, context) {
  const { readFile } = await import("node:fs/promises");
  const { runInNewContext } = await import("node:vm");
  const source = await readFile(
    new URL("../companion/app.js", import.meta.url),
    "utf8",
  );
  const start = source.indexOf(name),
    end = source.indexOf(next, start);
  assert.ok(start >= 0 && end > start);
  return runInNewContext(`(${source.slice(start, end)})`, context);
}
test("stage DOM exposes named speakers, keyboard drawer and read-only ending", async () => {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id))
      nodes.set(id, {
        innerHTML: "",
        setAttribute() {},
        append() {},
        content: {
          cloneNode() {
            return {};
          },
        },
      });
    return nodes.get(id);
  };
  const context = {
    state: {
      story: {
        ...story,
        choices: [{ id: "talk-it-through", label: "把话说开" }],
      },
    },
    locale: "zh",
    pendingPlayerText: "",
    streamText: "",
    responseDrawerOpen: true,
    reduceMotion: false,
    busy: false,
    stageDialogue,
    chooseStageScene,
    atmosphereSvg,
    esc: (s) => String(s ?? ""),
    getScenePreset: (id) => ({ url: `/companion/scenes/${id}.jpg` }),
    getPortraitPreset: () => null,
    relationshipLabel: () => "重新沟通",
    t: (k) => k,
    $: node,
    TypewriterText,
    matchMedia: () => ({ matches: false }),
    document: { querySelectorAll: () => [] },
    record() {},
    cancelVoice() {},
    send() {},
    input: "",
  };
  const render = await appFunction(
    "function renderTogether()",
    "async function send(choice)",
    context,
  );
  render();
  const html = node("#main").innerHTML;
  assert.match(html, /class="scene-image" src="\/companion\/scenes\/rain.jpg"/);
  assert.match(html, /class="narrator-speech"/);
  assert.match(html, /主角 · 你/);
  assert.match(html, /林澈/);
  assert.match(html, /<details class="response-drawer"/);
  assert.match(html, /<summary>/);
  assert.match(html, /id="player-line">我想听听你的想法/);
  node("#response-drawer").ontoggle({ target: { open: false } });
  assert.equal(context.responseDrawerOpen, false);
  context.state.story = {
    ...context.state.story,
    relationship: { ...story.relationship, ended: true, tone: "breakup" },
  };
  render();
  assert.match(node("#main").innerHTML, /class="story-ending" role="status"/);
  assert.doesNotMatch(node("#main").innerHTML, /id="composer-slot"/);
  assert.doesNotMatch(node("#main").innerHTML, /data-choice=/);
});
test("ASR has a 35s budget; raw text is sendable before optional punctuation and manual edits win", async () => {
  const { VoiceDraftGuard, encodeWav } =
    await import("../src/companion-client.js");
  const guard = new VoiceDraftGuard(),
    target = { id: "message", value: "Existing draft", isConnected: true };
  const recording = {
    token: guard.begin(target.value),
    target,
    chunks: [new Float32Array([0])],
    context: { sampleRate: 16000 },
  };
  const elements = [];
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id))
      nodes.set(id, {
        disabled: false,
        textContent: "",
        parentElement: {
          append(value) {
            elements.push(value);
          },
        },
      });
    return nodes.get(id);
  };
  const budgets = [];
  let resolvePolish,
    polishCalls = 0,
    sendable = false;
  const context = {
    releaseRecording: () => recording,
    AbortController,
    Blob,
    guard,
    encodeWav,
    locale: "en",
    voiceAbort: null,
    polishAbort: null,
    voice: null,
    voicePending: false,
    busy: false,
    platform: {
      transcribeVoice: async () => "Spoken words",
      organizeVoiceText: () => {
        polishCalls++;
        return new Promise((resolve) => {
          resolvePolish = resolve;
        });
      },
    },
    setTimeout: (fn, ms) => {
      budgets.push(ms);
      return budgets.length;
    },
    clearTimeout() {},
    $: node,
    t: (k) => k,
    notify() {},
    error(e) {
      throw e;
    },
    input: target.value,
    preserveVoiceTranscript: (a, b) => b,
    voiceUiReset: () => {
      sendable = true;
    },
    cancelPolish() {},
    document: {
      getElementById: () => null,
      createElement: () => ({
        isConnected: true,
        children: [],
        append(...children) {
          this.children.push(...children);
        },
      }),
    },
  };
  const finish = await appFunction(
    "async function finishVoice()",
    "function voiceUiReset()",
    context,
  );
  await finish();
  assert.equal(budgets[0], 35000);
  assert.equal(target.value, "Existing draft\nSpoken words");
  assert.equal(sendable, true);
  assert.equal(context.voiceAbort, null);
  assert.equal(polishCalls, 0);
  const tidy = elements[0].children[0];
  tidy.onclick();
  assert.equal(polishCalls, 1);
  assert.equal(context.voiceAbort, null);
  assert.equal(budgets[1], 10000);
  target.value = "My manual edit";
  guard.edit();
  resolvePolish("Late rewritten words");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(target.value, "My manual edit");
});

test("view replacement disposes stale animation and clears stage chrome outside Together", async () => {
  const classes = new Map();
  let disposed = 0,
    cancelled = 0;
  const context = {
    typewriter: {
      dispose() {
        disposed++;
      },
    },
    cancelPolish() {
      cancelled++;
    },
    reduceMotion: true,
    state: { story: { scene: 1 } },
    tab: "together",
    document: {
      body: {
        classList: { toggle: (key, value) => classes.set(key, value) },
        dataset: {},
      },
      querySelectorAll: () => [],
    },
    syncLocale() {},
    renderTogether() {},
    renderMemories() {},
    renderWorld() {},
  };
  const render = await appFunction(
    "function render()",
    "function renderIntro()",
    context,
  );
  render();
  assert.equal(disposed, 1);
  assert.equal(context.typewriter, null);
  assert.equal(classes.get("stage-active"), true);
  assert.equal(classes.get("reduce-motion"), true);
  context.tab = "memories";
  render();
  assert.equal(classes.get("stage-active"), false);
  assert.equal(cancelled, 2);
});

test("ending a relationship requires an explicit second confirmation", async () => {
  let asked = 0,
    processing = 0;
  const context = {
    state: { story },
    busy: false,
    voice: null,
    voicePending: false,
    voiceAbort: null,
    locale: "en",
    canLeaveCompanionView: () => true,
    confirm: (message) => {
      asked++;
      assert.match(message, /end/i);
      assert.match(message, /conversations/i);
      return false;
    },
    cancelPolish: () => {
      processing++;
    },
    input: "",
  };
  const send = await appFunction(
    "async function send(choice)",
    "function renderMemories()",
    context,
  );
  await send({ id: "end-relationship", label: "End this relationship" });
  assert.equal(asked, 1);
  assert.equal(processing, 0);
});
test("history keeps confirmed narration separate from character speech", async () => {
  const main = { innerHTML: "" };
  const context = {
    state: {
      story: {
        ...story,
        memories: [],
        turns: [
          {
            id: "t1",
            role: "assistant",
            content: "I understand.",
            narration: "A little distance settles between them.",
          },
        ],
      },
    },
    locale: "en",
    t: (k) => k,
    esc: (s) => String(s ?? ""),
    $: () => main,
    document: { querySelectorAll: () => [] },
  };
  const render = await appFunction(
    "function renderMemories()",
    "function editMemory(",
    context,
  );
  render();
  assert.match(main.innerHTML, /class="history-narration"/);
  assert.match(main.innerHTML, /Narrator/);
  assert.ok(
    main.innerHTML.indexOf("A little distance") <
      main.innerHTML.indexOf("I understand."),
  );
});

test("initial meeting description is narrator context, never fabricated character speech", () => {
  const initial = {
    ...story,
    turns: [],
    relationship: { tone: "normal", ended: false, event: null },
    character: {
      ...story.character,
      opening: "在咖啡馆的窗边，你们第一次相遇。",
    },
  };
  const view = stageDialogue(initial, { locale: "zh" });
  assert.equal(view.companion.content, "");
  assert.equal(view.narrator.content, initial.character.opening);
  assert.equal(view.player.content, "");
});
test("an in-flight reply hides previously committed narration until its new event is known", () => {
  const pending = stageDialogue(story, {
    locale: "en",
    streaming: true,
    streamText: "I would like to",
  });
  assert.equal(pending.narrator.content, "");
  assert.equal(pending.companion.content, "I would like to");
  const waiting = stageDialogue(story, { locale: "en", streaming: true });
  assert.equal(waiting.narrator.content, "");
  assert.equal(waiting.companion.content, "");
  assert.equal(
    stageDialogue(story, { locale: "en" }).narrator.content,
    "The rain eases.",
  );
});

test('cafe setting takes precedence over weather mentioned in its title',()=>{
  assert.equal(chooseStageScene({...story,sceneTitles:['Rain at the café']}),'cafe');
  assert.equal(chooseStageScene({...story,sceneTitles:['雨中的咖啡馆']}),'cafe');
  assert.equal(chooseStageScene({...story,sceneTitles:['Rain at the station']}),'rain');
});
test('response drawer starts collapsed to preserve portrait and composer space',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../companion/app.js',import.meta.url),'utf8');
  assert.match(source,/responseDrawerOpen\s*=\s*false/);
});
