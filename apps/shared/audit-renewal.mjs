import { createHash } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const textExtensions = new Set([".c", ".h", ".cpp", ".hpp", ".cs", ".csproj", ".props", ".targets", ".sln", ".rs", ".toml", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".css", ".html", ".py", ".sh", ".ps1", ".cmd", ".bat", ".json", ".jsonl", ".md", ".txt", ".yml", ".yaml", ".xml", ".lock", ".svg"]);
const textNames = new Set(["Makefile", "Dockerfile", "LICENSE", ".gitignore", ".gitattributes", ".editorconfig", "omnux"]);
const privateNames = /(^\.env(?:\.|$)|^id_(rsa|ed25519)(?:\.|$)|\.(pem|key|p12|pfx|keystore)$|^(credentials?|secrets?|tokens?|auth)(\.|$))/i;
const privateConfigNames = new Set([".mcp.json", "mcp.json", "mcp_config.json", ".npmrc", ".pypirc", ".netrc", ".git-credentials", "settings.local.json"]);
const privateDirectories = new Set([".ssh", ".aws", ".kube", ".omnux", ".omni", "workspace", ".codex", ".claude", ".config", ".runtime", "runtime", "Library"]);
const generatedDirectories = new Set(["node_modules", "bin", "obj", "target", "dist", "publish", ".nuget", "__pycache__", "venv", ".venv"]);
const sourceRoots = ["apps/desktop/src/", "apps/desktop/src-tauri/src/", "apps/omnux-middleware/src/", "apps/omnux-middleware-tests/", "apps/shared/", "scripts/", ".github/workflows/"];

export function classification(relative, owned) {
  const parts = relative.split("/");
  const knownSource = sourceRoots.some(root => relative.startsWith(root));
  if (parts.some((part, index) => {
    const sourceAuthDirectory = knownSource && index < parts.length - 1 && part.toLowerCase() === "auth";
    return privateDirectories.has(part) || privateConfigNames.has(part) || (privateNames.test(part) && !sourceAuthDirectory);
  })) return "private-metadata-only";
  if (parts[0] === ".git") return "git-metadata-only";
  if (parts[0] === "output" || relative.startsWith("docs/renewal/inventory/")) return "audit-or-output-metadata-only";
  if (parts.some(part => generatedDirectories.has(part))) return "dependency-or-build-metadata-only";
  if (!owned && !knownSource) return "ignored-metadata-only";
  if (textExtensions.has(path.extname(relative)) || textNames.has(path.basename(relative))) return "first-party-text";
  return "asset-metadata-only";
}

export function inspectText(absolute) {
  if (lstatSync(absolute).isSymbolicLink()) throw new Error("심볼릭 링크 내용은 검사하지 않습니다.");
  const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (!before.isFile()) return { contentStatus: "not-regular" };
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) return { contentStatus: "changed-during-read" };
    if (bytes.includes(0)) return { contentStatus: "binary" };
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { return { contentStatus: "non-utf8" }; }
    return {
      contentStatus: "full-text-scanned",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      lines: text ? text.split("\n").length - Number(text.endsWith("\n")) : 0,
      markers: (text.match(/\b(TODO|FIXME|NotImplementedException|stub)\b/gi) || []).length,
      semanticReview: "pending"
    };
  } finally { closeSync(fd); }
}

