import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyReviews, classification, inspectText, scanTree } from "./audit-renewal.mjs";

test("비밀·개인 상태·의존성은 내용 검사 대상에서 제외한다", () => {
  for (const file of [".env", "apps/.env.local", "private.key", ".ssh/id_rsa", "workspace/main.ts", "apps/.runtime/data.json", ".config/gh/hosts.yml", "credentials.json", ".mcp.json", ".npmrc"]) {
    assert.equal(classification(file, true), "private-metadata-only", file);
  }
  assert.equal(classification("apps/desktop/node_modules/pkg/index.ts", true), "dependency-or-build-metadata-only");
  assert.equal(classification("output/run.log", true), "audit-or-output-metadata-only");
  assert.equal(classification("apps/shared/test.ts", true), "first-party-text");
  assert.equal(classification("scripts/omnux", true), "first-party-text");
});

test("Git에서 제외된 실제 소스도 내용 감사에 포함한다", () => {
  assert.equal(classification("apps/omnux-middleware/src/Infrastructure/Workspace/ProjectWorkspaceFiles.cs", false), "first-party-text");
  assert.equal(classification(".github/workflows/check.yml", false), "first-party-text");
  assert.equal(classification("apps/omnux-middleware/src/.env", false), "private-metadata-only");
  assert.equal(classification("apps/desktop/src/node_modules/package/index.ts", false), "dependency-or-build-metadata-only");
});

test("인증 소스 폴더와 그 안의 비밀 파일을 구분한다", () => {
  assert.equal(classification("apps/desktop/src/features/auth/auth-store.ts", false), "first-party-text");
  assert.equal(classification("apps/omnux-middleware/src/Auth/LoginService.cs", true), "first-party-text");
  for (const file of ["auth/session.json", "apps/desktop/src/auth/.env", "apps/desktop/src/auth/secrets.json", "apps/desktop/src/auth/token.key", "apps/desktop/src/auth/.config/gh/hosts.yml"]) {
    assert.equal(classification(file, true), "private-metadata-only", file);
  }
});

test("검토 이후 바뀐 파일은 검토 완료로 남지 않는다", () => {
  const entries = [
    { path: "same.ts", sha256: "a", semanticReview: "pending" },
    { path: "changed.ts", sha256: "b", semanticReview: "pending" },
    { path: "unread.ts", sha256: "c", semanticReview: "pending" }
  ];
  const review = { sha256: "a", evidence: "execution.md", summary: "입력과 상태 경계 확인" };
  applyReviews(entries, { "same.ts": review, "changed.ts": review, "unread.ts": { sha256: "c" } });
  assert.equal(entries[0].semanticReview, "source-reviewed");
  assert.equal(entries[1].semanticReview, "changed-since-review");
  assert.equal(entries[2].semanticReview, "pending");
});

test("숨김·제외 파일도 목록화하며 외부 링크는 읽지 않는다", t => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "omnux-inventory-"));
  try {
    mkdirSync(path.join(temp, "workspace"));
    writeFileSync(path.join(temp, ".env"), "검사하면 안 되는 값");
    writeFileSync(path.join(temp, "workspace", "state.json"), "검사하면 안 되는 값");
    writeFileSync(path.join(temp, "main.ts"), "const a = 1;\n// TODO\n");
    try { symlinkSync(path.join(temp, ".env"), path.join(temp, "link.ts")); }
    catch (error) {
      if (process.platform === "win32" && error.code === "EPERM") { t.skip("Windows 파일 링크 생성 권한이 없습니다."); return; }
      throw error;
    }
    const { entries, errors } = scanTree(temp, new Set([".env", "workspace/state.json", "main.ts", "link.ts"]));
    assert.equal(entries.length, 5);
    assert.deepEqual(errors, []);
    assert.equal(entries.filter(entry => entry.contentStatus).length, 1);
    const source = entries.find(entry => entry.path === "main.ts");
    assert.equal(source.lines, 2);
    assert.equal(source.markers, 1);
    assert.equal(source.semanticReview, "pending");
    assert.equal(entries.find(entry => entry.path === "link.ts").kind, "symlink");
    assert.throws(() => inspectText(path.join(temp, "link.ts")));
    writeFileSync(path.join(temp, "main.ts"), "수정됨\n");
    assert.notEqual(inspectText(path.join(temp, "main.ts")).sha256, source.sha256);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
