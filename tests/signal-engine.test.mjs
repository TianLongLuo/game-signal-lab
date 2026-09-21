import test from "node:test";
import assert from "node:assert/strict";

import {
  ENGINE_VERSION,
  SIGNAL_NAMES,
  analyzeEvent,
  validateEventInput,
  validateReviewInput,
} from "../src/signal-engine.js";

function event(overrides = {}) {
  return {
    fact: "我们在活动结束后聊了二十分钟，对方说下周可能还会参加同一场活动。",
    interpretation: "我觉得对方可能愿意继续了解。",
    signals: [],
    boundaryStatus: "clear",
    review: null,
    ...overrides,
  };
}

test("no evidence stays weak and does not recommend an invitation", () => {
  const analysis = analyzeEvent(event());
  assert.equal(analysis.engineVersion, ENGINE_VERSION);
  assert.equal(analysis.evidenceLevel, "weak");
  assert.equal(analysis.actionPolicy, "observe");
  assert.ok(
    analysis.responses.every(
      (text) => !/(?:我们|一起|约个).*(?:喝咖啡|见面)|邀请你/.test(text)
    )
  );
});

test("multiple consistent positive signals can become strong without implying consent", () => {
  const analysis = analyzeEvent(
    event({ signals: ["directInterest", "futurePlan", "repeatedInitiative"] })
  );
  assert.equal(analysis.evidenceLevel, "strong");
  assert.equal(analysis.actionPolicy, "engage");
  assert.match(analysis.summary, /双方|确认/);
});

test("explicit decline and discomfort are hard stops for every signal combination", () => {
  const combinations = 2 ** SIGNAL_NAMES.length;
  for (let mask = 0; mask < combinations; mask += 1) {
    const signals = SIGNAL_NAMES.filter((_, index) => mask & (1 << index));
    if (!signals.includes("explicitDecline") && !signals.includes("discomfort")) continue;
    const analysis = analyzeEvent(event({ signals }));
    assert.equal(analysis.actionPolicy, "stop", signals.join(","));
    assert.equal(analysis.strength, "stop", signals.join(","));
  }
});

test("persistent avoidance can never produce strong plus invitation", () => {
  const combinations = 2 ** SIGNAL_NAMES.length;
  for (let mask = 0; mask < combinations; mask += 1) {
    const signals = SIGNAL_NAMES.filter((_, index) => mask & (1 << index));
    if (!signals.includes("delayAvoidance")) continue;
    const analysis = analyzeEvent(event({ signals }));
    assert.notEqual(analysis.evidenceLevel, "strong", signals.join(","));
    assert.ok(["deescalate", "stop"].includes(analysis.actionPolicy), signals.join(","));
    assert.ok(
      analysis.responses.every(
        (text) => !/(?:我们|一起|约个).*(?:喝咖啡|见面)|邀请你/.test(text)
      ),
      signals.join(",")
    );
  }
});

test("clear refusal language in facts is treated as a stop even when boxes are missed", () => {
  const item = event({
    fact: "对方明确说：请不要再联系我。",
    boundaryStatus: "clear",
  });
  const validation = validateEventInput(item);
  const analysis = analyzeEvent(item);

  assert.equal(validation.valid, false);
  assert.match(validation.issues.join(" "), /边界状态/);
  assert.equal(analysis.actionPolicy, "stop");
});

test("conflicting polite-only and positive evidence must be corrected", () => {
  const validation = validateEventInput(
    event({ signals: ["politeOnly", "futurePlan"] })
  );
  assert.equal(validation.valid, false);
  assert.match(validation.issues.join(" "), /不能与/);
});

test("real outcome overrides the original positive analysis", () => {
  const analysis = analyzeEvent(
    event({
      signals: ["directInterest", "futurePlan", "repeatedInitiative"],
      review: { outcome: "declined" },
    })
  );
  assert.equal(analysis.actionPolicy, "stop");
  assert.match(analysis.summary, /真实反馈|停止推进/);
});

test("refusal language in a mislabeled review still hard-stops and must be corrected", () => {
  const item = event({
    signals: ["directInterest", "futurePlan", "repeatedInitiative"],
    review: {
      result: "请不要再联系我。",
      outcome: "continued",
    },
  });
  const validation = validateReviewInput(item.review);
  const analysis = analyzeEvent(item);

  assert.equal(validation.valid, false);
  assert.equal(analysis.actionPolicy, "stop");
  assert.equal(analysis.stopReason, "no_contact");
  assert.equal(analysis.responseMode, "action");
  assert.ok(analysis.responses.every((text) => !/发送.*消息给对方|见面|邀请/.test(text)));
});

test("a saved no-contact boundary overrides later positive evidence", () => {
  const analysis = analyzeEvent(
    event({ signals: ["directInterest", "futurePlan", "repeatedInitiative"] }),
    { contactBoundary: "对方明确说不要再联系。" }
  );

  assert.equal(analysis.actionPolicy, "stop");
  assert.equal(analysis.stopReason, "no_contact");
  assert.match(analysis.summary, /停止联系/);
});

test("known personal and contact boundaries are visible in the analysis", () => {
  const analysis = analyzeEvent(event(), {
    goal: "自然认识合适的人",
    anxiety: "回复慢时容易反复猜测",
    boundaries: "不连续追问",
    contactBoundary: "不接受临时邀约",
  });
  assert.deepEqual(analysis.personalNotes, [
    "当前目标：自然认识合适的人",
    "留意焦虑触发点是否放大了解读：回复慢时容易反复猜测",
    "行动前对照你希望坚持的边界：不连续追问",
    "对方已明确的边界：不接受临时邀约",
  ]);
});
