import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const registry = JSON.parse(readFileSync(path.join(root, "apps/shared/model-registry.json"), "utf8"));

test("Grok 이 1급 제공자고 확인한 2026-09 모델 ID 가 들어 있다", () => {
  assert.equal(registry.providers.grok.label, "Grok");
  assert.equal(registry.providers.grok.default, "grok-4.6");
  assert.ok(registry.providers.grok.fallback.includes("grok-4.6"));
  assert.ok(registry.providers.grok.fallback.includes("grok-4.5"));
  assert.ok(registry.providers.codex.fallback.includes("gpt-6-astra"));
  assert.ok(registry.providers.gemini.fallback.includes("gemini-3.8-flash"));
  assert.ok(registry.providers.groq.fallback.includes("qwen/qwen3.8-27b"));
  assert.ok(registry.providers.nvidia.fallback.includes("moonshotai/kimi-k3"));
});

test("제공자 키를 지어내지 않는다", () => {
  assert.deepEqual(Object.keys(registry.providers).sort(), [
    "cerebras",
    "codex",
    "copilot",
    "gemini",
    "grok",
    "groq",
    "nvidia"
  ]);
});
