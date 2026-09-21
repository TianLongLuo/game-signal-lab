import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { SCENE_PRESETS, getScenePreset } from "../src/companion-scenes.js";
test("five distinct bundled scenes are web-sized JPEGs with bilingual labels", () => {
  assert.equal(SCENE_PRESETS.length, 5);
  const hashes = new Set();
  for (const scene of SCENE_PRESETS) {
    assert.ok(scene.zh && scene.en);
    const bytes = readFileSync(new URL(".." + scene.url, import.meta.url));
    assert.equal(bytes.subarray(0, 3).toString("hex"), "ffd8ff");
    assert.ok(bytes.length < 600_000);
    hashes.add(createHash("sha256").update(bytes).digest("hex"));
    assert.equal(getScenePreset(scene.id), scene);
  }
  assert.equal(hashes.size, 5);
  assert.equal(getScenePreset("unknown").id, "cafe");
});
