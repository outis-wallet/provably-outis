// The results page: how long devices take to build the showcase's proofs, as people submitted
// them (the prover-results service). Filters live in the URL, so a view can be shared:
// ?action=&platform=all|app|web|ios|android&class=all|phone|tablet|desktop&sort=median|best|runs
// (and, not shown on the page, ?build=<build> and ?results=<service url>, for us).
(function () {
  const { actions, deviceNames } = window.SHOWCASE;
  const { icon, spinner, escape, seconds, integer, gigabytes, ramLabel, deviceLabel, gpuChip } = window.OUTIS_UI;
  const engine = window.provingly;
  const app = document.getElementById("app");
  const params = new URLSearchParams(location.search);
  const service = params.get("results");
  const resultsUrl = service || window.SHOWCASE.resultsUrl;

  const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
  const filters = {
    action: pick(params.get("action"), actions.map((action) => action.id), actions[0].id),
    platform: pick(params.get("platform"), ["all", "app", "web", "ios", "android"], "all"),
    class: pick(params.get("class"), ["all", "phone", "tablet", "desktop"], "all"),
    build: params.get("build") || "all",
    sort: pick(params.get("sort"), ["median", "best", "runs"], "median"),
  };
  const state = { status: "loading", data: null, error: null, open: new Set() };

  // This device's rows: the labels it submitted under, and its own label now.
  const mine = new Set(JSON.parse(localStorage.getItem("outis-prover-submissions") || "[]").map((entry) => entry.label));
  if (engine && engine.device) mine.add(deviceLabel(engine.device, deviceNames));

  // The prover page: index.html in the apps (files); on the web its clean path (/prover).
  const proverPath = location.protocol === "file:" ? "index.html" : new URL(".", document.baseURI).pathname.replace(/\/$/, "") || "/";
  const proverPage = () => `${proverPath}${service ? `?results=${encodeURIComponent(service)}` : ""}`;
  if (engine) engine.back = () => { location.href = proverPage(); return true; }; // Android's back button

  function syncUrl() {
    const query = new URLSearchParams();
    query.set("action", filters.action);
    for (const key of ["platform", "class", "build"]) if (filters[key] !== "all") query.set(key, filters[key]);
    if (filters.sort !== "median") query.set("sort", filters.sort);
    if (service) query.set("results", service);
    history.replaceState(null, "", `?${query}`);
  }

  async function load() {
    state.status = "loading";
    render();
    const query = new URLSearchParams({ action: filters.action });
    for (const key of ["platform", "class", "build"]) if (filters[key] !== "all") query.set(key, filters[key]);
    try {
      const response = await fetch(`${resultsUrl}/v1/results?${query}`);
      if (!response.ok) throw new Error(`The results service answered ${response.status}`);
      state.data = await response.json();
      state.status = "done";
    } catch (problem) {
      state.status = "failed";
      state.error = problem.message || "Couldn't reach the results service";
    }
    render();
  }

  const PLATFORMS = [["all", "All"], ["app", "Native"], ["web", "Browser"]];
  const CLASSES = [["all", "All"], ["phone", "Phones"], ["tablet", "Tablets"], ["desktop", "Desktops"]];
  const SORTS = [["median", "Median"], ["best", "Best"], ["runs", "Most runs"]];
  const where = (platform) => (platform === "web" ? "Browser" : platform === "ios" ? "iOS app" : "Android app");
  const kind = { phone: "Phone", tablet: "Tablet", desktop: "Desktop" };

  function render() {
    const tabs = actions.map((action) => `<button class="tab ${action.id === filters.action ? "picked" : ""}" data-filter="action" data-value="${action.id}">${escape(action.short || action.title)}</button>`).join("");
    const segmented = (name, label, options) => `<div class="segmented"><span class="label">${label}</span>${options
      .map(([value, text]) => `<button class="chip ${filters[name] === value ? "picked" : ""}" data-filter="${name}" data-value="${value}">${text}</button>`).join("")}</div>`;

    let board = `<div class="well compare"><div class="caption">${spinner} Loading…</div></div>`;
    if (state.status === "failed") board = `<div class="status danger">${icon("danger")}<div>${escape(state.error)}</div></div>`;
    if (state.status === "done") board = renderBoard(state.data);

    app.innerHTML = `<main class="screen wide">
      <h1><a class="back-title" href="${proverPage()}" aria-label="Back to the prover">${icon("back")}Results</a></h1>
      <p class="lede">How long devices take to build each Privacy Pool action's ZK proof, as people submitted it from the Outis Prover apps and browsers.</p>
      <div class="tabs">${tabs}</div>
      <div class="well filters">
        ${segmented("platform", "Where", PLATFORMS)}
        ${segmented("class", "Device", CLASSES)}
        ${segmented("sort", "Sort", SORTS)}
      </div>
      ${board}
      <p class="footnote">Scores are sent by visitors. A score is accepted only if its proof verified and matched the reference one, but the time itself can't be checked. A device's row is its median over its runs.</p>
    </main>`;
  }

  function renderBoard(data) {
    if (!data.devices.length) {
      return `<div class="well compare"><div class="caption">No scores here yet. Prove this action on your device and submit yours.</div></div>`;
    }
    const devices = data.devices.slice();
    if (filters.sort === "best") devices.sort((a, b) => a.best_s - b.best_s);
    if (filters.sort === "runs") devices.sort((a, b) => b.runs - a.runs || a.median_s - b.median_s);
    const longest = Math.max(...devices.map((entry) => entry.median_s));
    const rows = devices.map((entry, index) => renderDevice(entry, index, longest)).join("");
    const summary = `${integer(data.runs)} run${data.runs === 1 ? "" : "s"} · ${integer(devices.length)} device${devices.length === 1 ? "" : "s"}`;
    return `<div class="board"><div class="summary">${summary}</div>${rows}</div>`;
  }

  function renderDevice(entry, index, longest) {
    const key = `${entry.platform}|${entry.device_label}`;
    const open = state.open.has(key);
    const you = mine.has(entry.device_label);
    const spec = entry.device || {};
    const chip = spec.chip || spec.soc || gpuChip(spec.gpu);
    const specLine = [spec.os, spec.arch, spec.cores ? `${spec.cores} cores` : null, ramLabel(spec), chip, spec.perfCores ? `${spec.perfCores}P + ${spec.efficiencyCores || 0}E` : null]
      .filter(Boolean).map(escape).join(" · ");
    const meta = [
      `best ${seconds(entry.best_s)}`,
      `${entry.runs} run${entry.runs === 1 ? "" : "s"}`,
      `${entry.threads} thread${entry.threads === 1 ? "" : "s"}`,
      entry.peak_mib ? `${gigabytes(entry.peak_mib)} GB peak` : null,
    ].filter(Boolean).join(" · ");
    const runs = open && entry.latest_runs ? renderRuns(entry.latest_runs) : "";
    return `<button class="well result pressable ${you ? "you" : ""} ${open ? "open" : ""}" data-toggle="${escape(key)}" aria-expanded="${open}">
        <div class="top">
          <span class="rank">${index + 1}</span>
          <span class="name">${escape(entry.device_label)}${you ? ' <span class="badge success">You</span>' : ""}</span>
          <span class="time">${seconds(entry.median_s)}</span>
        </div>
        <div class="meta"><span class="tag">${kind[entry.class] || "Device"} · ${where(entry.platform)}</span> ${meta}</div>
        ${specLine ? `<div class="spec">${specLine}</div>` : ""}
        <div class="track"><div class="fill" style="width:${Math.max(3, (entry.median_s / longest) * 100)}%"></div></div>
        ${runs}
      </button>`;
  }

  function renderRuns(runs) {
    const when = (unix) => new Date(unix * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const rows = runs.map((run) => {
      const thermal = run.conditions && run.conditions.thermal_after ? ` · ${escape(run.conditions.thermal_after)}` : "";
      return `<span>${seconds(run.prove_s)}</span><span>${run.threads} thr${thermal}</span><span>${when(run.created_at)}</span>`;
    }).join("");
    return `<div class="runs"><div class="runs-title">Latest runs</div><div class="runs-grid">${rows}</div></div>`;
  }

  app.addEventListener("click", (event) => {
    const filter = event.target.closest("[data-filter]");
    if (filter) {
      filters[filter.dataset.filter] = filter.dataset.value;
      syncUrl();
      if (filter.dataset.filter === "sort") {
        render();
        return;
      }
      state.open.clear();
      load();
      return;
    }
    const toggle = event.target.closest("[data-toggle]");
    if (toggle) {
      const key = toggle.dataset.toggle;
      if (state.open.has(key)) state.open.delete(key);
      else state.open.add(key);
      render();
    }
  });
  syncUrl();
  load();
})();
