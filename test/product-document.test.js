import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const document = readFileSync(
  new URL("../docs/product-design.md", import.meta.url),
  "utf8",
);

test("product design document states the MVP scope and safety boundary", () => {
  for (const requiredText of [
    "医疗安全智能体产品设计文档",
    "HEADACHE_V1",
    "CHEST_PAIN_V1",
    "不以诊断疾病为目标",
    "个性化药物剂量",
    "Decision Trace",
  ]) {
    assert.match(document, new RegExp(requiredText));
  }
});

test("product design document covers direction, functions, safety, and roadmap", () => {
  for (const heading of [
    "产品概述",
    "MVP 范围",
    "主要功能",
    "核心流程",
    "安全与数据设计",
    "MVP 验收方向",
    "后续迭代",
  ]) {
    assert.match(document, new RegExp(`## \\d+\\. ${heading}`));
  }
});
