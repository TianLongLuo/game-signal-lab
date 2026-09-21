import test from "node:test";
import assert from "node:assert/strict";
import {
  createRelationship,
  advanceRelationship,
} from "../server/companion-events.js";

test("the same saved state produces the same event, independent of retry IDs", () => {
  const r = createRelationship("fiction-0");
  const a = advanceRelationship(r, { opportunity: true });
  assert.deepEqual(a, advanceRelationship(r, { opportunity: true }));
  assert.equal(r.beat, 0);
  assert.equal(a.beat, 1);
});
test("peaceful trajectories and early separation both occur across independent stories", () => {
  let peaceful = 0,
    early = 0;
  const kinds = new Set();
  for (let n = 0; n < 400; n++) {
    let r = createRelationship(`fiction-${n}`);
    const steady = r.temperament === "steady";
    let argued = false;
    for (let i = 0; i < 40 && !r.ended; i++) {
      r = advanceRelationship(r, { opportunity: true });
      kinds.add(r.tone);
      if (["conflict", "painful", "breakup"].includes(r.tone)) argued = true;
      if (r.ended && i < 3) early++;
    }
    if (steady) {
      assert.equal(argued, false);
      peaceful++;
    }
  }
  assert.ok(peaceful > 30);
  assert.ok(early > 0);
  for (const k of ["normal", "sweet", "conflict", "painful", "breakup"])
    assert.ok(kinds.has(k));
});
test("ordinary lines do not reroll current episode and active conflict supports repair", () => {
  let r = {
    ...createRelationship("x"),
    tone: "conflict",
    tension: 2,
    event: { id: "e" },
  };
  r = advanceRelationship(r, {});
  assert.equal(r.tone, "conflict");
  assert.equal(r.event.id, "e");
  r = advanceRelationship(r, { choiceId: "talk-it-through" });
  assert.equal(r.tone, "repair");
  assert.equal(r.ended, false);
  assert.ok(r.event.narration.en);
});
test("explicit separation is final and refresh cannot revive the relationship", () => {
  const r = advanceRelationship(createRelationship("x"), {
    choiceId: "end-relationship",
  });
  assert.equal(r.ended, true);
  assert.equal(r.tone, "breakup");
  assert.deepEqual(advanceRelationship(r, { choiceId: "talk-it-through" }), r);
});
