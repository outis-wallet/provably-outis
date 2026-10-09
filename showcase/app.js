// The showcase: pick a Privacy Pool action, prove it on this device, see what it means. Drawn in
// Outis's look: its logo and icons come from outis/wallet/packages/ui.
// Views re-render on navigation and on run status changes; while a proof runs, tick() and the
// progress events only update the live parts (time, phases, memory) so animations keep going.
(function () {
  const { actions, phases, deviceNames } = window.SHOWCASE;
  const resultsUrl = (params0 => params0.get("results") || window.SHOWCASE.resultsUrl)(new URLSearchParams(location.search));
  // The results page, on an action's tab, keeping ?results= (another service, for testing).
  const resultsPage = (actionId) => {
    const query = new URLSearchParams();
    if (actionId) query.set("action", actionId);
    const service = new URLSearchParams(location.search).get("results");
    if (service) query.set("results", service);
    // The apps load the pages from files; on the web the results page is /prover/results.
    const page = location.protocol === "file:" ? "results.html" : "results";
    return `${page}${query.toString() ? `?${query}` : ""}`;
  };
  const engine = window.provingly;
  const app = document.getElementById("app");
  const params = new URLSearchParams(location.search);

  const state = {
    view: "home", // "home" | "action"
    actionId: null,
    sheet: null, // the bottom sheet open: "how" | null
    sheetShown: null, // the sheet drawn last, so that a redraw doesn't slide it up again
    runs: {}, // action id -> run
    running: null, // the action id being proven
    threads: Number(params.get("threads") || 0), // 0: every core
  };

  const { icon, spinner, escape, logo, seconds, clockParts, gigabytes, integer, nominalRam, ramLabel } = window.OUTIS_UI;
  const device = engine.device;
  const deviceName = device ? deviceNames[device.model] || device.name || device.model : "this device";
  const deviceLabel = () => window.OUTIS_UI.deviceLabel(device, deviceNames);
  const deviceKind = device && device.kind ? device.kind : device && /^iPad/.test(device.model) ? "iPad" : device && /^iPhone/.test(device.model) ? "iPhone" : "phone";

  const actionById = (id) => actions.find((action) => action.id === id);
  const actionIndex = (id) => actions.findIndex((action) => action.id === id);

  // Navigation: a page comes in from the right, and goes back to the left, as in Outis.
  function go(view, actionId = null) {
    const back = view === "home" && state.view === "action";
    state.view = view;
    state.actionId = actionId;
    render(back ? "enter-back" : "enter");
    window.scrollTo(0, 0);
  }

  // Finished runs (and their submission) for this session, so that going to the results page and
  // back keeps them.
  const RUNS_KEY = "outis-prover-runs";
  function saveRuns() {
    const done = {};
    for (const [id, run] of Object.entries(state.runs)) {
      if (run.status !== "done") continue;
      const submit = run.submit && run.submit.status === "done" ? run.submit : undefined;
      done[id] = { actionId: id, status: "done", report: run.report, conditions: run.conditions, submit };
    }
    try { sessionStorage.setItem(RUNS_KEY, JSON.stringify(done)); } catch (error) { /* storage off: fine */ }
  }
  function restoreRuns() {
    try { Object.assign(state.runs, JSON.parse(sessionStorage.getItem(RUNS_KEY) || "{}")); } catch (error) { /* nothing kept */ }
  }

  function render(motion = "") {
    const scrolled = app.querySelector(".sheet");
    const sheetScroll = scrolled ? scrolled.scrollTop : 0;
    app.innerHTML = state.view === "action" ? renderAction(actionById(state.actionId), motion) : renderHome(motion);
    if (state.sheet) {
      const steady = state.sheetShown === state.sheet;
      app.insertAdjacentHTML("beforeend", renderSheet(steady));
      if (steady) app.querySelector(".sheet").scrollTop = sheetScroll;
    }
    state.sheetShown = state.sheet;
    updateLive();
  }

  function renderHome(motion) {
    const ram = ramLabel(device);
    const arch = device && (device.arch || (device.platform === "ios" ? "ARM64" : null));
    const spec = device ? `${arch ? `${arch} · ` : ""}${device.cores} cores${ram ? ` · ${ram}` : ""}` : "";
    return `<main class="screen ${motion}">
      <header class="header">
        <div class="brand">${logo}</div>
        ${device ? `<div class="device"><div class="name">${escape(deviceName)}</div><div class="spec">${spec}</div></div>` : ""}
      </header>
      <h1>Privacy Pool Proofs</h1>
      <p class="lede">Each step replays a real Privacy Pool transaction from Starknet Sepolia. This ${deviceKind} builds its ZK proof itself, so the private key the proof needs never leaves it.</p>
      <div class="quick-links">
        <a class="quick-link pressable" href="${resultsPage()}">${icon("trophy")}<span><b>Results</b><small>How fast other devices build these proofs</small></span></a>
        <button class="quick-link pressable" data-do="how">${icon("help")}<span><b>How it works</b><small>What is proven, and what stays private</small></span></button>
      </div>
      <div class="section">
        <h2 class="section-title">Privacy Pool actions</h2>
        <div class="steps">${actions.map(renderStep).join("")}</div>
      </div>
      <p class="footnote">Proofs are built and checked on this device, with the verifier the network uses. Nothing is sent unless you submit your score.</p>
    </main>`;
  }

  function renderStep(action, index) {
    const run = state.runs[action.id];
    const status = run ? run.status : "idle";
    let end = icon("next");
    if (status === "done") end = `<span class="badge success">${icon("check")}${seconds(run.report.prove_s)}</span>${icon("next")}`;
    if (status === "running") end = `<span class="badge info" data-live="step-elapsed">Proving</span>${icon("next")}`;
    return `<button class="well step pressable ${status}" data-do="open" data-id="${action.id}">
      <span class="ring-icon ${status === "idle" ? "accent" : ""}">${status === "done" ? icon("check") : icon(action.icon)}</span>
      <span class="body"><div class="title">${shielded(action.title)}</div><div class="sub">Step ${index + 1} · ${escape(action.tagline)}</div></span>
      <span class="end">${end}</span>
    </button>`;
  }

  // Text with [STRK] kept as is: Outis writes a shielded token in brackets.
  const shielded = (text) => escape(text);

  function renderAction(action, motion) {
    const run = state.runs[action.id];
    let body;
    if (run && run.status === "running") body = renderRunning(action, run);
    else if (run && run.status === "done") body = renderResult(action, run);
    else body = renderIntro(action, run);
    return `<main class="screen ${motion}">
      <div class="title-bar">
        <button class="back" data-do="home" aria-label="Back">${icon("back")}</button>
        <span class="label">Step ${actionIndex(action.id) + 1} of ${actions.length}</span>
      </div>
      <h1>${shielded(action.title)}</h1>
      ${body}
    </main>`;
  }

  function renderFlow(action) {
    const { from, move, to } = action.flow;
    const end = (side) => `<div class="end"><span class="ring-icon ${side.icon === "eyeOff" ? "accent" : ""}">${icon(side.icon)}</span>${escape(side.label)}</div>`;
    const seal = move.hidden ? `<div class="seal">${icon("eyeOff")}Hidden</div>` : "";
    return `<div class="well flow">${end(from)}<div class="crossing ${move.hidden ? "hidden" : ""}"><div class="what"><span>${escape(move.text)}</span></div>${seal}</div>${end(to)}</div>`;
  }

  // What stays private, in the pool's sage; what becomes public, as Outis warns of it.
  function renderPrivacy(action) {
    const list = (items) => `<ul>${items.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>`;
    return `<div class="status private">${icon("eyeOff")}<div><div class="head">Stays private</div>${list(action.private)}</div></div>
      <div class="status warning">${icon("eye")}<div><div class="head">Public on-chain</div>${list(action.public)}</div></div>`;
  }

  function renderIntro(action, run) {
    const busy = state.running && state.running !== action.id;
    const error = run && run.status === "error"
      ? `<div class="status danger">${icon("danger")}<div><div class="head">The proof didn't finish</div><div class="selectable">${escape(run.error)}</div></div></div>` : "";
    let button;
    if (!engine.canProve) button = `<button class="button primary" disabled>Build the ZK proof</button><p class="hint">${escape(engine.unsupported || "Proofs are built in the app, on iPhone, iPad and Android.")}</p>`;
    else if (busy) button = `<button class="button primary" disabled>Another proof is being built</button>`;
    else button = `<button class="button primary" data-do="prove" data-id="${action.id}">Build the ZK proof on this ${deviceKind}</button>
      <p class="hint">About 15 to 45 seconds on a recent phone, with about 2.4 GB of memory.</p>`;
    return `<p class="lede">${escape(action.summary)}</p>
      ${renderFlow(action)}
      ${renderPrivacy(action)}
      ${error}
      <div class="buttons">${button}</div>`;
  }

  function renderRunning(action, run) {
    const rows = phases.map((phase) => `<li class="phase pending" data-phase="${phase.id}">
        <span class="mark"></span>
        <span><div class="name">${escape(phase.label)}</div><div class="detail" data-detail="${phase.id}"></div></span>
        <span class="took" data-took="${phase.id}"></span>
      </li>`).join("");
    return `<div class="well proving rise">
        <div class="clock">
          <svg viewBox="0 0 168 168" aria-hidden="true">
            <circle class="track" cx="84" cy="84" r="76" fill="none" stroke-width="6"/>
            <circle class="arc" cx="84" cy="84" r="76" fill="none" stroke-width="6" stroke-linecap="round" stroke-dasharray="110 368"/>
          </svg>
          <div class="time"><div class="seconds" data-live="clock">0.0<small>s</small></div></div>
        </div>
        <div class="now" data-live="now">Building the ZK proof…</div>
        <div class="keep">Keep the app open. The screen stays on.</div>
      </div>
      <ol class="well phases">${rows}</ol>
      <div class="well meter">
        <div class="row"><span>Memory in use</span><b data-live="memory">–</b></div>
        <div class="bar"><div class="fill" data-live="memory-bar"></div></div>
      </div>
      <div class="buttons"><button class="button primary busy" disabled>${spinner}Building the ZK proof…</button></div>`;
  }

  function renderResult(action, run) {
    const report = run.report;
    const [value, unit] = clockParts(report.prove_s);
    const peakMib = report.peak.run_mib || report.peak.footprint_mib || report.peak.rss_mib;
    const next = actions[actionIndex(action.id) + 1];
    const nextButton = next
      ? `<button class="button primary" data-do="open" data-id="${next.id}">Next: ${shielded(next.title)}</button>`
      : `<button class="button primary" data-do="home">Back to the actions</button>`;
    const identical = report.identical
      ? `<div class="status success">${icon("ok")}<div>Identical, byte for byte, to the proof StarkWare's prover builds for this transaction.</div></div>` : "";
    const simulated = report.simulated ? `<div class="status info">${icon("info")}<div>A simulated run, to preview this screen in a browser. Not a real proof.</div></div>` : "";
    const verdict = report.verified
      ? `<div class="verdict"><span class="tick">${icon("check")}</span>ZK proof built and verified</div>`
      : `<div class="verdict failed"><span class="tick">${icon("close")}</span>The proof did not verify</div>`;
    return `${verdict}
      <div class="figure rise"><span class="label">Time to build it on this ${escape(deviceName)}</span><span class="amount">${value}<small>${unit}</small></span></div>
      ${renderSubmit(action, run)}
      ${identical}${simulated}
      <div class="well rows">
        ${row("Proof", `${Math.round(report.proof_bytes / 1024)} KB`, "Sent instead of the private key and notes")}
        ${row("Peak memory", `${gigabytes(peakMib)} GB`, ramLabel(device) ? `of ${ramLabel(device)} on this ${deviceKind}` : "")}
        ${row("Steps proven", integer(report.os_steps), "Of the Starknet OS, running the action")}
        ${row("CPU cores", report.threads, "Working at once")}
      </div>
      <div class="section">
        <h2 class="section-title">What the proof says</h2>
        <div class="well claim">Running the Privacy Pool's code with <b>${escape(action.who)}'s private key</b>, on Starknet Sepolia as of block ${integer(report.block)}, gives exactly the public result below. The network checks that in milliseconds and never sees the key.</div>
        ${renderPrivacy(action)}
      </div>
      ${renderDetails(report, run)}
      <div class="buttons">${nextButton}</div>`;
  }

  // Submitting the score: the time and this device's specs go to the results, nothing else.
  function renderSubmit(action, run) {
    const submit = run.submit || {};
    // Proving again: another run, with its own score to submit.
    const rerun = (disabled) => `<button class="button secondary" data-do="prove" data-id="${action.id}" ${disabled ? "disabled" : ""}>${icon("again")}Rerun</button>`;
    if (submit.status === "done") {
      const place = submit.position ? `#${integer(submit.position)} of ${integer(submit.of)} for this step` : "Saved";
      return `<div class="submit"><div class="status success">${icon("ok")}<div><b>Score submitted</b> · ${place}</div></div>
        <div class="button-row"><a class="button secondary" href="${resultsPage(action.id)}">${icon("trophy")}See results</a>${rerun(false)}</div></div>`;
    }
    const failed = submit.status === "failed" ? `<div class="status danger">${icon("danger")}<div>${escape(submit.error)}</div></div>` : "";
    const busy = submit.status === "submitting";
    return `<div class="submit">${failed}
      <div class="button-row">
        <button class="button primary ${busy ? "busy" : ""}" data-do="submit" data-id="${action.id}" ${busy ? "disabled" : ""}>${busy ? spinner : icon("upload")}${busy ? "Submitting…" : failed ? "Try again" : "Submit score"}</button>
        ${rerun(busy)}
      </div>
      <p class="hint">Sends the time and this ${escape(deviceKind)}'s specs (${escape(deviceLabel())}) to the results.</p></div>`;
  }

  async function submitScore(actionId) {
    const run = state.runs[actionId];
    if (!run || run.status !== "done" || (run.submit && ["submitting", "done"].includes(run.submit.status))) return;
    const report = run.report;
    const peak = report.peak || {};
    const spec = {};
    for (const key of ["platform", "model", "name", "os", "form", "arch", "cores", "ramGiB", "ramAtLeast", "hardware", "gpu", "chip", "soc", "perfCores", "efficiencyCores"]) {
      if (device && device[key] !== undefined && device[key] !== null) spec[key] = typeof device[key] === "string" ? device[key].slice(0, 100) : device[key];
    }
    const payload = {
      action: actionId,
      build: report.build || (window.provinglyNative && window.provinglyNative.build) || `${engine.platform}-unknown`,
      platform: ["ios", "android"].includes(engine.platform) ? engine.platform : "web",
      device_label: deviceLabel().slice(0, 100),
      device: spec,
      conditions: run.conditions || {},
      report: {
        prove_s: report.prove_s, total_s: report.total_s, os_s: report.os_s, input_s: report.input_s, verify_s: report.verify_s,
        threads: report.threads, os_steps: report.os_steps, proof_bytes: report.proof_bytes, verified: report.verified,
        identical: Boolean(report.identical), simulated: Boolean(report.simulated), peak_mib: peak.run_mib || peak.footprint_mib || peak.rss_mib || null,
      },
    };
    run.submit = { status: "submitting" };
    render();
    try {
      const response = await fetch(`${resultsUrl}/v1/results`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ? `Not accepted: ${body.error}` : `The results service answered ${response.status}`);
      run.submit = { status: "done", id: body.id, position: body.position, of: body.of };
      const mine = JSON.parse(localStorage.getItem("outis-prover-submissions") || "[]");
      mine.push({ id: body.id, action: actionId, label: payload.device_label });
      localStorage.setItem("outis-prover-submissions", JSON.stringify(mine.slice(-200)));
    } catch (problem) {
      run.submit = { status: "failed", error: problem.message || "Couldn't reach the results service" };
    }
    saveRuns();
    if (state.view === "action" && state.actionId === actionId) render();
  }

  const row = (key, value, note) => `<div class="row"><span class="key">${key}</span><span class="value">${value}${note ? `<small>${escape(note)}</small>` : ""}</span></div>`;

  function renderDetails(report, run) {
    const conditions = run.conditions || {};
    const thermal = conditions.thermal_before ? `${conditions.thermal_before} → ${conditions.thermal_after}` : "–";
    return `<details class="more"><summary>${icon("next")}Technical details</summary>
      <div class="well rows">
        ${row("Network", "Starknet Sepolia")}
        ${row("Base block", integer(report.block))}
        ${row("Proof", "Stwo STARK, PROOF2")}
        ${row("Reading and running", seconds(report.input_s))}
        ${row("Starknet OS", seconds(report.os_s))}
        ${row("Proving", seconds(report.prove_s))}
        ${row("Verifying", seconds(report.verify_s))}
        ${row("Peak memory", `${integer(report.peak.run_mib || 0)} MiB`)}
        ${row("Device", device ? `${escape(deviceName)}, ${escape(device.os || "")}` : "–")}
        ${row("Thermal state", escape(thermal))}
        ${report.verify_error ? row("Verifier", escape(report.verify_error)) : ""}
        <div class="row" style="flex-direction:column;align-items:stretch;gap:6px"><span class="key">Transaction</span><span class="code selectable">${escape(report.tx_hash)}</span></div>
      </div></details>`;
  }

  function renderSheet(steady) {
    const how = (iconName, title, text) => `<div class="how"><span class="ring-icon accent">${icon(iconName)}</span><div><div class="title">${title}</div><p>${text}</p></div></div>`;
    return `<div class="scrim ${steady ? "steady" : ""}" data-do="close"></div>
      <div class="sheet ${steady ? "steady" : ""}" role="dialog" aria-label="How it works">
        <div class="grabber"></div>
        <h1>How it works</h1>
        <p class="lede">The Privacy Pool keeps amounts, and which notes pay for what, out of sight. Every action still has to follow the pool's rules. A ZK proof shows that it does without showing the secrets.</p>
        ${how("phone", `This ${deviceKind} runs the action`, "It executes the pool's code with the private key and notes, on the Starknet state of a recent block.")}
        ${how("proof", "It builds a ZK proof", "About 220 KB that shows the run followed Starknet's rules exactly. Building it is the heavy part: hundreds of thousands of steps, on every core.")}
        ${how("network", "The network checks the proof", "Starknet verifies it in milliseconds instead of running the action again, so it never needs the key or the notes.")}
        ${how("eyeOff", "Only the result is public", "The pool records which notes were spent and the new ones, encrypted. Amounts show only where tokens are shielded or unshielded.")}
        <div class="status info">${icon("info")}<div>Proving on a server would mean sending it the private key. Here it stays on this ${deviceKind}. This demo replays past transactions and sends nothing.</div></div>
        <div class="buttons"><button class="button secondary" data-do="close">Close</button></div>
      </div>`;
  }

  // Live updates while a proof runs.
  function updateLive() {
    const run = state.running && state.runs[state.running];
    if (!run) return;
    const now = performance.now();
    const elapsed = (now - run.startedAt) / 1000;
    const set = (name, html) => app.querySelectorAll(`[data-live="${name}"]`).forEach((element) => { element.innerHTML = html; });
    const [value, unit] = clockParts(elapsed);
    set("clock", `${value}<small>${unit}</small>`);
    set("step-elapsed", `Proving · ${Math.floor(elapsed)} s`);
    if (state.view !== "action" || state.actionId !== run.actionId) return;
    const activeIndex = phases.findIndex((phase) => phase.id === run.phase);
    const current = phases[activeIndex];
    set("now", current ? escape(current.doing) : "Starting…");
    phases.forEach((phase, index) => {
      const row = app.querySelector(`[data-phase="${phase.id}"]`);
      if (!row) return;
      const status = index < activeIndex ? "done" : index === activeIndex ? "working" : "pending";
      if (!row.classList.contains(status)) {
        row.classList.remove("pending", "working", "done");
        row.classList.add(status);
        row.querySelector(".mark").innerHTML = status === "done" ? icon("check") : status === "working" ? spinner : "";
      }
      const started = run.phaseStarted[phase.id];
      const ended = run.phaseEnded[phase.id];
      row.querySelector(`[data-took="${phase.id}"]`).textContent = started ? seconds(((ended || now) - started) / 1000) : "";
      row.querySelector(`[data-detail="${phase.id}"]`).textContent = phaseDetail(phase, run);
    });
    if (run.memoryMib) {
      const total = device ? nominalRam(device.ramGiB) : 0;
      set("memory", `${gigabytes(run.memoryMib)} GB${total ? ` of ${ramLabel(device)}` : ""}`);
      const bar = app.querySelector('[data-live="memory-bar"]');
      if (bar && total) bar.style.width = `${Math.min(100, (run.memoryMib / 1024 / total) * 100)}%`;
    }
  }

  function phaseDetail(phase, run) {
    if (phase.id === "state") return run.block ? `Block ${integer(run.block)}, Starknet Sepolia` : "Starknet Sepolia";
    if (phase.id === "os") return run.steps ? `${integer(run.steps)} steps` : "Starknet's own program, on this one action";
    if (phase.id === "prove") return `The heavy part, on ${run.threads || "every"} CPU cores`;
    return phase.detail || "";
  }

  let ticker = null;
  function startProof(actionId) {
    if (state.running) return;
    state.runs[actionId] = { actionId, status: "running", startedAt: performance.now(), phase: null, phaseStarted: {}, phaseEnded: {}, threads: state.threads || (device && device.cores) };
    state.running = actionId;
    engine.prove(actionId, state.threads);
    render();
    ticker = setInterval(updateLive, 100);
  }

  function finish(run, fields) {
    Object.assign(run, fields);
    if (run.status === "done") saveRuns();
    if (run.phase && !run.phaseEnded[run.phase]) run.phaseEnded[run.phase] = performance.now();
    state.running = null;
    clearInterval(ticker);
    render();
    window.scrollTo(0, 0);
    // For testing: ?autosubmit submits the score when the proof is done.
    if (params.has("autosubmit") && run.status === "done") submitScore(run.actionId);
  }

  engine.onMessage = (message) => {
    if (message.type === "auto") {
      state.threads = Number(message.threads || 0);
      go("action", message.action);
      startProof(message.action);
      return;
    }
    const run = state.running && state.runs[state.running];
    if (!run) return;
    if (message.type === "event") {
      const event = message.event;
      const now = performance.now();
      if (event.event === "phase") {
        if (run.phase) run.phaseEnded[run.phase] = now;
        run.phase = event.phase;
        run.phaseStarted[event.phase] = now;
      } else if (event.event === "transaction") {
        run.block = event.block;
      } else if (event.event === "os_steps") {
        run.steps = event.steps;
      } else if (event.event === "memory") {
        run.memoryMib = event.mib;
      }
      updateLive();
    } else if (message.type === "result") {
      finish(run, { status: "done", report: message.report, conditions: message.conditions });
    } else if (message.type === "error") {
      finish(run, { status: "error", error: message.message });
    }
  };

  app.addEventListener("click", (event) => {
    const target = event.target.closest("[data-do]");
    if (!target) return;
    const id = target.dataset.id;
    switch (target.dataset.do) {
      case "open": go("action", id); break;
      case "home": go("home"); break;
      case "prove": startProof(id); break;
      case "submit": submitScore(id); break;
      case "how": state.sheet = "how"; render(); break;
      case "close": state.sheet = null; render(); break;
    }
  });

  // Android's back button: true when the page handled it.
  engine.back = () => {
    if (state.sheet) { state.sheet = null; render(); return true; }
    if (state.view !== "home") { go("home"); return true; }
    return false;
  };

  // Old links: #results[/<action>] is the results page now.
  const [hashView, hashAction] = location.hash.slice(1).split("/");
  if (hashView === "results") {
    location.replace(resultsPage(actionById(hashAction) ? hashAction : null));
    return;
  }
  restoreRuns();
  render("rise");
  engine.onDevice = () => { if (!state.running) render(); };
  engine.ready();
  if (params.has("auto") && engine.canProve) {
    const action = params.get("action") || "pay";
    go("action", action);
    startProof(action);
  }
})();
