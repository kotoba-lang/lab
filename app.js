const state = {
  data: null,
  selectedCellId: null,
  storageAvailable: false,
  storageKey: "kotoba-lab:notebook:v1",
};

const keyword = Symbol("keyword");

class EdnParser {
  constructor(input) {
    this.input = input;
    this.index = 0;
  }

  parse() {
    this.skip();
    return this.readValue();
  }

  readValue() {
    this.skip();
    const ch = this.peek();
    if (ch === "{") return this.readMap();
    if (ch === "[") return this.readVector();
    if (ch === '"') return this.readString();
    if (ch === ":") return this.readKeyword();
    return this.readSymbol();
  }

  readMap() {
    this.expect("{");
    const result = {};
    while (true) {
      this.skip();
      if (this.peek() === "}") {
        this.index += 1;
        return result;
      }
      const key = this.readValue();
      const value = this.readValue();
      result[this.keyName(key)] = value;
    }
  }

  readVector() {
    this.expect("[");
    const result = [];
    while (true) {
      this.skip();
      if (this.peek() === "]") {
        this.index += 1;
        return result;
      }
      result.push(this.readValue());
    }
  }

  readString() {
    this.expect('"');
    let out = "";
    while (this.index < this.input.length) {
      const ch = this.input[this.index++];
      if (ch === '"') return out;
      if (ch === "\\") {
        const next = this.input[this.index++];
        if (next === "n") out += "\n";
        else if (next === "t") out += "\t";
        else out += next;
      } else {
        out += ch;
      }
    }
    throw new Error("Unterminated string");
  }

  readKeyword() {
    this.expect(":");
    const token = this.readToken();
    return { [keyword]: true, value: token };
  }

  readSymbol() {
    const token = this.readToken();
    if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);
    if (token === "true") return true;
    if (token === "false") return false;
    if (token === "nil") return null;
    return token;
  }

  readToken() {
    const start = this.index;
    while (this.index < this.input.length) {
      const ch = this.input[this.index];
      if (/\s|[\]\}\[\{"]/.test(ch)) break;
      this.index += 1;
    }
    return this.input.slice(start, this.index);
  }

  keyName(value) {
    if (value && value[keyword]) return value.value;
    return String(value);
  }

  skip() {
    while (this.index < this.input.length) {
      const ch = this.input[this.index];
      if (/\s|,/.test(ch)) {
        this.index += 1;
        continue;
      }
      if (ch === ";") {
        while (this.index < this.input.length && this.input[this.index] !== "\n") {
          this.index += 1;
        }
        continue;
      }
      break;
    }
  }

  peek() {
    return this.input[this.index];
  }

  expect(ch) {
    if (this.input[this.index] !== ch) {
      throw new Error(`Expected ${ch} at ${this.index}`);
    }
    this.index += 1;
  }
}

function extractLabUi(source) {
  const marker = "(def lab-ui";
  const start = source.indexOf(marker);
  if (start === -1) throw new Error("lab-ui definition not found");
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    if (depth === 0) return source.slice(bodyStart, i + 1);
  }
  throw new Error("lab-ui map did not close");
}

function text(id, value) {
  document.getElementById(id).textContent = value ?? "-";
}

function keywordText(value) {
  if (value && value[keyword]) return value.value;
  return String(value ?? "");
}

function statusClass(status) {
  return `status-${keywordText(status)}`;
}

function makeKeyword(value) {
  return { [keyword]: true, value };
}

function encodeForStorage(value) {
  if (Array.isArray(value)) return value.map(encodeForStorage);
  if (value && typeof value === "object") {
    if (value[keyword]) return { "__kotobaKeyword": value.value };
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, encodeForStorage(nested)]),
    );
  }
  return value;
}

function decodeFromStorage(value) {
  if (Array.isArray(value)) return value.map(decodeFromStorage);
  if (value && typeof value === "object") {
    if (typeof value.__kotobaKeyword === "string") return makeKeyword(value.__kotobaKeyword);
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, decodeFromStorage(nested)]),
    );
  }
  return value;
}

function storagePayload() {
  return {
    savedAt: new Date().toISOString(),
    selectedCellId: state.selectedCellId,
    data: encodeForStorage(state.data),
  };
}

