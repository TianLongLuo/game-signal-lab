import test from "node:test";
import assert from "node:assert/strict";
import {
  readCompanionStream,
  VoiceDraftGuard,
  encodeWav,
  CompanionClient,
} from "../src/companion-client.js";
const stream = (s, width = 1) =>
  new ReadableStream({
    start(c) {
      const b = new TextEncoder().encode(s);
      for (let i = 0; i < b.length; i += width)
        c.enqueue(b.slice(i, i + width));
      c.close();
    },
  });
test("SSE survives byte fragmentation, unicode and CRLF", async () => {
  let text = "";
  const story = { id: "s", version: 2 };
  const result = await readCompanionStream(
    stream(
      ': heartbeat\r\n\r\nevent: delta\r\ndata: {"text":"你好🌙"}\r\n\r\nevent: done\r\ndata: ' +
        JSON.stringify({ story }) +
        "\r\n\r\n",
    ),
    (t) => (text += t),
  );
  assert.equal(text, "你好🌙");
  assert.deepEqual(result, story);
});
test("SSE requires exactly one completed done; rejects malformed and error events", async () => {
  for (const s of [
    'event: delta\ndata: {"text":"x"}\n\n',
    "event: done\ndata: {}\n\n",
    "event: delta\ndata: nope\n\n",
    'event: error\ndata: {"code":"quota","message":"No quota"}\n\n',
    'event: done\ndata: {"story":{"id":"s"}}\n\nevent: done\ndata: {"story":{"id":"s"}}\n\n',
  ])
    await assert.rejects(() => readCompanionStream(stream(s, 3)));
});
test("voice never overwrites manual edits, cancelled or newer recordings", () => {
  const g = new VoiceDraftGuard();
  const a = g.begin("existing");
  assert.equal(g.finish(a, "spoken"), "existing\nspoken");
  const b = g.begin("draft");
  g.edit();
  assert.equal(g.finish(b, "late"), null);
  const c = g.begin("x");
  g.cancel();
  assert.equal(g.finish(c, "late"), null);
  const d = g.begin("old");
  const e = g.begin("new");
  assert.equal(g.finish(d, "stale"), null);
  assert.equal(g.finish(e, "fresh"), "new\nfresh");
});
test("PCM encoded as mono PCM WAV with clamped samples", () => {
  const b = encodeWav([new Float32Array([-2, 0, 2])], 16000);
  const v = new DataView(b);
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint32(40, true), 6);
  assert.equal(v.getInt16(44, true), -32768);
  assert.equal(v.getInt16(48, true), 32767);
});
test("writes use same-origin credentials and platform CSRF", async () => {
  let options;
  const c = new CompanionClient({ csrfToken: "csrf" }, async (url, o) => {
    options = o;
    assert.equal(url, "/api/companion/consent");
    return new Response('{"consent":true}');
  });
  await c.request("/consent", { method: "PUT", body: { accepted: true } });
  assert.equal(options.credentials, "same-origin");
  assert.equal(options.headers["X-CSRF-Token"], "csrf");
});
test("all fragment widths preserve multiline data and exactly completed story", async () => {
  const source =
    'event: delta\ndata: {"text":\ndata: "夜色"}\n\nevent: done\ndata: {"story":{"id":"s","version":9}}\n\n';
  for (let width = 1; width < 30; width++) {
    let text = "";
    assert.equal(
      (await readCompanionStream(stream(source, width), (s) => (text += s)))
        .version,
      9,
    );
    assert.equal(text, "夜色");
  }
});
test("voice raw draft survives cancelled punctuation and manual edits invalidate polishing", () => {
  const g = new VoiceDraftGuard();
  const raw = g.finish(g.begin("Before"), "Raw sentence");
  assert.equal(raw, "Before\nRaw sentence");
  const polish = g.begin("Before");
  g.cancel();
  assert.equal(g.finish(polish, "Late polished"), null);
  const next = g.begin("Before");
  g.edit();
  assert.equal(g.finish(next, "Replaces manual edit"), null);
  assert.equal(raw, "Before\nRaw sentence");
});
test("stream reader cancellation occurs on parse failure", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode("event: delta\ndata: invalid\n\n"));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(() => readCompanionStream(body));
  assert.equal(cancelled, true);
});
test("short punctuation result cannot erase a longer original transcript", async () => {
  const { preserveVoiceTranscript } = await import(
    "../src/companion-client.js"
  );
  assert.equal(
    preserveVoiceTranscript(
      "A long complete thought about our meeting tomorrow.",
      "A long",
    ),
    "A long complete thought about our meeting tomorrow.",
  );
  assert.equal(
    preserveVoiceTranscript("hello there", "Hello, there."),
    "Hello, there.",
  );
});

