import test from "node:test";
import assert from "node:assert/strict";

import { SafetySignalDetector } from "../src/index.js";
import { getProtocol } from "../src/protocols/index.js";

const detector = new SafetySignalDetector();
const headache = getProtocol("headache");
const chest = getProtocol("chest_pain");

test("SafetySignalDetector discovers pathway concepts with exact evidence only", async (t) => {
  const cases = [
    ["explicit", "头痛突然开始，几秒钟就痛到顶。", headache, "symptoms.rapidPeak"],
    ["negative wording", "头痛，但没有嘴歪。", headache, "redFlags.neurologicalDeficit"],
    ["quoted symptom", "网上说“突然爆炸一样的头痛”很危险。", headache, "symptoms.suddenOnset"],
    ["hypothetical symptom", "如果以后突然头痛，我该怎么办？", headache, "symptoms.suddenOnset"],
    ["historical symptom", "昨天胸痛时晕倒了。", chest, "redFlags.collapseOrSweating"],
    ["current symptom", "现在胸口像石头压住。", chest, "redFlags.pressureOrCrushing"],
    ["colloquial phrase", "脑袋猛地疼起来。", headache, "symptoms.suddenOnset"],
    ["spelling variation", "胸疼，还喘不过汽。", chest, "redFlags.difficultyBreathing"],
    ["spaced colloquial deficit", "好像嘴有一点歪，我不确定。", headache, "redFlags.neurologicalDeficit"],
    ["other person", "我朋友突然头痛。", headache, "symptoms.suddenOnset"],
  ];
  for (const [name, message, protocol, path] of cases) {
    await t.test(name, () => {
      const candidate = find(detector.detect({ message, protocol }), path);
      assert.ok(candidate.evidence.every((item) => item.text === message.slice(item.start, item.end)));
      assert.ok(!Object.hasOwn(candidate, "polarity"));
      assert.ok(!Object.hasOwn(candidate, "temporality"));
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

test("Detector leaves quoted self-denial interpretation to the assertion layer", () => {
  const result = detector.detect({
    message: "我看到网上说‘突然爆炸一样的头痛’很危险，但我自己没有这种情况。",
    protocol: headache,
  });
  const candidate = find(result, "symptoms.suddenOnset");
  assert.equal(candidate.proposedValue, true);
  assert.ok(!Object.hasOwn(candidate, "polarity"));
});

function find(result, path) {
  const candidate = result.candidates.find((item) => item.factPath === path);
  assert.ok(candidate, path);
  return candidate;
}
