import { readFile } from "node:fs/promises";

const contractPath = "src/kotoba/lab/verification.cljc";
const source = await readFile(contractPath, "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(`${contractPath}: ${message}`);
}

function extractVector(name) {
  const match = source.match(new RegExp(`\\(def ${name}\\s*\\n\\s*\\[([\\s\\S]*?)\\]\\)`));
  assert(match, `${name} vector missing`);
  return [...match[1].matchAll(/:([\w-]+)/g)].map((item) => item[1]);
}

function extractMap(name) {
  const match = source.match(new RegExp(`\\(def ${name}\\s*\\n\\s*\\{([\\s\\S]*?)\\}\\)`));
  assert(match, `${name} map missing`);
  return [...match[1].matchAll(/:(env\/[\w-]+)\s+"([^"]+)"/g)].map((item) => item.slice(1));
}

const requiredEnvironment = Object.fromEntries(extractMap("required-environment"));
const requiredCoverage = extractVector("required-coverage");

for (const [key, value] of Object.entries({
  "env/schema": "kotoba-lab-notebook/v1",
  "env/runtime": "kotoba-wasm-safe",
  "env/runtime-version": "shim-0.2.0",
  "env/llm-provider": "kotoba-research-assistant",
  "env/llm-provider-version": "shim-0.1.0",
})) {
  assert(requiredEnvironment[key] === value, `${key} expected ${value}`);
}

for (const item of [
  "notebook-ui",
  "manifest-contract",
  "local-execution",
  "runtime-adapter",
  "environment-lock",
  "evidence",
  "llm-workflow",
  "rich-outputs",
  "persistence",
  "review-snapshot",
  "contract-verification",
  "replay-ledger",
  "browser-verification",
]) {
  assert(requiredCoverage.includes(item), `required coverage missing ${item}`);
}

for (const predicate of ["environment-locked?", "review-snapshot-ready?", "maturity-ready?"]) {
  assert(source.includes(`(defn ${predicate}`), `${predicate} predicate missing`);
}

console.log("ok verified kotoba lab CLJC contract");
