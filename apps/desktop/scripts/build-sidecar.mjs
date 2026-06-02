import { mkdirSync, copyFileSync, existsSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopRoot, "..", "..");
const targetTriple = resolveTargetTriple();

const runtimeIdentifier = resolveRuntimeIdentifier(targetTriple);
const projectPath = path.join(repoRoot, "apps", "omnux-middleware", "Omnux.Middleware.csproj");
const publishDir = path.join(desktopRoot, "src-tauri", "binaries", "publish", runtimeIdentifier);
const binaryBaseName = "omnux-middleware";
const publishedBinaryName = process.platform === "win32" ? "Omnux.Middleware.exe" : "Omnux.Middleware";
const sidecarName = process.platform === "win32"
  ? `${binaryBaseName}-${targetTriple}.exe`
  : `${binaryBaseName}-${targetTriple}`;
const sidecarPath = path.join(desktopRoot, "src-tauri", "binaries", sidecarName);

mkdirSync(publishDir, { recursive: true });
mkdirSync(path.dirname(sidecarPath), { recursive: true });

const publish = spawnSync(
  "dotnet",
  [
    "publish",
    projectPath,
    "-c",
    "Release",
    "-r",
    runtimeIdentifier,
    "--self-contained",
    "true",
    "-p:PublishSingleFile=true",
    "-p:IncludeNativeLibrariesForSelfExtract=true",
    "-o",
    publishDir
  ],
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env
  }
);

if (publish.status !== 0) {
  process.exit(publish.status ?? 1);
}

const publishedBinaryPath = path.join(publishDir, publishedBinaryName);
if (!existsSync(publishedBinaryPath)) {
  throw new Error(`publish 산출물을 찾을 수 없습니다: ${publishedBinaryPath}`);
}

copyFileSync(publishedBinaryPath, sidecarPath);
if (process.platform !== "win32") {
  chmodSync(sidecarPath, 0o755);
}

console.log(`[desktop-sidecar] ${sidecarPath}`);

function resolveTargetTriple() {
  const fromEnv =
    process.env.TAURI_ENV_TARGET_TRIPLE ||
    process.env.TAURI_TARGET_TRIPLE ||
    process.env.TARGET_TRIPLE ||
    process.env.CARGO_BUILD_TARGET;
  if (fromEnv) {
    return fromEnv;
  }

  const rustc = spawnSync("rustc", ["-vV"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env
  });
  if (rustc.status === 0 && typeof rustc.stdout === "string") {
    const match = rustc.stdout.match(/^host:\s+(\S+)/m);
    if (match) {
      return match[1];
    }
  }

  const arch = process.arch;
  switch (process.platform) {
    case "darwin":
      return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
    case "win32":
      return arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
    case "linux":
      return arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu";
    default:
      throw new Error("지원하지 않는 플랫폼이라 target triple을 추론할 수 없습니다.");
  }
}

function resolveRuntimeIdentifier(triple) {
  const normalized = triple.toLowerCase();
  if (normalized.includes("apple-darwin")) {
    return normalized.startsWith("aarch64") ? "osx-arm64" : "osx-x64";
  }
  if (normalized.includes("pc-windows-msvc")) {
    return normalized.startsWith("aarch64")
      ? "win-arm64"
      : normalized.startsWith("i686")
        ? "win-x86"
        : "win-x64";
  }
  if (normalized.includes("unknown-linux-gnu")) {
    return normalized.startsWith("aarch64") ? "linux-arm64" : "linux-x64";
  }
  throw new Error(`지원하지 않는 Tauri target triple입니다: ${triple}`);
}
