#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DEFAULT_TIMEOUT_SEC = 180;
const DEFAULT_POLL_SEC = 5;
const TELEGRAM_API_ROOT = "https://api.telegram.org";

function parseArgs(argv) {
  const args = {
    timeoutSec: DEFAULT_TIMEOUT_SEC,
    pollSec: DEFAULT_POLL_SEC,
    json: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--json") {
      args.json = true;
      continue;
    }
    if (arg === "--timeout-sec") {
      args.timeoutSec = parsePositiveInt(argv[index + 1], "--timeout-sec");
      index += 1;
      continue;
    }
    if (arg.startsWith("--timeout-sec=")) {
      args.timeoutSec = parsePositiveInt(arg.slice("--timeout-sec=".length), "--timeout-sec");
      continue;
    }
    if (arg === "--poll-sec") {
      args.pollSec = parsePositiveInt(argv[index + 1], "--poll-sec");
      index += 1;
      continue;
    }
    if (arg.startsWith("--poll-sec=")) {
      args.pollSec = parsePositiveInt(arg.slice("--poll-sec=".length), "--poll-sec");
      continue;
    }
    throw new Error(`알 수 없는 인자입니다: ${arg}`);
  }

  return args;
}

function parsePositiveInt(value, name) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} 값은 양의 정수여야 합니다.`);
  }
  return parsed;
}

function printHelp() {
  console.log(`사용법:
  node scripts/telegram-mobile-live-qa.mjs [--timeout-sec 180] [--poll-sec 5] [--json]

전제:
  - 미들웨어 Telegram polling 루프를 잠시 멈춘 상태에서 실행합니다.
  - OMNUX_TELEGRAM_BOT_TOKEN/OMNUX_TELEGRAM_CHAT_ID 또는 기본 macOS Keychain 항목을 사용합니다.
  - 모바일 텔레그램에서 봇이 보낸 확인 문구와 첨부 파일을 확인한 뒤 안내된 응답을 보냅니다.

