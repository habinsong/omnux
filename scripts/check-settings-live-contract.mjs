import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settingsPath = path.join(repoRoot, "apps", "omnux-dashboard", "settings.js");
const homePath = path.join(repoRoot, "apps", "omnux-dashboard", "home.js");
const statePath = path.join(repoRoot, "apps", "omnux-dashboard", "modules", "settings-page-state.js");
const adapterPath = path.join(repoRoot, "apps", "omnux-dashboard", "runtime-adapter.js");

const settings = readFileSync(settingsPath, "utf8");
const home = readFileSync(homePath, "utf8");
const state = readFileSync(statePath, "utf8");
const adapter = readFileSync(adapterPath, "utf8");
const combined = `${settings}\n${state}\n${adapter}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const command of [
  "set_telegram_credentials",
  "test_telegram",
  "set_llm_credentials",
  "get_copilot_status",
  "start_codex_login",
  "set_groq_model",
  "set_copilot_model",
  "get_cerebras_models"
]) {
  assert(combined.includes(command), `Settings live command missing: ${command}`);
}

for (const messageType of [
  "settings_state",
  "settings_result",
  "usage_stats",
  "copilot_status",
  "copilot_login_result",
  "codex_status",
  "codex_login_result",
  "codex_logout_result",
  "groq_models",
  "groq_model_set",
  "cerebras_models",
  "copilot_models",
  "copilot_model_set",
  "otp_request_result",
  "auth_result"
]) {
  assert(adapter.includes(messageType), `runtime adapter handler missing: ${messageType}`);
}

for (const snapshotKey of [
  "settings",
  "usage",
  "copilotStatus",
  "codexStatus",
  "groqModels",
  "cerebrasModels",
  "copilotModels",
  "settingsResult",
  "otpResult"
]) {
  assert(adapter.includes(snapshotKey), `runtime snapshot key missing: ${snapshotKey}`);
}

for (const forbidden of [
  "ctx.toast(\"Configure ",
  "ctx.toast('Configure ",
  "Manage keys",
  "Add provider",
  "D.providers",
  "D.projects",
  "Default project",
  "Start on launch"
]) {
  assert(!settings.includes(forbidden), `Settings demo-only artifact must not return: ${forbidden}`);
}

assert(state.includes("useSettingsLiveState"), "Settings live state hook is not exported");
assert(state.includes("useState(true)"), "Settings persist default must remain true");
assert(settings.includes("disabled: pending.llm || pending.llmDelete"), "LLM secret inputs must stay typable before OTP auth");
assert(settings.includes("disabled: pending.telegram || pending.telegramDelete"), "Telegram secret inputs must stay typable before OTP auth");
assert(settings.includes("Telegram") && settings.includes("Bot Token") && settings.includes("Chat ID"), "Telegram credential form is missing");
assert(settings.includes("Groq") && settings.includes("Gemini") && settings.includes("Cerebras") && settings.includes("NVIDIA NIM") && settings.includes("Codex"), "LLM credential form is incomplete");
assert(!home.includes("D.providers.filter"), "Home model services card must not use mock providers");
assert(home.includes("buildModelServiceRows") && home.includes("runtime?.settings"), "Home model services card must use runtime settings state");

console.log("[settings-live-contract] ok");