export function scanTree(directory, owned) {
  const entries = [], errors = [];
  function walk(relative) {
    let children;
    try { children = readdirSync(path.join(directory, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en")); }
    catch (error) { errors.push({ path: relative, code: error.code || "read-error" }); return; }
    for (const child of children) {
      const file = relative ? `${relative}/${child.name}` : child.name;
      const kind = child.isSymbolicLink() ? "symlink" : child.isDirectory() ? "directory" : child.isFile() ? "file" : "special";
      const category = classification(file, owned.has(file));
      const entry = { path: file, kind, category };
      if (kind !== "directory") {
        try {
          const stat = lstatSync(path.join(directory, file));
          entry.bytes = stat.size;
          entry.modifiedAt = stat.mtime.toISOString();
        } catch (error) { errors.push({ path: file, code: error.code || "stat-error" }); }
      }
      if (kind === "file" && category === "first-party-text") {
        try { Object.assign(entry, inspectText(path.join(directory, file))); }
        catch (error) { entry.contentStatus = "read-error"; errors.push({ path: file, code: error.code || "read-error" }); }
      }
      entries.push(entry);
      // 링크는 따라가지 않는다. 파일 내용 제외와 디렉터리 목록 제외는 다르다.
      if (kind === "directory") walk(file);
    }
  }
  walk("");
  return { entries, errors };
}

export function applyReviews(entries, reviews) {
  for (const entry of entries) {
    const review = reviews[entry.path];
    if (!entry.sha256 || !review?.sha256 || !review.evidence || !review.summary) continue;
    entry.semanticReview = entry.sha256 === review.sha256 ? "source-reviewed" : "changed-since-review";
    entry.reviewEvidence = review.evidence;
  }
}

export function runAudit(directory = root) {
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const owned = new Set(git("ls-files", "-z", "--cached", "--others", "--exclude-standard").split("\0").filter(Boolean));
  const output = path.join(directory, "output/renewal/inventory");
  const docs = path.join(directory, "docs/renewal/inventory");
  mkdirSync(output, { recursive: true });
  mkdirSync(docs, { recursive: true });
  const { entries, errors } = scanTree(directory, owned);
  const reviewsFile = path.join(docs, "reviews.json");
  const reviews = existsSync(reviewsFile) ? JSON.parse(readFileSync(reviewsFile, "utf8")) : {};
  applyReviews(entries, reviews);
  const byCategory = {}, byModule = {};
  for (const entry of entries) {
    byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
    if (entry.contentStatus !== "full-text-scanned") continue;
    const parts = entry.path.split("/");
    const module = parts[0] === "apps" ? parts.slice(0, 2).join("/") : parts[0];
    const row = byModule[module] ||= { files: 0, lines: 0, markerOccurrences: 0 };
    row.files++; row.lines += entry.lines; row.markerOccurrences += entry.markers;
  }
  const existing = new Set(entries.map(entry => entry.path));
  const missing = [...owned].filter(file => !existing.has(file));
  const summary = { generatedAt: new Date().toISOString(), head: git("rev-parse", "HEAD").trim(), entries: entries.length,
    files: entries.filter(entry => entry.kind === "file").length, byCategory, byModule, missing, errors,
    sourceReviewed: entries.filter(entry => entry.semanticReview === "source-reviewed").length,
    changedSinceReview: entries.filter(entry => entry.semanticReview === "changed-since-review").length,
    note: "전체 텍스트 스캔은 의미 검토나 실행 검증 완료를 뜻하지 않는다. 비밀·사용자 상태·의존성·산출물·링크의 내용은 읽지 않는다." };
  writeFileSync(path.join(output, "all-entries.jsonl"), entries.map(entry => JSON.stringify(entry)).join("\n") + "\n");
  const status = git("status", "--short");
  const initialStatus = path.join(output, "initial-working-tree-status.txt");
  if (!existsSync(initialStatus)) writeFileSync(initialStatus, status);
  writeFileSync(path.join(output, "working-tree-status.txt"), status);
  writeFileSync(path.join(docs, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(path.join(docs, "source-files.jsonl"), entries.filter(entry => entry.category === "first-party-text").map(entry => JSON.stringify(entry)).join("\n") + "\n");
  console.log(JSON.stringify({ entries: summary.entries, files: summary.files, scannedTextFiles: entries.filter(entry => entry.contentStatus === "full-text-scanned").length, missing: missing.length, errors: errors.length, output, docs }, null, 2));
  if (errors.length) process.exitCode = 1;
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runAudit();
