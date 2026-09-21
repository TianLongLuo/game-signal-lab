export class CompanionClient {
  constructor(platform, fetcher = globalThis.fetch.bind(globalThis)) {
    this.platform = platform;
    this.fetcher = fetcher;
  }
  async request(
    path = "",
    { method = "GET", body, signal, stream = false } = {},
  ) {
    const response = await this.fetcher(`/api/companion${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal,
      headers: {
        Accept: stream ? "text/event-stream" : "application/json",
        "Content-Type": "application/json",
        "X-Game-Client": "same-origin",
        ...(method !== "GET"
          ? { "X-CSRF-Token": this.platform.csrfToken }
          : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const p = await response.json().catch(() => ({}));
      throw Object.assign(
        new Error(p.error?.message || `Request failed (${response.status})`),
        { code: p.error?.code, status: response.status },
      );
    }
    return stream ? response : response.json();
  }
  async turn(id, body, { signal, onText } = {}) {
    const r = await this.request(`/stories/${encodeURIComponent(id)}/turn`, {
      method: "POST",
      body,
      signal,
      stream: true,
    });
    return readCompanionStream(r.body, onText);
  }
}
export async function readCompanionStream(body, onText = () => {}) {
  if (!body) throw new Error("Stream unavailable");
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    story = null,
    count = 0;
  function event(raw) {
    const lines = raw.split(/\r?\n/);
    const type = lines
      .find((l) => l.startsWith("event:"))
      ?.slice(6)
      .trim();
    const data = lines
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    const p = JSON.parse(data);
    if (type === "error")
      throw Object.assign(
        new Error(p.message || p.error?.message || "Stream failed"),
        { code: p.code },
      );
    if (type === "done") {
      if (++count !== 1 || !p.story?.id)
        throw new Error("Invalid stream completion");
      story = p.story;
    } else if (type === "delta") {
      if (count || typeof p.text !== "string")
        throw new Error("Invalid stream delta");
      onText(p.text);
    }
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      let match;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        event(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
      }
      if (done) break;
    }
    if (buffer.trim() || count !== 1)
      throw new Error("Incomplete reply. Your draft is preserved.");
    return story;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export class VoiceDraftGuard {
  constructor() {
    this.epoch = 0;
    this.revision = 0;
  }
  begin(base) {
    return { epoch: ++this.epoch, revision: this.revision, base };
  }
  edit() {
    this.revision++;
  }
  cancel() {
    this.epoch++;
  }
  finish(token, text) {
    if (token.epoch !== this.epoch || token.revision !== this.revision)
      return null;
    this.epoch++;
    return [token.base.trim(), text.trim()].filter(Boolean).join("\n");
  }
}
export function encodeWav(chunks, sampleRate) {
  const length = chunks.reduce((n, c) => n + c.length, 0);
  const buffer = new ArrayBuffer(44 + length * 2),
    v = new DataView(buffer);
  const str = (o, s) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, length * 2, true);
  let at = 44;
  for (const chunk of chunks)
    for (const sample of chunk) {
      const s = Math.max(-1, Math.min(1, sample));
      v.setInt16(at, s < 0 ? s * 32768 : s * 32767, true);
      at += 2;
    }
  return buffer;
}
// Cleanup may add punctuation, but a short partial result must not erase a full recording.
export function preserveVoiceTranscript(raw, polished) {
  const clean = (s) => s.replace(/[\p{P}\p{Z}\s]/gu, "");
  return typeof polished === "string" &&
    clean(polished).length >= clean(raw).length * 0.85
    ? polished
    : raw;
}

export function canLeaveCompanionView({
  busy = false,
  recording = false,
  transcribing = false,
} = {}) {
  return !busy && !recording && !transcribing;
}
export function resolveCompanionLocale(path, stored) {
  const explicit = path.match(/^\/(en|zh)(?:\/|$)/)?.[1];
  return explicit || (stored === "en" ? "en" : "zh");
}
export class ImageRequestLedger {
  constructor(storage) {
    this.storage = storage;
    this.pending = new Map();
  }
  begin(key) {
    if (this.pending.has(key)) return this.pending.get(key);
    let id;
    try {
      id = this.storage?.getItem(`companion-image-request:${key}`);
    } catch {}
    if (!id || !/^[\da-f-]{36}$/i.test(id)) id = crypto.randomUUID();
    this.pending.set(key, id);
    try {
      this.storage?.setItem(`companion-image-request:${key}`, id);
    } catch {}
    return id;
  }
  acknowledge(key) {
    this.pending.delete(key);
    try {
      this.storage?.removeItem(`companion-image-request:${key}`);
    } catch {}
  }
}
