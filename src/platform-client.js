const JSON_HEADERS = Object.freeze({
  Accept: "application/json",
  "Content-Type": "application/json",
  "X-Game-Client": "same-origin",
});

export class PlatformError extends Error {
  constructor(message, { code = "request_failed", status = 0 } = {}) {
    super(message);
    this.name = "PlatformError";
    this.code = code;
    this.status = status;
  }
}

export class PlatformClient {
  #csrfToken = "";

  get csrfToken() {
    return this.#csrfToken || readCookie("__Host-game_csrf") || readCookie("game_csrf");
  }

  setCsrfToken(value) {
    this.#csrfToken = typeof value === "string" ? value : "";
  }

  async health() {
    return requestJSON("/api/health");
  }

  async me() {
    return requestJSON("/api/me");
  }

  async register(username, password) {
    const csrfToken = await this.#preAuthCsrf();
    const payload = await requestJSON("/api/auth/register", {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ username, password }),
    });
    this.setCsrfToken(payload.csrfToken);
    return payload;
  }

  async login(username, password) {
    const csrfToken = await this.#preAuthCsrf();
    const payload = await requestJSON("/api/auth/login", {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ username, password }),
    });
    this.setCsrfToken(payload.csrfToken);
    return payload;
  }

  async logout() {
    const payload = await requestJSON("/api/auth/logout", {
      method: "POST",
      headers: this.#writeHeaders(),
    });
    this.setCsrfToken("");
    return payload;
  }

  async setExternalAiConsent(accepted, policyVersion) {
    return requestJSON("/api/me/external-ai-consent", {
      method: "PUT",
      headers: this.#writeHeaders(),
      body: JSON.stringify({
        accepted: Boolean(accepted),
        ...(accepted ? { policyVersion } : {}),
      }),
    });
  }

  async knowledgeStatus() {
    return requestJSON("/api/me/knowledge");
  }

  async syncKnowledge(documents) {
    return requestJSON("/api/me/knowledge", {
      method: "PUT",
      headers: this.#writeHeaders(),
      body: JSON.stringify({ documents }),
    });
  }

  async clearKnowledge() {
    return requestJSON("/api/me/knowledge", {
      method: "DELETE",
      headers: this.#writeHeaders(),
    });
  }

  async streamAgent(messages, { onText, signal, channel, archiveText } = {}) {
    const normalizedMessages = normalizeAgentMessages(messages);
    const response = await fetch("/api/agent/stream", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: this.#writeHeaders({
        Accept: "text/event-stream",
      }),
      body: JSON.stringify({
        messages: normalizedMessages,
        ...(channel ? { channel } : {}),
        ...(archiveText ? { archiveText } : {}),
        locale: (() => {
          try {
            const stored = localStorage.getItem("game-locale");
            if (stored === "zh" || stored === "en") return stored;
            return window.__GAME_RUNTIME__?.locale || "en";
          } catch { return "en"; }
        })(),
      }),
      signal,
    });

    if (!response.ok) throw await responseError(response);
    if (!response.body) {
      throw new PlatformError("当前浏览器无法读取流式回应。", {
        code: "stream_unavailable",
        status: response.status,
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let complete = "";
    let sawDone = false;

    try {
      while (!sawDone) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || "";

        for (const event of events) {
          const lines = event.split(/\r?\n/);
          const eventType =
            lines.find((line) => line.startsWith("event:"))?.slice(6).trim() || "message";
          const data = lines
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (!data) continue;
          if (data === "[DONE]") {
            sawDone = true;
            continue;
          }

          let payload;
          try {
            payload = JSON.parse(data);
          } catch {
            continue;
          }
          if (eventType === "error") {
            throw new PlatformError(
              payload?.error?.message || "Agent 流式回应中断，请稍后重试。",
              {
                code: payload?.error?.code || "stream_failed",
                status: response.status,
              }
            );
          }
          const text = payload?.choices?.[0]?.delta?.content;
          if (typeof text !== "string" || !text) continue;
          complete += text;
          onText?.(text, complete);
        }

        if (done) break;
      }
      if (!sawDone) {
        throw new PlatformError("Agent 回应未完整结束，请稍后重试。", {
          code: "stream_incomplete",
          status: response.status,
        });
      }
    } catch (error) {
      if (error?.name === "AbortError" || error instanceof PlatformError) throw error;
      throw new PlatformError("Agent 流式回应中断，请稍后重试。", {
        code: "stream_incomplete",
        status: response.status,
      });
    } finally {
      try {
        await reader.cancel();
      } catch {
        // The upstream may already be closed.
      }
      reader.releaseLock();
    }

    return complete;
  }

  async organizeVoiceText(text, { signal } = {}) {
    const normalized = typeof text === "string" ? text.trim() : "";
    if (!normalized) {
      throw new PlatformError("没有可整理的语音文字。", { code: "voice_text_empty" });
    }
    const response = await fetch("/api/voice/organize", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: this.#writeHeaders({ Accept: "application/json" }),
      body: JSON.stringify({ text: normalized.slice(0, 4_000) }),
      signal,
    });
    if (!response.ok) throw await responseError(response);
    const payload = await response.json().catch(() => ({}));
    const organized = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!organized) {
      throw new PlatformError("文字整理服务没有返回内容。", {
        code: "voice_organize_empty",
      });
    }
    return organized;
  }

  async transcribeVoice(blob, { signal, priority = "final", language = "auto" } = {}) {
    if (!(blob instanceof Blob) || !blob.size) {
      throw new PlatformError("没有可识别的语音内容。", { code: "audio_empty" });
    }
    const audio = await blobToDataUrl(blob);
    const response = await fetch("/api/voice/asr", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: this.#writeHeaders({ Accept: "application/json" }),
      body: JSON.stringify({ audio, priority, language }),
      signal,
    });
    if (!response.ok) throw await responseError(response);
    const payload = await response.json().catch(() => ({}));
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) {
      throw new PlatformError("语音服务没有识别出文字。", { code: "asr_empty" });
    }
    return text;
  }

  // Compatibility for the legacy recorder: emit one completed transcript, not fake streaming.
  async streamTranscribeVoice(blob, {signal, onText, priority = "final", language = "auto"} = {}) {
    const text = await this.transcribeVoice(blob, {signal, priority, language});
    signal?.throwIfAborted();
    onText?.(text);
    return text;
  }

  #writeHeaders(extra = {}) {
    const csrfToken = this.csrfToken;
    return {
      ...JSON_HEADERS,
      ...extra,
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    };
  }

  async #preAuthCsrf() {
    const payload = await requestJSON("/api/auth/csrf");
    if (typeof payload.csrfToken !== "string" || !payload.csrfToken) {
      throw new PlatformError("无法建立安全登录会话，请稍后重试。", {
        code: "csrf_unavailable",
      });
    }
    return payload.csrfToken;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader !== "function") {
      void blob.arrayBuffer().then((buffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        const encoded = typeof btoa === "function"
          ? btoa(binary)
          : Buffer.from(binary, "binary").toString("base64");
        resolve(`data:${blob.type || "application/octet-stream"};base64,${encoded}`);
      }).catch(() => reject(new PlatformError("语音文件读取失败。", { code: "audio_read_failed" })));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new PlatformError("语音文件读取失败。", { code: "audio_read_failed" }));
    reader.readAsDataURL(blob);
  });
}

