import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = process.env.OMNUX_LAUNCH_SCRATCH || path.join(root, "output/playwright");
const url = process.env.OMNUX_DESKTOP_URL || "http://127.0.0.1:1420/";
const checks = [
  "check-chat-workspace-ui.mjs",
  "check-build-workspace-ui.mjs",
  "check-automation-workspace-ui.mjs",
  "check-explore-workspace-ui.mjs",
  "check-task-workspace-ui.mjs"
];

mkdirSync(scratch, { recursive: true });
mkdirSync(path.join(root, "output/playwright"), { recursive: true });

async function loadCheck(file) {
  const source = readFileSync(path.join(root, "scripts", file), "utf8");
  if (!source.includes("async (page) =>")) {
    throw new Error(`${file} has no async (page) => entry`);
  }
  const wrapped = source.replace("async (page) =>", "export default async (page) =>");
  const tmp = path.join(scratch, `run-${file}`);
  writeFileSync(tmp, wrapped);
  const imported = await import(`${pathToFileURL(tmp).href}?t=${Date.now()}`);
  if (typeof imported.default !== "function") {
    throw new Error(`${file} did not export a function`);
  }
  return imported.default;
}

const browser = await chromium.launch({ headless: true });
const results = [];
for (const file of checks) {
  process.stdout.write(`\n[ui] ${file}\n`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const run = await loadCheck(file);
    const value = await run(page);
    results.push({ file, ok: true, value });
    process.stdout.write(`[ui] ${file} ok\n`);
  } catch (error) {
    results.push({ file, ok: false, error: String(error?.stack || error) });
    process.stdout.write(`[ui] ${file} FAIL ${error}\n`);
    await browser.close();
    writeFileSync(path.join(scratch, "workspace-ui-checks.json"), JSON.stringify(results, null, 2));
    process.exit(1);
  } finally {
    await page.close();
  }
}
await browser.close();
writeFileSync(path.join(scratch, "workspace-ui-checks.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ ok: true, checks: results.map((row) => row.file) }, null, 2));
