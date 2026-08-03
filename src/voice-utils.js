const SENTENCE_END = /[。！？!?；;\n]/g;

export function normalizeAssistantText(value) {
  if (typeof value !== "string" || !value) return "";
  return value
    .replace(/```(?:\w+)?\s*/g, "")
    .replace(/```/g, "")
    .replace(/\[([^\]]+)\]\([^\s)]+\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+[.)、])\s*/gm, "")
    .replace(/[\u201c\u201d\u2018\u2019\u300c\u300d\u300e\u300f"`*_~]/giu, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function appendVoiceTranscript(baseText, nextText) {
  const base = typeof baseText === "string" ? baseText.trim() : "";
  let next = typeof nextText === "string" ? nextText.trim() : "";
  if (!base) return next;
  if (!next) return base;
  if (next.startsWith(base)) return next;
  if (base.endsWith(next)) return base;

  const overlapLimit = Math.min(base.length, next.length, 160);
  for (let size = overlapLimit; size >= 2; size -= 1) {
    if (base.slice(-size) === next.slice(0, size)) {
      return `${base}${next.slice(size)}`;
    }
  }

  if (/[。！？!?；;，,：:]$/u.test(base) && /^[。！？!?；;，,：:]+/u.test(next)) {
    next = next.replace(/^[。！？!?；;，,：:]+/u, "");
  }

  const separator = /[\s。！？!?；;，,：:]$/u.test(base) ? "" : " ";
  return `${base}${separator}${next}`;
}

/**
 * Return only the portion of `correctedText` that is genuinely new compared
 * with `previousAsrText`. Used to append incremental ASR results to the
 * input box WITHOUT rebuilding or rewriting text the user already has.
 * Falls back to the whole corrected text when no overlap can be found.
 */
export function extractNewTranscript(previousAsrText, correctedText) {
  const previous = typeof previousAsrText === "string" ? previousAsrText.trim() : "";
  const corrected = typeof correctedText === "string" ? correctedText.trim() : "";
  if (!previous) return corrected;
  if (!corrected) return "";
  if (corrected.startsWith(previous)) return corrected.slice(previous.length).trimStart();
  if (previous.endsWith(corrected)) return "";

  const overlapLimit = Math.min(previous.length, corrected.length, 160);
  for (let size = overlapLimit; size >= 2; size -= 1) {
    if (previous.slice(-size) === corrected.slice(0, size)) {
      return corrected.slice(size).trimStart();
    }
  }
  return corrected;
}

export function mergeCumulativeVoiceTranscript({
  baseText = "",
  correctedText = "",
  requestText = "",
  currentText = "",
  maxLength = 2_400,
} = {}) {
  const stable = appendVoiceTranscript(baseText, correctedText);
  const requested = typeof requestText === "string" ? requestText : "";
  const current = typeof currentText === "string" ? currentText : "";
  const newerTail = requested && current.startsWith(requested)
    ? current.slice(requested.length)
    : "";
  return appendVoiceTranscript(stable, newerTail).slice(0, maxLength);
}

export function reconcileCumulativeAsrText(previousText, correctedText) {
  const previous = typeof previousText === "string" ? previousText.trim() : "";
  const corrected = typeof correctedText === "string" ? correctedText.trim() : "";
  if (!previous) return corrected;
  if (!corrected) return previous;
  if (corrected.startsWith(previous)) return corrected;
  if (previous.startsWith(corrected) || previous.includes(corrected)) return previous;

  let sharedPrefix = 0;
  const shortest = Math.min(previous.length, corrected.length);
  while (sharedPrefix < shortest && previous[sharedPrefix] === corrected[sharedPrefix]) {
    sharedPrefix += 1;
  }
  if (sharedPrefix >= Math.min(12, Math.floor(shortest * 0.45))) {
    return corrected.length >= previous.length * 0.7 ? corrected : previous;
  }
  return appendVoiceTranscript(previous, corrected);
}

export function extractCompletedSpeechChunks(buffer, { flush = false, maxChunkLength = 180 } = {}) {
  const source = typeof buffer === "string" ? buffer : "";
  const chunks = [];
  const pushText = (value) => {
    let text = normalizeAssistantText(value);
    while (text) {
      if (text.length <= maxChunkLength) {
        chunks.push(text);
        break;
      }
      const window = text.slice(0, maxChunkLength + 1);
      const comma = Math.max(window.lastIndexOf("，"), window.lastIndexOf(","));
      const cut = comma >= Math.floor(maxChunkLength * 0.55) ? comma + 1 : maxChunkLength;
      chunks.push(text.slice(0, cut));
      text = text.slice(cut).trim();
    }
  };
  let consumed = 0;
  let match;
  SENTENCE_END.lastIndex = 0;
  while ((match = SENTENCE_END.exec(source))) {
    const end = match.index + match[0].length;
    pushText(source.slice(consumed, end));
    consumed = end;
  }

  let remainder = source.slice(consumed);
  while (!flush && remainder.length > maxChunkLength) {
    const window = remainder.slice(0, maxChunkLength + 1);
    const comma = Math.max(window.lastIndexOf("，"), window.lastIndexOf(","));
    const cut = comma >= Math.floor(maxChunkLength * 0.55) ? comma + 1 : maxChunkLength;
    pushText(remainder.slice(0, cut));
    remainder = remainder.slice(cut);
  }
  if (flush) {
    pushText(remainder);
    remainder = "";
  }
  return { chunks, remainder };
}

export function encodeMonoWav(chunks, inputSampleRate, targetSampleRate = 16_000) {
  const safeChunks = Array.isArray(chunks)
    ? chunks.filter((chunk) => chunk instanceof Float32Array && chunk.length)
    : [];
  const inputLength = safeChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (!inputLength || !Number.isFinite(inputSampleRate) || inputSampleRate <= 0) {
    return new Blob([], { type: "audio/wav" });
  }

  const input = new Float32Array(inputLength);
  let offset = 0;
  for (const chunk of safeChunks) {
    input.set(chunk, offset);
    offset += chunk.length;
  }

  const outputRate = Math.min(inputSampleRate, targetSampleRate);
  const ratio = inputSampleRate / outputRate;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const samples = new Float32Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.max(start + 1, Math.min(input.length, Math.floor((index + 1) * ratio)));
    let sum = 0;
    for (let cursor = start; cursor < end; cursor += 1) sum += input[cursor];
    samples[index] = sum / (end - start);
  }

  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const writeAscii = (position, text) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(position + index, text.charCodeAt(index));
    }
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, outputRate, true);
  view.setUint32(28, outputRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([bytes], { type: "audio/wav" });
}
