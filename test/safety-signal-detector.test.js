import test from "node:test";
import assert from "node:assert/strict";

import { SafetySignalDetector } from "../src/index.js";
import { getProtocol } from "../src/protocols/index.js";

const detector = new SafetySignalDetector();
const headache = getProtocol("headache");
const chest = getProtocol("chest_pain");

test("SafetySignalDetector covers positive, negative, context, temporality, colloquial and typo cases", async (t) => {
  const cases = [
    ["explicit positive", "头痛突然开始，几秒钟就痛到顶。", headache, "symptoms.rapidPeak", "positive"],
    ["explicit negative", "头痛，但没有嘴歪。", headache, "redFlags.neurologicalDeficit", "negative"],
    ["quoted symptom", "网上说“突然爆炸一样的头痛”很危险。", headache, "symptoms.suddenOnset", "contextual"],
    ["hypothetical symptom", "如果以后突然头痛，我该怎么办？", headache, "symptoms.suddenOnset", "contextual"],
    ["historical symptom", "昨天胸痛时晕倒了。", chest, "redFlags.collapseOrSweating", "positive", "previous"],
    ["current symptom", "现在胸口像石头压住。", chest, "redFlags.pressureOrCrushing", "positive", "current"],
    ["colloquial phrase", "脑袋猛地疼起来。", headache, "symptoms.suddenOnset", "positive"],
    ["spelling variation", "胸疼，还喘不过汽。", chest, "redFlags.difficultyBreathing", "positive"],
    ["spaced colloquial deficit", "好像嘴有一点歪，我不确定。", headache, "redFlags.neurologicalDeficit", "uncertain"],
    ["misleading keyword", "我朋友突然头痛。", headache, "symptoms.suddenOnset", "contextual"],
  ];
  for (const [name, message, protocol, path, polarity, temporality] of cases) {
    await t.test(name, () => {
      const candidate = find(detector.detect({ message, protocol }), path);
      assert.equal(candidate.polarity, polarity);
      if (temporality) assert.equal(candidate.temporality, temporality);
      assert.ok(candidate.evidence.every((item) => item.text === message.slice(item.start, item.end)));
    });
  }
});

test("multiple pathway-defined signals are emitted as candidates, never clinical actions", () => {
  const result = detector.detect({
    message: "胸口像大石头压住，喘不上气，还晕过去出冷汗。",
    protocol: chest,
  });
  assert.deepEqual(new Set(result.candidates.map((item) => item.factPath)), new Set([
    "redFlags.pressureOrCrushing",
    "redFlags.difficultyBreathing",
    "redFlags.collapseOrSweating",
  ]));
  assert.doesNotMatch(JSON.stringify(result), /diagnosis|disposition|EMERGENCY_NOW|treatment|medication/);
});

test("quoted red flag followed by explicit self-denial is negative, not positive", () => {
  const result = detector.detect({
    message: "我看到网上说‘突然爆炸一样的头痛’很危险，但我自己没有这种情况。",
    protocol: headache,
  });
  assert.equal(find(result, "symptoms.suddenOnset").polarity, "negative");
});

function find(result, path) {
  const candidate = result.candidates.find((item) => item.factPath === path);
  assert.ok(candidate, path);
  return candidate;
}