test("navigation is guarded throughout turn, capture and transcription", async () => {
  const { canLeaveCompanionView } = await import("../src/companion-client.js");
  for (const active of [
    { busy: true },
    { recording: true },
    { transcribing: true },
  ])
    assert.equal(canLeaveCompanionView(active), false);
  assert.equal(canLeaveCompanionView({}), true);
});
test("explicit locale path wins over stored preference", async () => {
  const { resolveCompanionLocale } = await import("../src/companion-client.js");
  assert.equal(resolveCompanionLocale("/en/", "zh"), "en");
  assert.equal(resolveCompanionLocale("/zh/", "en"), "zh");
  assert.equal(resolveCompanionLocale("/companion/", "en"), "en");
});
test("lost image acknowledgement reuses same id even after reload", async () => {
  const { ImageRequestLedger } = await import("../src/companion-client.js");
  const values = new Map();
  const storage = {
    getItem: (k) => values.get(k),
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  const first = new ImageRequestLedger(storage);
  const id = first.begin("story:portrait:0");
  assert.equal(first.begin("story:portrait:0"), id);
  const reloaded = new ImageRequestLedger(storage);
  assert.equal(reloaded.begin("story:portrait:0"), id);
  reloaded.acknowledge("story:portrait:0");
  assert.notEqual(reloaded.begin("story:portrait:0"), id);
});

test("portrait picker renders all 20 lazy choices without implicitly selecting art", async () => {
  const { readFile } = await import("node:fs/promises");
  const { runInNewContext } = await import("node:vm");
  const source = await readFile(
    new URL("../companion/app.js", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("function portraitPickerMarkup(");
  assert.ok(start >= 0, "the gallery has an independently testable renderer");
  const end = source.indexOf("\nfunction bindPortraitPicker(", start);
  const render = runInNewContext(`(${source.slice(start, end)})`, {
    esc: (s) => String(s ?? "").replaceAll('"', "&quot;"),
  });
  const presets = Array.from({ length: 20 }, (_, i) => ({
    id: `portrait-${String(i + 1).padStart(2, "0")}`,
    zh: `人物 ${i + 1}`,
    en: `Character ${i + 1}`,
    thumbnail: `/companion/presets/${i + 1}.jpg`,
  }));
  const html = render(presets, null, { lang: "en", scope: "draft" });
  assert.equal((html.match(/loading="lazy"/g) || []).length, 20);
  assert.equal((html.match(/type="button"/g) || []).length, 21);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(html, /data-preset-id="" aria-pressed="true"/);
  assert.match(html, /Character 20/);
  const selected = render(presets, "portrait-03", {
    lang: "zh",
    scope: "world",
    disabled: true,
  });
  assert.match(selected, /data-preset-id="portrait-03" aria-pressed="true"/);
  assert.match(selected, /人物 20/);
  assert.equal((selected.match(/ disabled/g) || []).length, 21);
});

test("portrait selection is local until Apply and blocked while a turn is active", async () => {
  const { readFile } = await import("node:fs/promises");
  const { runInNewContext } = await import("node:vm");
  const source = await readFile(
    new URL("../companion/app.js", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("function bindPortraitPicker(");
  const end = source.indexOf("\nfunction renderWorldPortraitPicker(", start);
  let listener, selectedId;
  const options = ["", "portrait-02"].map((id) => ({
    dataset: { presetId: id },
    disabled: false,
    setAttribute(name, value) {
      this[name] = value;
    },
  }));
  const picker = {
    contains: (button) => options.includes(button),
    addEventListener(type, handler) {
      listener = handler;
    },
    querySelectorAll: () => options,
  };
  const context = {
    document: { querySelector: () => picker },
    busy: false,
    imageEnqueueing: false,
    voice: null,
    voicePending: false,
    voiceAbort: null,
    canLeaveCompanionView: ({ busy, recording, transcribing }) =>
      !busy && !recording && !transcribing,
    getPortraitPreset: (id) => (id === "portrait-02" ? { id } : null),
  };
  const bind = runInNewContext(`(${source.slice(start, end)})`, context);
  bind("world", (id) => {
    selectedId = id;
  });
  listener({ target: { closest: () => options[1] } });
  assert.equal(selectedId, "portrait-02");
  assert.equal(options[1]["aria-pressed"], "true");
  assert.equal(options[0]["aria-pressed"], "false");
  context.busy = true;
  listener({ target: { closest: () => options[0] } });
  assert.equal(selectedId, "portrait-02");
  context.busy = false;
  listener({ target: { closest: () => options[0] } });
  assert.equal(selectedId, null);
});
