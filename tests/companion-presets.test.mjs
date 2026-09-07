import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  PORTRAIT_PRESETS,
  getPortraitPreset,
} from "../src/companion-presets.js";

test("twenty distinct real bundled portraits and lightweight thumbnails match the catalog", () => {
  assert.equal(PORTRAIT_PRESETS.length, 20);
  assert.equal(new Set(PORTRAIT_PRESETS.map((p) => p.id)).size, 20);
  const hashes = new Set();
  for (const p of PORTRAIT_PRESETS) {
    assert.ok(p.zh && p.en);
    assert.equal(getPortraitPreset(p.id), p);
    for (const key of ["url", "thumbnail"]) {
      assert.match(
        p[key],
        /^\/companion\/presets\/portrait-\d{2}(?:-thumb)?\.jpg$/,
      );
      const data = readFileSync(new URL(".." + p[key], import.meta.url));
      assert.deepEqual([...data.subarray(0, 3)], [255, 216, 255]);
      assert.deepEqual([...data.subarray(-2)], [255, 217]);
      assert.ok(data.length > 5000);
      assert.ok(data.length < (key === "thumbnail" ? 60000 : 500000));
      if (key === "url")
        hashes.add(createHash("sha256").update(data).digest("hex"));
    }
  }
  assert.equal(hashes.size, 20);
  assert.equal(getPortraitPreset("https://example.com/image.jpg"), null);
  assert.equal(getPortraitPreset("../secret"), null);
});

test("art prompt provenance records fifteen adult women and five adult men", () => {
  const prompts = JSON.parse(
    readFileSync(
      new URL("../companion/presets/prompts.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(prompts.length, 20);
  assert.equal(
    prompts.filter((p) => /single fictional adult: woman aged/.test(p.prompt))
      .length,
    15,
  );
  assert.equal(
    prompts.filter((p) => /single fictional adult: man aged/.test(p.prompt))
      .length,
    5,
  );
  assert.deepEqual(
    prompts.map((p) => p.id),
    PORTRAIT_PRESETS.map((p) => p.id),
  );
});
