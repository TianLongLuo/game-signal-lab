// Presentation only. These helpers never advance server-owned scenes or relationship state.
const TONES = new Set([
  "normal",
  "sweet",
  "conflict",
  "painful",
  "repair",
  "breakup",
]);
export function chooseStageScene(story) {
  const classify = (text) => {
    // Venue takes precedence: rain outside a café does not move the scene outdoors.
    if (/咖啡|茶馆|café|cafe|coffee/iu.test(text)) return "cafe";
    if (/雨|rain|storm|车站|station/iu.test(text)) return "rain";
    if (/海|沙滩|岸边|coast|sea|beach|ocean/iu.test(text)) return "coast";
    if (/花园|庭院|公园|garden|park|leaf|leaves/iu.test(text)) return "garden";
    if (/家|客厅|厨房|home|apartment|kitchen/iu.test(text)) return "home";
    return null;
  };
  return (
    classify(story.sceneTitles?.[story.scene] || "") ||
    classify(story.character?.world || "") ||
    ["cafe", "garden", "home"][Math.max(0, Math.min(2, story.scene || 0))]
  );
}
export function stageDialogue(
  story,
  {
    locale = "zh",
    pendingPlayerText = "",
    streamText = "",
    streaming = false,
  } = {},
) {
  const en = locale === "en";
  const inFlight = streaming || Boolean(streamText);
  const lastReply = story.turns
    ?.filter((turn) => turn.role === "assistant")
    .at(-1);
  const initialOpening =
    (story.turns?.length || 0) === 0 ? story.character?.opening || "" : "";
  return {
    player: {
      label: en ? "You" : "主角 · 你",
      content:
        pendingPlayerText ||
        story.turns?.filter((turn) => turn.role === "user").at(-1)?.content ||
        "",
    },
    companion: {
      label: story.character?.name || (en ? "Companion" : "对象"),
      content: inFlight ? streamText : lastReply?.content || "",
    },
    narrator: {
      label: en ? "Narrator" : "旁白",
      content: inFlight
        ? ""
        : story.relationship?.event?.narration?.[locale] || initialOpening,
    },
    tone: TONES.has(story.relationship?.tone)
      ? story.relationship.tone
      : "normal",
    ended: story.relationship?.ended === true,
  };
}
export function atmosphereSvg(sceneId, tone = "normal") {
  const scene = ["cafe", "rain", "home", "coast", "garden"].includes(sceneId)
    ? sceneId
    : "cafe";
  const mood = TONES.has(tone) ? tone : "normal";
  const rain = Array.from(
    { length: 34 },
    (_, i) =>
      `<path style="--delay:-${(i % 9) * 0.31}s;--duration:${1 + (i % 4) * 0.3}s" d="M${(i * 73) % 1480} ${(i * 137) % 800} l-15 42"/>`,
  ).join("");
  const dust = Array.from(
    { length: 22 },
    (_, i) =>
      `<circle style="--delay:-${i * 0.8}s" cx="${(i * 181 + 80) % 1440}" cy="${(i * 127 + 90) % 900}" r="${1 + (i % 3)}"/>`,
  ).join("");
  const leaves = Array.from(
    { length: 9 },
    (_, i) =>
      `<path style="--delay:-${i * 1.9}s" transform="translate(${i * 175},${(i * 97) % 650}) rotate(${i * 23})" d="M0 0 Q22 -16 30 0 Q10 16 0 0"/>`,
  ).join("");
  let shapes;
  if (scene === "rain")
    shapes = `<g class="scene-rain" stroke="#e7effb" stroke-width="1" opacity=".3">${rain}</g>`;
  else if (scene === "coast")
    shapes =
      '<g class="scene-waves" fill="none" stroke="#e8f3ee" opacity=".25"><path d="M-180 670 Q0 630 180 670 T540 670 T900 670 T1260 670 T1620 670"/><path d="M-180 710 Q0 670 180 710 T540 710 T900 710 T1260 710 T1620 710"/></g>';
  else if (scene === "garden")
    shapes = `<g class="scene-leaves" fill="#c8ddbc" opacity=".3">${leaves}</g>`;
  else
    shapes = `<g class="scene-particles" fill="${scene === "home" ? "#e9cfab" : "#f4e6cd"}" opacity=".4">${dust}</g>`;
  return `<svg class="stage-atmosphere mood-${mood}" data-atmosphere="${scene}" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${shapes}</svg>`;
}
export class TypewriterText {
  constructor(
    render,
    {
      reducedMotion = false,
      schedule = (fn) => setTimeout(fn, 24),
      cancel = (id) => clearTimeout(id),
    } = {},
  ) {
    this.render = render;
    this.schedule = schedule;
    this.cancel = cancel;
    this.reducedMotion = reducedMotion;
    this.target = "";
    this.visible = 0;
    this.timer = null;
    this.generation = 0;
    this.instant = false;
    this.disposed = false;
  }
  append(fragment) {
    if (this.disposed) return;
    this.target += fragment;
    if (this.instant || this.reducedMotion) {
      this.visible = Array.from(this.target).length;
      this.render(this.target);
      return;
    }
    this.tickSoon();
  }
  tickSoon() {
    if (this.timer !== null || this.disposed) return;
    const generation = this.generation;
    this.timer = this.schedule(() => {
      if (this.disposed || generation !== this.generation) return;
      this.timer = null;
      const chars = Array.from(this.target);
      this.visible = Math.min(
        chars.length,
        this.visible +
          Math.max(1, Math.floor((chars.length - this.visible) / 60)),
      );
      this.render(chars.slice(0, this.visible).join(""));
      if (this.visible < chars.length) this.tickSoon();
    });
  }
  flush() {
    if (this.disposed) return;
    this.instant = true;
    this.generation++;
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    this.visible = Array.from(this.target).length;
    this.render(this.target);
  }
  reset() {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    this.generation++;
    this.target = "";
    this.visible = 0;
    this.instant = false;
    this.render("");
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
  }
}
