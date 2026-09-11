import { readFile } from "node:fs/promises";
import { createRequire, register } from "node:module";
import { fileURLToPath } from "node:url";
import { isMainThread } from "node:worker_threads";

/**
 * 배포판 Node 는 TypeScript 타입 제거(amaro) 없이 빌드되기도 해서
 * 계약 검사가 .ts 를 불러오면 ERR_UNKNOWN_FILE_EXTENSION 으로 멈춘다.
 * run-omnux-tests.mjs 가 process.features.typescript 가 없을 때만 --import 로 붙인다.
 */
if (isMainThread) {
  register(import.meta.url);
}

let typescript;

function loadTypeScript() {
  typescript ??= createRequire(import.meta.url)("typescript");
  return typescript;
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith("file:") || !url.endsWith(".ts")) {
    return nextLoad(url, context);
  }

  const fileName = fileURLToPath(url);
  const ts = loadTypeScript();
  const { outputText } = ts.transpileModule(await readFile(fileName, "utf8"), {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    }
  });
  return { format: "module", source: outputText, shortCircuit: true };
}