export function normalizeAgentMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1) {
    throw new PlatformError("请先写下要发送的内容。", {
      code: "invalid_messages",
    });
  }

  const candidates = messages.slice(-12).map((message) => {
    if (
      !message ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string"
    ) {
      throw new PlatformError("Agent 对话格式不正确。", {
        code: "invalid_message",
      });
    }
    const content = message.content.trim();
    if (!content || content.length > 12_000) {
      throw new PlatformError("单条 Agent 内容过长或为空。", {
        code: "invalid_message",
      });
    }
    return { role: message.role, content };
  });

  const encoder = new TextEncoder();
  const selected = [];
  let totalBytes = 0;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    const byteLength = encoder.encode(candidate.content).byteLength;
    if (totalBytes + byteLength > 64 * 1024) break;
    selected.unshift(candidate);
    totalBytes += byteLength;
  }
  if (!selected.length) {
    throw new PlatformError("本次 Agent 对话内容过长，请缩短后重试。", {
      code: "agent_input_too_large",
      status: 413,
    });
  }
  return selected;
}

async function requestJSON(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: {
      ...JSON_HEADERS,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw await responseError(response);
  return response.status === 204 ? {} : response.json();
}

async function responseError(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // The UI deliberately does not expose raw provider or server response bodies.
  }
  return new PlatformError(
    payload?.error?.message || statusMessage(response.status),
    {
      code: payload?.error?.code || "request_failed",
      status: response.status,
    }
  );
}

function statusMessage(status) {
  if (status === 401) return "登录已失效，请重新登录。";
  if (status === 403) return "当前账户尚未获得此功能权限。";
  if (status === 409) return "该用户名已被使用。";
  if (status === 429) return "操作太频繁，请稍后再试。";
  if (status >= 500) return "服务暂时不可用，请稍后重试。";
  return "请求未完成，请检查输入后重试。";
}

function readCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const entry = document.cookie.split("; ").find((value) => value.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : "";
}