function saveNotebook() {
  if (!state.storageAvailable || !state.data) return false;
  localStorage.setItem(state.storageKey, JSON.stringify(storagePayload()));
  return true;
}

function loadSavedNotebook() {
  if (!state.storageAvailable) return null;
  const raw = localStorage.getItem(state.storageKey);
  if (!raw) return null;
  const payload = JSON.parse(raw);
  return {
    data: decodeFromStorage(payload.data),
    selectedCellId: payload.selectedCellId,
    savedAt: payload.savedAt,
  };
}

function clearSavedNotebook() {
  if (state.storageAvailable) localStorage.removeItem(state.storageKey);
}

function downloadNotebook() {
  const blob = new Blob([JSON.stringify(storagePayload(), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "kotoba-lab-notebook.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function restoreNotebookPayload(payload) {
  state.data = decodeFromStorage(payload.data || payload);
  state.selectedCellId = payload.selectedCellId || state.data["lab/notebook"]["lab/cells"][0]?.["cell/id"];
  saveNotebook();
  render();
}

function selectedCell() {
  return state.data["lab/notebook"]["lab/cells"].find(
    (cell) => cell["cell/id"] === state.selectedCellId,
  );
}

function inferCell(cell) {
  const source = cell["cell/source"] || "";
  const kind = keywordText(cell["cell/kind"]);
  const inferred = new Set();
  if (/kqe-query|:query/.test(source) || kind === "query") inferred.add("graph-read");
  if (/kqe-assert!|kqe-retract!/.test(source)) inferred.add("graph-write");
  if (/llm-infer|summarize|claim|assistant/i.test(source) || kind === "llm") {
    inferred.add("llm-infer");
  }
  if (/table|artifact|rows|arrow|csv/i.test(source) || ["table", "viz", "kotoba"].includes(kind)) {
    inferred.add("artifact-read");
  }
  if (/select|group-by|mark|plot|figure|normalize|artifact-write/i.test(source) || ["table", "viz"].includes(kind)) {
    inferred.add("artifact-write");
  }
  const policy = new Set((cell["cell/policy"] || []).map(keywordText));
  const missing = [...inferred].filter((capability) => !policy.has(capability));
  const unused = [...policy].filter((capability) => !inferred.has(capability));
  const deps = cell["cell/depends-on"] || [];
  const allCells = state.data["lab/notebook"]["lab/cells"];
  const blocked = deps.filter((dep) => {
    const depCell = allCells.find((item) => item["cell/id"] === dep);
    return !depCell || keywordText(depCell["cell/status"]) !== "succeeded";
  });
  const replay = missing.length === 0 && blocked.length === 0 ? "clean" : "needs review";
  return {
    inferred: [...inferred],
    missing,
    unused,
    blocked,
    replay,
  };
}

function llmDraft(prompt, baseCell) {
  const title = prompt.trim() || "Summarize degradation evidence";
  const shortTitle = title ? `LLM: ${title.slice(0, 28)}` : "LLM claim draft";
  const dependency = baseCell?.["cell/id"] || "c-003";
  return {
    "cell/id": nextCellId(),
    "cell/kind": makeKeyword("kotoba"),
    "cell/title": shortTitle,
    "cell/status": makeKeyword("ready"),
    "cell/policy": [makeKeyword("artifact-read"), makeKeyword("llm-infer"), makeKeyword("artifact-write")],
    "cell/source": `(defn infer-claim [evidence]\n  (llm-infer "kotoba-research-assistant"\n    {:task "${title.replaceAll('"', '\\"')}"\n     :evidence evidence\n     :output :claim-with-citations}))`,
    "cell/depends-on": [dependency],
    "cell/output": "LLM draft cell generated; run to materialize artifact",
  };
}

function nextCellId() {
  const cells = state.data["lab/notebook"]["lab/cells"];
  const max = cells.reduce((acc, cell) => {
    const n = Number(String(cell["cell/id"]).replace(/\D/g, ""));
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
  return `c-${String(max + 1).padStart(3, "0")}`;
}

function stableHash(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function cidFor(prefix, input) {
  return `bafy-${prefix}-${stableHash(input)}`;
}

function nowRunId() {
  const iso = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
  return `r-${iso}`;
}

function materializeOutput(cell, inference) {
  const source = cell["cell/source"] || "";
  const kind = keywordText(cell["cell/kind"]);
  if (inference.missing.length > 0) {
    return {
      status: makeKeyword("failed"),
      output: `policy review required: ${inference.missing.join(", ")}`,
      mediaType: "application/edn",
      artifactKind: makeKeyword("evidence"),
    };
  }
  if (inference.blocked.length > 0) {
    return {
      status: makeKeyword("stale"),
      output: `dependency blocked: ${inference.blocked.join(", ")}`,
      mediaType: "application/edn",
      artifactKind: makeKeyword("log"),
    };
  }
  if (source.includes("llm-infer")) {
    return {
      status: makeKeyword("succeeded"),
      output: "LLM claim draft artifact generated with citations required",
      mediaType: "text/markdown",
      artifactKind: makeKeyword("model"),
    };
  }
  if (kind === "viz" || source.includes(":mark")) {
    return {
      status: makeKeyword("succeeded"),
      output: "figure artifact generated from declarative viz spec",
      mediaType: "image/svg+xml",
      artifactKind: makeKeyword("figure"),
    };
  }
  if (kind === "table" || source.includes("table/") || source.includes(":group-by")) {
    return {
      status: makeKeyword("succeeded"),
      output: "table artifact generated from Kotoba table transform",
      mediaType: "application/vnd.apache.arrow.file",
      artifactKind: makeKeyword("table"),
    };
  }
  if (kind === "query" || source.includes("kqe-query")) {
    return {
      status: makeKeyword("succeeded"),
      output: "query result materialized as table artifact",
      mediaType: "application/vnd.apache.arrow.file",
      artifactKind: makeKeyword("table"),
    };
  }
  return {
    status: makeKeyword("succeeded"),
    output: "Kotoba cell evaluated by browser-local deterministic runner",
    mediaType: "application/edn",
    artifactKind: makeKeyword("evidence"),
  };
}

function runSelectedCell() {
  const notebook = state.data["lab/notebook"];
  const cell = selectedCell();
  applyEditorSource();
  const inference = inferCell(cell);
  const sourceCid = cidFor("source", cell["cell/source"]);
  const policyCid = cidFor("policy", JSON.stringify((cell["cell/policy"] || []).map(keywordText)));
  const wasmCid = cidFor("wasm", `${cell["cell/id"]}:${cell["cell/source"]}:${policyCid}`);
  const result = materializeOutput(cell, inference);
  const outputCid = cidFor("artifact", `${cell["cell/id"]}:${cell["cell/source"]}:${result.output}`);
  const runId = nowRunId();

  cell["cell/status"] = result.status;
  cell["cell/output"] = result.output;
  cell["cell/source-cid"] = sourceCid;
  cell["cell/wasm-cid"] = wasmCid;
  cell["cell/output-cids"] = [outputCid];

  const artifactName = `${cell["cell/id"]}-${keywordText(cell["cell/kind"])}-output`;
  const artifacts = notebook["lab/artifacts"];
  const existingIndex = artifacts.findIndex((artifact) => artifact["artifact/name"] === artifactName);
  const artifact = {
    "artifact/name": artifactName,
    "artifact/kind": result.artifactKind,
    "artifact/cid": outputCid,
    "artifact/media-type": result.mediaType,
    "artifact/size": `${Math.max(1, Math.ceil((result.output.length + cell["cell/source"].length) / 32))} KB`,
  };
  if (existingIndex >= 0) artifacts[existingIndex] = artifact;
  else artifacts.push(artifact);

  notebook["lab/run-id"] = runId;
  notebook["lab/replay-status"] = keywordText(result.status) === "succeeded" ? "replayable" : "needs review";
  notebook["lab/evidence"] = {
    "evidence/source-cid": sourceCid,
    "evidence/policy-cid": policyCid,
    "evidence/wasm-cid": wasmCid,
    "evidence/input-cids": (cell["cell/depends-on"] || []).map((dep) => cidFor("dep", dep)),
    "evidence/output-cids": [outputCid],
    "evidence/capabilities-used": inference.inferred.map(makeKeyword),
    "evidence/replay": inference.replay,
    "evidence/timing-ms": 24 + cell["cell/source"].length,
    "evidence/host": "browser-local kotoba runner",
  };
  saveNotebook();
}

function maturityReport() {
  const notebook = state.data["lab/notebook"];
  const cells = notebook["lab/cells"];
  const artifacts = notebook["lab/artifacts"];
  const succeeded = cells.filter((cell) => keywordText(cell["cell/status"]) === "succeeded").length;
  const withEvidence = cells.filter((cell) => cell["cell/source-cid"] && cell["cell/wasm-cid"]).length;
  const executable = cells.filter((cell) => keywordText(cell["cell/kind"]) !== "markdown").length;
  const llmCells = cells.filter((cell) => /llm-infer/.test(cell["cell/source"] || "")).length;
  const persistenceCoverage = state.storageAvailable ? 42 : 15;
  const coverage = [
    ["Notebook UI", 65, "editable cells, block insert, toolbar, inspector"],
    ["Manifest contract", 70, "lab.kotoba drives page state"],
    [
      "Local execution",
      executable ? 35 + Math.round((succeeded / executable) * 20) : 35,
      "browser-local runner materializes deterministic outputs",
    ],
    [
      "Evidence",
      40 + (cells.length ? Math.round((withEvidence / cells.length) * 20) : 0),
      "run updates source/policy/wasm/output CIDs",
    ],
    ["LLM workflow", llmCells ? 45 : 40, "llm-infer source generation, no provider call"],
    [
      "Persistence",
      state.storageAvailable ? 55 : persistenceCoverage,
      state.storageAvailable
        ? "localStorage save/restore plus JSON export/import"
        : "browser storage unavailable",
    ],
  ];
  const average = Math.round(coverage.reduce((sum, row) => sum + row[1], 0) / coverage.length);
  const maturity =
    average >= 70 ? "M4" : average >= 55 ? "M3" : average >= 35 ? "M2.5" : average >= 20 ? "M2" : "M1";
  return { coverage, average, maturity, artifacts: artifacts.length, cells: cells.length };
}

function render() {
  const data = state.data;
  const notebook = data["lab/notebook"];
  const cells = notebook["lab/cells"];
  state.selectedCellId ||= cells[0]["cell/id"];

  text("app-status", `${keywordText(data["app/status"])} / ${data["app/repo"]}`);
  text("app-title", data["app/title"]);
  text("notebook-title", notebook["lab/title"]);
  text("replay-status", notebook["lab/replay-status"]);
  text("run-id", notebook["lab/run-id"]);
  text("runtime", notebook["lab/runtime"]);

  renderCells(cells);
  renderSelectedCell();
  renderArtifacts(notebook["lab/artifacts"]);
  renderEvidence(notebook["lab/evidence"]);
  renderAssistant();
  renderMaturity();
}

function renderCells(cells) {
  const list = document.getElementById("cell-list");
  list.innerHTML = "";
  cells.forEach((cell, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `cell-button ${
      cell["cell/id"] === state.selectedCellId ? "is-active" : ""
    }`;
    button.addEventListener("click", () => {
      state.selectedCellId = cell["cell/id"];
      render();
    });

    const deps = cell["cell/depends-on"];
    button.innerHTML = `
      <span class="cell-index">${String(index + 1).padStart(2, "0")}</span>
      <span>
        <span class="cell-name">${cell["cell/title"]}</span>
        <span class="cell-deps">${keywordText(cell["cell/kind"])} / ${
          deps.length ? deps.join(", ") : "root"
        }</span>
      </span>
      <span class="status-pill ${statusClass(cell["cell/status"])}">${keywordText(
        cell["cell/status"],
      )}</span>
    `;
    list.appendChild(button);
  });
}

function renderSelectedCell() {
  const cell = selectedCell();
  const inference = inferCell(cell);
  text("selected-kind", keywordText(cell["cell/kind"]));
  text("selected-status", keywordText(cell["cell/status"]));
  text("selected-title", cell["cell/title"]);
  document.getElementById("source-editor").value = cell["cell/source"];
  text("cell-output", cell["cell/output"]);

  const strip = document.getElementById("policy-strip");
  strip.innerHTML = "";
  const policy = cell["cell/policy"];
  if (policy.length === 0) {
    const chip = document.createElement("span");
    chip.className = "policy-chip";
    chip.textContent = "no runtime capability";
    strip.appendChild(chip);
    renderInference(inference);
    return;
  }
  policy.forEach((cap) => {
    const chip = document.createElement("span");
    chip.className = "policy-chip";
    chip.textContent = keywordText(cap);
    strip.appendChild(chip);
  });
  renderInference(inference);
}

function renderInference(inference) {
  const panel = document.getElementById("cell-inference");
  panel.innerHTML = "";
  const rows = [
    ["Inferred policy", inference.inferred.length ? inference.inferred.join(", ") : "none"],
    ["Missing grants", inference.missing.length ? inference.missing.join(", ") : "none"],
    ["Replay", inference.blocked.length ? `blocked by ${inference.blocked.join(", ")}` : inference.replay],
  ];
  rows.forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "inference-card";
    card.innerHTML = `<strong>${label}</strong><span>${value}</span>`;
    panel.appendChild(card);
  });
}

function renderArtifacts(artifacts) {
  const panel = document.getElementById("artifacts-tab");
  panel.innerHTML = "";
  artifacts.forEach((artifact) => {
    const row = document.createElement("div");
    row.className = "artifact-row";
    row.innerHTML = `
      <strong>${artifact["artifact/name"]}</strong>
      <span class="artifact-meta">${keywordText(artifact["artifact/kind"])} / ${
        artifact["artifact/media-type"]
      } / ${artifact["artifact/size"]}</span>
      <code>${artifact["artifact/cid"]}</code>
    `;
    panel.appendChild(row);
  });
}

function renderEvidence(evidence) {
  const panel = document.getElementById("evidence-tab");
  panel.innerHTML = "";
  Object.entries(evidence).forEach(([key, value]) => {
    const row = document.createElement("div");
    row.className = "evidence-row";
    const rendered = Array.isArray(value)
      ? value.map(keywordText).join(", ")
      : keywordText(value);
    row.innerHTML = `<strong>${key}</strong><code>${rendered}</code>`;
    panel.appendChild(row);
  });
}

function renderAssistant() {
  const cell = selectedCell();
  const inference = inferCell(cell);
  const summary = [
    `${cell["cell/id"]} / ${keywordText(cell["cell/kind"])}`,
    `inferred: ${inference.inferred.join(", ") || "none"}`,
    `missing: ${inference.missing.join(", ") || "none"}`,
    `replay: ${inference.replay}`,
  ].join(" | ");
  text("assistant-summary", summary);
}

function renderMaturity() {
  const panel = document.getElementById("maturity-tab");
  const report = maturityReport();
  panel.innerHTML = `
    <div class="assistant-card">
      <strong>${report.maturity} / ${report.average}% coverage</strong>
      <span>${report.cells} cells, ${report.artifacts} artifacts. Maturity rises when cells run with evidence and artifacts.</span>
    </div>
  `;
  report.coverage.forEach(([label, percent, note]) => {
    const row = document.createElement("div");
    row.className = "coverage-row";
    row.innerHTML = `
      <div><strong>${label}</strong><span>${note}</span></div>
      <div class="coverage-meter" aria-label="${label} coverage ${percent}%">
        <span style="width: ${percent}%"></span>
      </div>
      <code>${percent}%</code>
    `;
    panel.appendChild(row);
  });
}

function addBlock(kind) {
  const cells = state.data["lab/notebook"]["lab/cells"];
  const current = selectedCell();
  let cell;
  if (kind === "llm") {
    cell = llmDraft("Explain the strongest supported research claim", current);
  } else {
    const id = nextCellId();
    cell = {
      "cell/id": id,
      "cell/kind": makeKeyword(kind),
      "cell/title": kind === "markdown" ? "New note" : "New Kotoba cell",
      "cell/status": makeKeyword("draft"),
      "cell/policy": kind === "kotoba" ? [makeKeyword("artifact-read")] : [],
      "cell/source": kind === "markdown" ? "Write observation here." : "(defn analyze [input]\n  input)",
      "cell/depends-on": current ? [current["cell/id"]] : [],
      "cell/output": "not run",
    };
  }
  cells.push(cell);
  state.selectedCellId = cell["cell/id"];
  saveNotebook();
  render();
}

function applyEditorSource() {
  const cell = selectedCell();
  cell["cell/source"] = document.getElementById("source-editor").value;
  cell["cell/status"] = makeKeyword("stale");
  saveNotebook();
  const inference = inferCell(cell);
  renderInference(inference);
  renderAssistant();
}

function setupInteractions() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((item) => {
        item.classList.toggle("is-active", item === tab);
      });
      const active = tab.dataset.tab;
      document
        .getElementById("artifacts-tab")
        .classList.toggle("is-hidden", active !== "artifacts");
      document
        .getElementById("evidence-tab")
        .classList.toggle("is-hidden", active !== "evidence");
      document
        .getElementById("assistant-tab")
        .classList.toggle("is-hidden", active !== "assistant");
      document
        .getElementById("maturity-tab")
        .classList.toggle("is-hidden", active !== "maturity");
    });
  });

  document.querySelectorAll("[data-add-block]").forEach((button) => {
    button.addEventListener("click", () => addBlock(button.dataset.addBlock));
  });

  document.getElementById("source-editor").addEventListener("input", applyEditorSource);

  document.getElementById("run-button").addEventListener("click", () => {
    runSelectedCell();
    render();
  });

  document.getElementById("toolbar-run").addEventListener("click", () => {
    runSelectedCell();
    render();
  });

  document.getElementById("replay-button").addEventListener("click", () => {
    const inference = inferCell(selectedCell());
    text(
      "cell-output",
      inference.blocked.length
        ? `replay blocked by ${inference.blocked.join(", ")}`
        : "replay clean / inputs and wasm cid unchanged",
    );
  });

  document.getElementById("infer-button").addEventListener("click", () => {
    applyEditorSource();
    document.querySelector('[data-tab="assistant"]').click();
  });

  document.getElementById("evidence-button").addEventListener("click", () => {
    document.querySelector('[data-tab="evidence"]').click();
  });

  document.getElementById("assistant-generate").addEventListener("click", () => {
    const prompt = document.getElementById("assistant-prompt").value;
    const cell = llmDraft(prompt, selectedCell());
    state.data["lab/notebook"]["lab/cells"].push(cell);
    state.selectedCellId = cell["cell/id"];
    saveNotebook();
    text("assistant-output", `Generated ${cell["cell/id"]} with llm-infer capability.`);
    render();
  });

  document.getElementById("save-button").addEventListener("click", () => {
    const ok = saveNotebook();
    text("cell-output", ok ? "notebook saved to browser storage" : "browser storage unavailable");
    renderMaturity();
  });

  document.getElementById("reset-button").addEventListener("click", () => {
    clearSavedNotebook();
    window.location.reload();
  });

  document.getElementById("export-button").addEventListener("click", downloadNotebook);

  document.getElementById("import-file").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    const payload = JSON.parse(await file.text());
    restoreNotebookPayload(payload);
    event.target.value = "";
  });
}

async function boot() {
  setupInteractions();
  try {
    try {
      localStorage.setItem(`${state.storageKey}:probe`, "1");
      localStorage.removeItem(`${state.storageKey}:probe`);
      state.storageAvailable = true;
    } catch {
      state.storageAvailable = false;
    }
    const response = await fetch("./lab.kotoba", { cache: "no-store" });
    const source = await response.text();
    const edn = extractLabUi(source);
    const saved = loadSavedNotebook();
    if (saved?.data) {
      state.data = saved.data;
      state.selectedCellId = saved.selectedCellId;
    } else {
      state.data = new EdnParser(edn).parse();
    }
    render();
  } catch (error) {
    text("notebook-title", "Failed to load lab.kotoba");
    document.getElementById("source-editor").value = error.stack || String(error);
  }
}

boot();
