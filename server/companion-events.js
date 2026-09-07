import { createHash } from "node:crypto";

// Story-local deterministic randomness; never tied to visits, payments or message IDs.
function draw(seed, key) {
  return (
    createHash("sha256").update(`${seed}:${key}`).digest().readUInt32BE(0) /
    0x100000000
  );
}
export function createRelationship(seed) {
  const n = draw(seed, "temperament");
  return {
    seed,
    temperament: n < 0.25 ? "steady" : n < 0.85 ? "balanced" : "eventful",
    beat: 0,
    tone: "normal",
    tension: 0,
    ended: false,
    event: null,
  };
}
const moments = {
  normal: [
    [
      "你们把话题放回日常，暂时没有新的波折。",
      "The conversation returns to everyday life. Nothing needs to be resolved just now.",
    ],
    [
      "一段不必刻意填满的安静，让这次相处慢了下来。",
      "An unhurried silence gives this moment room to breathe.",
    ],
  ],
  sweet: [
    [
      "对方主动提出一个小小的邀约，把下一次见面放进了期待里。",
      "Your companion offers a small invitation, giving you something to look forward to.",
    ],
    [
      "对方准备分享一件生活里的小事，这一刻的距离近了一点。",
      "Your companion wants to share a small part of their day. The moment feels a little closer.",
    ],
  ],
  conflict: [
    [
      "关于下一次相处的安排，你们出现了不同期待。对方准备把自己的顾虑说清楚。",
      "Different expectations surface about your next time together. Your companion wants to explain their concern.",
    ],
    [
      "对方对这段关系的节奏有些不满。一次坦白的分歧，取代了客气的沉默。",
      "Your companion is unhappy with the pace of this relationship. An honest disagreement replaces polite silence.",
    ],
  ],
  painful: [
    [
      "对方生活中出现了新的变动，原本期待的相处需要推迟。失落来自现实，并不是谁的价值不够。",
      "A change in your companion’s life puts an anticipated moment on hold. The disappointment comes from circumstances, not anyone’s worth.",
    ],
    [
      "对方开始谈起彼此对未来的不同想法。喜欢仍在，不确定也确实存在。",
      "Your companion begins to discuss different hopes for the future. Affection and uncertainty can exist together.",
    ],
  ],
  repair: [
    [
      "你选择把分歧说清楚。对方愿意谈谈自己的感受，和解从认真听完开始，而不是立刻忘掉问题。",
      "You choose to talk through the disagreement. Your companion is willing to explain their feelings; repair begins with listening, not pretending the problem is gone.",
    ],
    [
      "你选择给彼此一点空间。这是一次明确的暂停，不是用失联惩罚对方。",
      "You choose to give each other some space. It is an agreed pause, not silence used as punishment.",
    ],
  ],
  breakup: [
    [
      "对方意识到自己想要的关系方向与你不同，决定在继续投入之前告别。这段故事到此结束，已有回忆会保留。",
      "Your companion realizes they want a different kind of relationship and chooses to part before going further. This story ends here; its memories remain.",
    ],
    [
      "对方的生活计划发生变化，选择结束这段关系。这不是对你的评价，也没有必须挽回的任务。",
      "A change in your companion’s life plans leads them to end the relationship. This is not a judgment of you, or a task you must undo.",
    ],
  ],
};
export function advanceRelationship(
  current,
  { opportunity = false, choiceId } = {},
) {
  if (current.ended) return current;
  const r = { ...current, beat: current.beat + 1 };
  let kind = null;
  if (choiceId === "end-relationship") kind = "breakup";
  else if (
    ["talk-it-through", "give-space"].includes(choiceId) &&
    ["conflict", "painful"].includes(r.tone)
  )
    kind = "repair";
  else if (opportunity || r.beat % 3 === 0) {
    const weights =
      r.temperament === "steady"
        ? [
            ["normal", 60],
            ["sweet", 40],
          ]
        : r.temperament === "eventful"
          ? [
              ["normal", 42],
              ["sweet", 28],
              ["conflict", 15],
              ["painful", 10],
              ["breakup", 5],
            ]
          : [
              ["normal", 58],
              ["sweet", 27],
              ["conflict", 8],
              ["painful", 5],
              ["breakup", 2],
            ];
    // Unresolved tension influences the next episode, not every line of dialogue.
    if (r.temperament !== "steady" && r.tension > 0) {
      weights[0][1] -= r.tension * 2;
      weights[2][1] += r.tension * 2;
    }
    let value = draw(r.seed, `event:${r.beat}`) * 100;
    kind = weights.find(([, weight]) => (value -= weight) < 0)?.[0] || "normal";
  }
  if (!kind) return r;
  const variants = moments[kind];
  let index = Math.floor(draw(r.seed, `variant:${r.beat}`) * variants.length);
  if (kind === "repair") index = choiceId === "give-space" ? 1 : 0;
  let [zh, en] = variants[index];
  if (choiceId === "end-relationship") {
    zh = "你选择结束这段关系。告别不需要证明谁更好，这段故事与回忆会被保留。";
    en =
      "You choose to end the relationship. Parting does not require deciding who was better. This story and its memories remain.";
  }
  return {
    ...r,
    tone: kind,
    ended: kind === "breakup",
    tension: ["conflict", "painful"].includes(kind)
      ? Math.min(3, r.tension + 1)
      : kind === "repair"
        ? Math.max(0, r.tension - 1)
        : r.tension,
    event: { id: `episode-${r.beat}`, kind, narration: { zh, en } },
  };
}
export function publicRelationship(r) {
  const { seed, temperament, ...visible } = r;
  return visible;
}