완료 조건:
  - sendMessage 성공
  - sendDocument 성공
  - 모바일에서 /omniqa-ok <QA-ID> 응답 수신
  - 모바일에서 받은 첨부 파일을 다시 업로드했고, echo-back 문서 본문에서 QA-ID 확인`);
}

function resolveSecret(options) {
  const direct = process.env[options.directEnvKey];
  if (direct && direct.trim()) {
    return direct.trim();
  }

  const filePath = process.env[options.fileEnvKey];
  if (filePath && filePath.trim()) {
    return readFileSync(filePath.trim(), "utf8").trim();
  }

  if (process.platform !== "darwin") {
    return "";
  }

  const service = (process.env[options.keychainServiceEnvKey] || options.defaultKeychainService).trim();
  const account = (process.env[options.keychainAccountEnvKey] || options.defaultKeychainAccount).trim();
  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-s", service, "-a", account, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
  } catch {
    return "";
  }
}

function resolveConfig() {
  return {
    botToken: resolveSecret({
      directEnvKey: "OMNUX_TELEGRAM_BOT_TOKEN",
      fileEnvKey: "OMNUX_TELEGRAM_BOT_TOKEN_FILE",
      keychainServiceEnvKey: "OMNUX_TELEGRAM_TOKEN_KEYCHAIN_SERVICE",
      keychainAccountEnvKey: "OMNUX_TELEGRAM_TOKEN_KEYCHAIN_ACCOUNT",
      defaultKeychainService: "omnux_telegram_bot_token",
      defaultKeychainAccount: "omnux"
    }),
    chatId: resolveSecret({
      directEnvKey: "OMNUX_TELEGRAM_CHAT_ID",
      fileEnvKey: "OMNUX_TELEGRAM_CHAT_ID_FILE",
      keychainServiceEnvKey: "OMNUX_TELEGRAM_CHAT_ID_KEYCHAIN_SERVICE",
      keychainAccountEnvKey: "OMNUX_TELEGRAM_CHAT_ID_KEYCHAIN_ACCOUNT",
      defaultKeychainService: "omnux_telegram_chat_id",
      defaultKeychainAccount: "omnux"
    }),
    allowedUserIds: parseAllowedUserIds(process.env.OMNUX_TELEGRAM_ALLOWED_USER_ID || "")
  };
}

function parseAllowedUserIds(raw) {
  return raw
    .split(/[,\s;]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildQaId() {
  const now = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `omnux-mobile-qa-${now}-${randomBytes(3).toString("hex")}`;
}

function buildMobileInstruction(qaId) {
  return [
    "[omnux] 텔레그램 모바일 실사용 QA",
    "",
    `QA-ID: ${qaId}`,
    "",
    "모바일 클라이언트에서 이 메시지와 첨부 파일이 보이면 아래 두 가지를 진행해 주세요.",
    `1. 텍스트로 /omniqa-ok ${qaId} 를 보냅니다.`,
    "2. 방금 받은 .txt 첨부 파일을 같은 채팅에 다시 업로드합니다.",
    "",
    "완료 판정은 텍스트 응답과 첨부 echo-back 본문에서 같은 QA-ID가 확인될 때만 통과합니다."
  ].join("\n");
}

function buildQaDocument(qaId) {
  return [
    "omnux Telegram mobile live QA attachment",
    `QA-ID: ${qaId}`,
    `createdAtUtc: ${new Date().toISOString()}`,
    "",
    "이 파일이 모바일 텔레그램에 보이면 같은 채팅에 다시 업로드해 주세요.",
    "스크립트는 echo-back 문서 본문에서 QA-ID를 확인합니다."
  ].join("\n");
}

async function telegramFetch(botToken, method, payload, options = {}) {
  const endpoint = `${TELEGRAM_API_ROOT}/bot${botToken}/${method}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);
  try {
    const response = await fetch(endpoint, {
      method: payload == null ? "GET" : "POST",
      body: payload,
      headers: options.headers,
      signal: controller.signal
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return {
      ok: response.ok && Boolean(json?.ok),
      status: response.status,
      description: json?.description || "",
      result: json?.result,
      raw: text
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendMessage(botToken, chatId, text) {
  return await telegramFetch(
    botToken,
    "sendMessage",
    JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

async function sendDocument(botToken, chatId, qaId, content) {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", `omnux 모바일 첨부 QA: ${qaId}`);
  form.append(
    "document",
    new Blob([content], { type: "text/plain" }),
    `${qaId}.txt`
  );
  return await telegramFetch(botToken, "sendDocument", form);
}

async function getUpdates(botToken, offset, timeoutSec) {
  const params = new URLSearchParams();
  params.set("timeout", String(timeoutSec));
  params.set("allowed_updates", JSON.stringify(["message", "callback_query"]));
  if (Number.isFinite(offset) && offset > 0) {
    params.set("offset", String(offset));
  }
  const result = await telegramFetch(botToken, `getUpdates?${params.toString()}`, null, {
    timeoutMs: Math.max(5000, timeoutSec * 1000 + 5000)
  });
  return result.ok && Array.isArray(result.result) ? result.result : [];
}

async function downloadDocumentText(botToken, fileId) {
  const fileResult = await telegramFetch(
    botToken,
    `getFile?file_id=${encodeURIComponent(fileId)}`,
    null
  );
  if (!fileResult.ok || !fileResult.result?.file_path) {
    return "";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${TELEGRAM_API_ROOT}/file/bot${botToken}/${fileResult.result.file_path}`, {
      signal: controller.signal
    });
    if (!response.ok) {
      return "";
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function maxUpdateId(updates) {
  return updates.reduce((max, update) => {
    const id = Number(update?.update_id);
    return Number.isFinite(id) && id > max ? id : max;
  }, 0);
}

function getMessage(update) {
  return update?.message && typeof update.message === "object" ? update.message : null;
}

function getChatId(message) {
  const raw = message?.chat?.id;
  return raw == null ? "" : String(raw);
}

function getFromUserId(message) {
  const raw = message?.from?.id;
  return raw == null ? "" : String(raw);
}

function isAllowedMessage(message, chatId, allowedUserIds) {
  if (!message) {
    return false;
  }
  if (String(chatId) !== getChatId(message)) {
    return false;
  }
  if (allowedUserIds.length === 0) {
    return true;
  }
  return allowedUserIds.includes(getFromUserId(message));
}

async function inspectUpdates(botToken, updates, state) {
  for (const update of updates) {
    const message = getMessage(update);
    if (!isAllowedMessage(message, state.chatId, state.allowedUserIds)) {
      continue;
    }

    const text = [message.text, message.caption]
      .filter((value) => typeof value === "string")
      .join("\n")
      .trim();
    if (text.includes(`/omniqa-ok ${state.qaId}`) || text.includes(state.qaId)) {
      state.inboundTextAckOk = true;
    }

    const fileId = message?.document?.file_id;
    if (typeof fileId === "string" && fileId.trim()) {
      const documentText = await downloadDocumentText(botToken, fileId.trim());
      if (documentText.includes(state.qaId)) {
        state.inboundDocumentEchoOk = true;
      }
    }
  }
}

function writeResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const status = result.ok ? "ok" : "failed";
  console.log(`[telegram-mobile-live-qa] ${status}`);
  console.log(`qaId=${result.qaId}`);
  console.log(`outboundMessageOk=${result.outboundMessageOk}`);
  console.log(`outboundDocumentOk=${result.outboundDocumentOk}`);
  console.log(`inboundTextAckOk=${result.inboundTextAckOk}`);
  console.log(`inboundDocumentEchoOk=${result.inboundDocumentEchoOk}`);
  if (result.error) {
    console.log(`error=${result.error}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const config = resolveConfig();
  if (!config.botToken || !config.chatId) {
    writeResult({
      ok: false,
      qaId: "",
      outboundMessageOk: false,
      outboundDocumentOk: false,
      inboundTextAckOk: false,
      inboundDocumentEchoOk: false,
      error: "telegram credentials are missing. set OMNUX_TELEGRAM_BOT_TOKEN/OMNUX_TELEGRAM_CHAT_ID or the default omnux macOS Keychain entries."
    }, args.json);
    process.exit(2);
  }

  const qaId = buildQaId();
  const state = {
    qaId,
    chatId: config.chatId,
    allowedUserIds: config.allowedUserIds,
    inboundTextAckOk: false,
    inboundDocumentEchoOk: false
  };

  const backlog = await getUpdates(config.botToken, 0, 0);
  let offset = maxUpdateId(backlog) + 1;

  const messageResult = await sendMessage(config.botToken, config.chatId, buildMobileInstruction(qaId));
  const documentText = buildQaDocument(qaId);
  const documentResult = await sendDocument(config.botToken, config.chatId, qaId, documentText);

  if (!messageResult.ok || !documentResult.ok) {
    writeResult({
      ok: false,
      qaId,
      outboundMessageOk: messageResult.ok,
      outboundDocumentOk: documentResult.ok,
      inboundTextAckOk: false,
      inboundDocumentEchoOk: false,
      error: [messageResult.description, documentResult.description].filter(Boolean).join("; ")
    }, args.json);
    process.exit(3);
  }

  if (!args.json) {
    console.log(`[telegram-mobile-live-qa] 전송 완료 qaId=${qaId}`);
    console.log(`모바일에서 /omniqa-ok ${qaId} 를 보내고, 받은 .txt 첨부를 같은 채팅에 다시 업로드해 주세요.`);
  }

  const deadline = Date.now() + args.timeoutSec * 1000;
  while (Date.now() < deadline) {
    const updates = await getUpdates(config.botToken, offset, args.pollSec);
    const seenMax = maxUpdateId(updates);
    if (seenMax >= offset) {
      offset = seenMax + 1;
    }

    await inspectUpdates(config.botToken, updates, state);
    if (state.inboundTextAckOk && state.inboundDocumentEchoOk) {
      writeResult({
        ok: true,
        qaId,
        outboundMessageOk: true,
        outboundDocumentOk: true,
        inboundTextAckOk: true,
        inboundDocumentEchoOk: true
      }, args.json);
      return;
    }
  }

  writeResult({
    ok: false,
    qaId,
    outboundMessageOk: true,
    outboundDocumentOk: true,
    inboundTextAckOk: state.inboundTextAckOk,
    inboundDocumentEchoOk: state.inboundDocumentEchoOk,
    error: "timeout waiting for mobile text ack and attachment echo-back"
  }, args.json);
  process.exit(4);
}

main().catch((error) => {
  console.error(`[telegram-mobile-live-qa] error: ${error.message}`);
  process.exit(1);
});
