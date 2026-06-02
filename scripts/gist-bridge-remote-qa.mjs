#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = {
    token: "",
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
    if (arg === "--token") {
      args.token = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg.startsWith("--token=")) {
      args.token = arg.slice("--token=".length);
      continue;
    }
  }

  return args;
}

function printHelp() {
  console.log(`사용법:
  node scripts/gist-bridge-remote-qa.mjs [--token <GITHUB_TOKEN>] [--json]

전제:
  - OMNUX_GITHUB_TOKEN 환경 변수, --token 인자, 또는 기본 macOS Keychain 항목을 사용합니다.
  - 외부 머신에서 실행 시 GitHub API를 통해 Gist를 임시로 생성하고 다운로드하여 Sync 무결성을 확인합니다.

완료 조건:
  - GitHub Gist 생성(업로드) 성공 (outboundUploadOk=true)
  - 방금 생성한 Gist 내용 다운로드 및 검증 성공 (inboundDownloadOk=true)
  - 검증 후 생성된 임시 Gist 삭제 성공`);
}

function resolveSecret(options, cliToken) {
  if (cliToken && cliToken.trim()) {
    return cliToken.trim();
  }

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

async function githubFetch(token, method, path, payload) {
  const url = \`https://api.github.com\${path}\`;
  const options = {
    method,
    headers: {
      "Authorization": \`Bearer \${token}\`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "omnux-qa-script",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  };
  if (payload) {
    options.body = JSON.stringify(payload);
    options.headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, options);
  let json = null;
  const text = await response.text();
  try {
    if (text) json = JSON.parse(text);
  } catch {
    json = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    json: json,
    raw: text
  };
}

function writeResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const status = result.ok ? "ok" : "failed";
  console.log(`[gist-bridge-remote-qa] ${status}`);
  if (result.gistId) {
    console.log(`gistId=${result.gistId}`);
  }
  console.log(`outboundUploadOk=${result.outboundUploadOk}`);
  console.log(`inboundDownloadOk=${result.inboundDownloadOk}`);
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

  const token = resolveSecret({
    directEnvKey: "OMNUX_GITHUB_TOKEN",
    fileEnvKey: "OMNUX_GITHUB_TOKEN_FILE",
    keychainServiceEnvKey: "OMNUX_GITHUB_TOKEN_KEYCHAIN_SERVICE",
    keychainAccountEnvKey: "OMNUX_GITHUB_TOKEN_KEYCHAIN_ACCOUNT",
    defaultKeychainService: "omnux_github_token",
    defaultKeychainAccount: "omnux"
  }, args.token);

  if (!token) {
    writeResult({
      ok: false,
      outboundUploadOk: false,
      inboundDownloadOk: false,
      error: "GitHub token is missing. set --token or OMNUX_GITHUB_TOKEN."
    }, args.json);
    process.exit(2);
  }

  const dummyContentBase64 = Buffer.from(`omnux-qa-payload-${Date.now()}`).toString("base64");
  const fileName = "omnux-portable-package.b64";
  
  // 1. Upload
  const createResult = await githubFetch(token, "POST", "/gists", {
    description: "Omnux Portable Backup Sync QA",
    public: false,
    files: {
      [fileName]: { content: dummyContentBase64 }
    }
  });

  if (!createResult.ok || !createResult.json?.id) {
    writeResult({
      ok: false,
      outboundUploadOk: false,
      inboundDownloadOk: false,
      error: `Failed to create gist: ${createResult.status} ${createResult.raw}`
    }, args.json);
    process.exit(3);
  }

  const gistId = createResult.json.id;

  // 2. Download
  const getResult = await githubFetch(token, "GET", `/gists/${gistId}`);
  let inboundOk = false;

  if (getResult.ok && getResult.json?.files?.[fileName]) {
    const fileNode = getResult.json.files[fileName];
    let fetchedContent = fileNode.content;

    if (fileNode.truncated && fileNode.raw_url) {
      const rawResponse = await fetch(fileNode.raw_url, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (rawResponse.ok) {
        fetchedContent = await rawResponse.text();
      }
    }

    if (fetchedContent?.trim() === dummyContentBase64) {
      inboundOk = true;
    }
  }

  // 3. Cleanup
  await githubFetch(token, "DELETE", `/gists/${gistId}`);

  if (!inboundOk) {
    writeResult({
      ok: false,
      gistId,
      outboundUploadOk: true,
      inboundDownloadOk: false,
      error: "Downloaded content did not match uploaded content."
    }, args.json);
    process.exit(4);
  }

  writeResult({
    ok: true,
    gistId,
    outboundUploadOk: true,
    inboundDownloadOk: true
  }, args.json);
}

main().catch((error) => {
  console.error(`[gist-bridge-remote-qa] error: ${error.message}`);
  process.exit(1);
});
