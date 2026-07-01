import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const port = Number(process.env.PORT || 4190);
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".kotoba", "text/plain; charset=utf-8"],
]);

function fileForUrl(url) {
  const path = new URL(url, `http://localhost:${port}`).pathname;
  const clean = normalize(path === "/" ? "/index.html" : path).replace(/^\/+/, "");
  if (clean.startsWith("..")) throw new Error("invalid path");
  return join(root, clean);
}

const server = createServer(async (request, response) => {
  try {
    const file = fileForUrl(request.url || "/");
    const body = await readFile(file);
    response.writeHead(200, {
      "content-type": mimeTypes.get(extname(file)) || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  }
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await new Promise((resolve) => server.listen(port, resolve));

const localChrome =
  process.env.CHROME_PATH ||
  (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "");
const browser = await chromium.launch(localChrome ? { executablePath: localChrome } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });

  await page.click("#toolbar-run");
  await page.click('[data-tab="runtime"]');
  const runtimeText = await page.locator("#runtime-tab").innerText();
  assert(runtimeText.includes("Active: kotoba-wasm-safe"), "runtime adapter did not activate");
  assert(runtimeText.includes("available"), "runtime adapter availability missing");
  await page.locator(".cell-button").nth(2).click();
  assert((await page.locator("#output-preview table").count()) === 1, "table rich output missing");
  await page.locator(".cell-button").nth(3).click();
  assert((await page.locator(".figure-preview").count()) === 1, "figure rich output missing");

  await page.click('[data-add-block="llm"]');
  await page.fill(
    "#source-editor",
    '(defn infer-claim [evidence]\n  (llm-infer "kotoba-research-assistant" {:task "explain heat degradation" :evidence evidence}))',
  );
  await page.click("#toolbar-run");
  await page.locator(".cell-button").last().click();
  const output = await page.locator("#cell-output").innerText();
  assert(output.includes("Draft claim-"), "llm output was not materialized");
  assert((await page.locator(".model-preview").count()) === 1, "model rich output missing");

  await page.click('[data-tab="evidence"]');
  const evidence = await page.locator("#evidence-tab").innerText();
  assert(evidence.includes("evidence/llm-provider"), "llm provider missing from evidence");
  assert(evidence.includes("shim-0.1.0"), "llm provider version missing");
  assert(evidence.includes("shim-0.2.0"), "runtime shim version missing");
  assert(evidence.includes("Run ledger"), "run ledger missing from evidence");
  assert(evidence.includes("kotoba-wasm-safe"), "runtime missing from run ledger");

  await page.click("#save-button");
  const saved = await page.evaluate(() => Boolean(localStorage.getItem("kotoba-lab:notebook:v1")));
  assert(saved, "notebook was not saved");
  await page.reload({ waitUntil: "networkidle" });
  const cells = await page.locator(".cell-button").count();
  assert(cells === 6, `expected persisted 6 cells, got ${cells}`);

  await page.click('[data-tab="maturity"]');
  const maturity = await page.locator("#maturity-tab").innerText();
  assert(maturity.includes("M4 /"), "maturity did not reach M4 in verified flow");
  assert(maturity.includes("Verification"), "verification coverage missing");
  assert(maturity.includes("Replay ledger"), "replay ledger coverage missing");
  assert(maturity.includes("Rich outputs"), "rich output coverage missing");

  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert(!overflowX, "page has horizontal overflow");
  assert(errors.length === 0, `console errors: ${errors.join(" | ")}`);

  console.log("ok verified kotoba-lab browser flow");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
