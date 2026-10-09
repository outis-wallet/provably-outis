// The showcase: pick a Privacy Pool action, prove it on this device, see what it means. Drawn in
// Outis's look: its logo and icons come from outis/wallet/packages/ui.
// Views re-render on navigation and on run status changes; while a proof runs, tick() and the
// progress events only update the live parts (time, phases, memory) so animations keep going.
(function () {
  const { actions, phases, referenceDevices, deviceNames } = window.SHOWCASE;
  const engine = window.provingly;
  const app = document.getElementById("app");
  const params = new URLSearchParams(location.search);

  const state = {
    view: "home", // "home" | "action"
    actionId: null,
    sheet: false,
    runs: {}, // action id -> run
    running: null, // the action id being proven
    threads: Number(params.get("threads") || 0), // 0: every core
  };

  // Outis's line icons (packages/ui/src/Icon.tsx), and a few more in the same style.
  const ICONS = {
    pay: '<path d="M7 17 17 7M8 7h9v9"/>',
    shieldDown: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6Z"/><path d="M12 8.5v7m-3-3 3 3 3-3"/>',
    shieldUp: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6Z"/><path d="M12 15.5v-7m-3 3 3-3 3 3"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6Z"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/>',
    eye: '<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M10.6 5.1A9 9 0 0 1 12 5c6 0 9.5 7 9.5 7a16 16 0 0 1-2.4 3.3M6.6 6.6C3.9 8.3 2.5 12 2.5 12S6 19 12 19a9 9 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/>',
    back: '<path d="m15 5-7 7 7 7"/>',
    next: '<path d="m9 5 7 7-7 7"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 9.2-9.2m-3 3 2.5 2.5M14 9l2 2"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.3M12 17h.01"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
    warn: '<path d="M10.3 4a2 2 0 0 1 3.4 0l7.1 12.5a2 2 0 0 1-1.7 3H4.9a2 2 0 0 1-1.7-3Z"/><path d="M12 9v4m0 3h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
    danger: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    share: '<path d="M12 15V4m-4 4 4-4 4 4"/><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    again: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>',
    phone: '<rect x="6.5" y="3" width="11" height="18" rx="2.5"/><path d="M10.5 18h3"/>',
    proof: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13.5l2 2 4-4.5"/>',
    network: '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="M11 6.8 6 16.2M13 6.8l5 9.4M7 18h10"/>',
  };
  const icon = (name, extra = "") => `<svg class="i ${extra}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  const spinner = '<svg class="spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.3" stroke-width="2.5"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
  const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // Outis's mark and name (packages/ui/src/brand.ts).
  const MARK = "M499.2 230H407.74C278.77 230 250 98.37 250 97.37C250 98.37 221.23 230 92.26 230H0.8A250 250 0 0 1 499.2 230ZM499.2 270A250 250 0 0 1 0.8 270H92.26C221.23 270 250 401.63 250 402.63C250 401.63 278.77 270 407.74 270Z";
  const WORDMARK = "M264.99 142.14Q251 142.14 239.38 135.99Q227.75 129.84 220.83 117.76Q213.91 105.69 213.91 87.95Q213.91 74.6 217.98 64.48Q222.05 54.35 229.21 47.47Q236.38 40.59 245.56 37.14Q254.75 33.69 264.99 33.69Q279.01 33.69 290.62 39.82Q302.23 45.95 309.14 58.03Q316.06 70.1 316.06 87.95Q316.06 105.69 309.26 117.76Q302.45 129.84 290.9 135.99Q279.35 142.14 264.99 142.14ZM264.99 124.1Q274.33 124.1 281 119.62Q287.68 115.14 291.27 107Q294.88 98.86 294.88 87.95Q294.88 76.93 291.27 68.79Q287.68 60.65 281 56.19Q274.33 51.73 264.99 51.73Q255.65 51.73 248.98 56.24Q242.3 60.76 238.7 68.9Q235.1 77.04 235.1 87.95Q235.1 98.86 238.7 107Q242.3 115.14 248.98 119.62Q255.65 124.1 264.99 124.1ZM367.96 141.73Q355.03 141.73 347.64 137.07Q340.25 132.43 337.27 124.21Q334.29 116 334.29 105.24L334.29 61.4L353.86 61.4L353.86 102.46Q353.86 110.49 355.29 115.44Q356.71 120.39 360.14 122.66Q363.58 124.93 369.35 124.93Q372.73 124.93 375.97 124.59Q379.21 124.25 381.16 123.91L381.16 61.4L400.7 61.4L400.7 137.3Q395.3 138.84 386.66 140.28Q378.01 141.73 367.96 141.73ZM452 141.76Q440.41 141.76 433.87 137.69Q427.33 133.63 424.72 126.16Q422.11 118.7 422.11 108.46L422.11 41.04L441.69 37.85L441.69 61.4L469.44 61.4L469.44 77.71L441.69 77.71L441.69 108.46Q441.69 114.01 442.94 117.74Q444.2 121.48 447.11 123.28Q450.01 125.08 454.92 125.08Q459.05 125.08 462.88 124.23Q466.7 123.39 469.63 122.23L472.59 137.56Q468.99 139.14 463.98 140.45Q458.98 141.76 452 141.76ZM487.48 140L487.48 61.4L507.05 61.4L507.05 140L487.48 140ZM497.34 47.3Q492.46 47.3 488.9 44.09Q485.34 40.89 485.34 35.34Q485.34 29.83 488.9 26.62Q492.46 23.41 497.34 23.41Q502.21 23.41 505.78 26.62Q509.34 29.83 509.34 35.34Q509.34 40.89 505.78 44.09Q502.21 47.3 497.34 47.3ZM550.21 142.03Q539.83 142.03 533.19 140.24Q526.55 138.46 524.04 137.34L527.53 121.25Q532.21 123.09 537.99 124.53Q543.76 125.98 550.33 125.98Q557 125.98 560.19 124.44Q563.38 122.9 563.38 118.74Q563.38 116.38 561.8 114.69Q560.22 113 557.04 111.35Q553.85 109.7 548.75 107.79Q542.11 105.16 536.94 102.24Q531.76 99.31 528.86 94.72Q525.95 90.13 525.95 82.74Q525.95 75.5 529.59 70.31Q533.22 65.11 539.92 62.24Q546.61 59.38 555.91 59.38Q563.26 59.38 569.56 60.67Q575.86 61.96 579.35 63.35L575.79 78.84Q572.38 77.56 567.86 76.42Q563.34 75.28 557.08 75.28Q551.56 75.28 548.43 77Q545.3 78.72 545.3 82.4Q545.3 84.65 546.46 86.34Q547.63 88.03 550.51 89.53Q553.4 91.03 558.54 92.94Q567.58 96.28 572.86 99.67Q578.15 103.06 580.51 107.58Q582.88 112.1 582.88 118.85Q582.88 126.46 579.05 131.62Q575.22 136.78 567.93 139.4Q560.64 142.03 550.21 142.03Z";
  const logo = `<svg class="logo" viewBox="0 0 620 176" role="img" aria-label="Outis"><path class="mark" transform="translate(8 8) scale(.32)" d="${MARK}"/><path class="name" d="${WORDMARK}"/></svg>`;

  // Formatting for people, not engineers. [STRK] is a shielded amount, as in Outis.
  const seconds = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${s.toFixed(1)} s`);
  const clockParts = (s) => (s >= 60 ? [`${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`, "min"] : [s.toFixed(1), "s"]);
  const gigabytes = (mib) => (mib / 1024).toFixed(1);
  const integer = (n) => Number(n).toLocaleString("en-US");
  const nominalRam = (gib) => [2, 3, 4, 6, 8, 12, 16, 18, 24, 32, 36, 48, 64, 96, 128].find((size) => size >= gib * 0.93) || Math.round(gib);
  const device = engine.device;
  const deviceName = device ? deviceNames[device.model] || device.name || device.model : "this device";
  const deviceKind = device && /^iPad/.test(device.model) ? "iPad" : device && /^iPhone/.test(device.model) ? "iPhone" : "phone";

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

  function render(motion = "") {
    app.innerHTML = state.view === "action" ? renderAction(actionById(state.actionId), motion) : renderHome(motion);
    if (state.sheet) app.insertAdjacentHTML("beforeend", renderSheet());
    updateLive();
  }

  function renderHome(motion) {
    const spec = device ? `${device.cores} cores · ${nominalRam(device.ramGiB)} GB` : "";
    return `<main class="screen ${motion}">
      <header class="header">
        <div class="brand">${logo}<span class="tag">Prover</span></div>
        ${device ? `<div class="device"><div class="name">${escape(deviceName)}</div><div class="spec">${spec}</div></div>` : ""}
      </header>
      <h1>Private actions, proven on this ${deviceKind}</h1>
      <p class="lede">Each step is a real Privacy Pool transaction, recorded on Starknet Sepolia. This ${deviceKind} builds its ZK proof itself, so the private key the proof needs never leaves it.</p>
      <div class="section">
        <h2 class="section-title">Four steps</h2>
        <div class="steps">${actions.map(renderStep).join("")}</div>
      </div>
      <button class="well step pressable" data-do="how">
        <span class="ring-icon">${icon("help")}</span>
        <span class="body"><div class="title">How does this work?</div><div class="sub">What is proven, and what stays private</div></span>
        <span class="end">${icon("next")}</span>
      </button>
      <p class="footnote">Proofs are built and checked on this device, with the verifier the network uses. Nothing is sent.</p>
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
    if (!engine.canProve) button = `<button class="button primary" disabled>Build the ZK proof</button><p class="hint">Proofs are built in the app, on iPhone, iPad and Android.</p>`;
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
      : `<button class="button primary" data-do="home">Back to the four steps</button>`;
    const identical = report.identical
      ? `<div class="status success">${icon("ok")}<div>Identical, byte for byte, to the proof StarkWare's prover builds for this transaction.</div></div>` : "";
    const simulated = report.simulated ? `<div class="status info">${icon("info")}<div>A simulated run, to preview this screen in a browser. Not a real proof.</div></div>` : "";
    const verdict = report.verified
      ? `<div class="verdict"><span class="tick">${icon("check")}</span>ZK proof built and verified</div>`
      : `<div class="verdict failed"><span class="tick">${icon("close")}</span>The proof did not verify</div>`;
    return `${verdict}
      <div class="figure rise"><span class="label">Time to build it on this ${escape(deviceName)}</span><span class="amount">${value}<small>${unit}</small></span></div>
      ${identical}${simulated}
      <div class="well rows">
        ${row("Proof", `${Math.round(report.proof_bytes / 1024)} KB`, "Sent instead of the private key and notes")}
        ${row("Peak memory", `${gigabytes(peakMib)} GB`, device ? `of ${nominalRam(device.ramGiB)} GB on this ${deviceKind}` : "")}
        ${row("Steps proven", integer(report.os_steps), "Of the Starknet OS, running the action")}
        ${row("CPU cores", report.threads, "Working at once")}
      </div>
      <div class="section">
        <h2 class="section-title">What the proof says</h2>
        <div class="well claim">Running the Privacy Pool's code with <b>${escape(action.who)}'s private key</b>, on Starknet Sepolia as of block ${integer(report.block)}, gives exactly the public result below. The network checks that in milliseconds and never sees the key.</div>
        ${renderPrivacy(action)}
      </div>
      <div class="section">
        <h2 class="section-title">Compared with other devices</h2>
        ${renderCompare(report)}
      </div>
      ${renderDetails(report, run)}
      <div class="buttons">
        ${nextButton}
        <div class="button-row">
          <button class="button secondary" data-do="share" data-id="${action.id}">${icon("share")}Share</button>
          <button class="button secondary" data-do="prove" data-id="${action.id}">${icon("again")}Prove again</button>
        </div>
      </div>`;
  }

  const row = (key, value, note) => `<div class="row"><span class="key">${key}</span><span class="value">${value}${note ? `<small>${escape(note)}</small>` : ""}</span></div>`;

  function renderCompare(report) {
    const entries = referenceDevices.filter((entry) => entry.name !== deviceName).map((entry) => ({ ...entry }));
    entries.push({ name: `This ${deviceName}`, seconds: report.prove_s, you: true });
    entries.sort((a, b) => a.seconds - b.seconds);
    const longest = Math.max(...entries.map((entry) => entry.seconds));
    const rows = entries.map((entry, index) => `<div class="${entry.you ? "you" : ""}">
        <div class="labels"><span>${escape(entry.name)}</span><span>${seconds(entry.seconds)}</span></div>
        <div class="track"><div class="fill" style="width:${Math.max(3, (entry.seconds / longest) * 100)}%;animation-delay:${index * 60}ms"></div></div>
      </div>`).join("");
    return `<div class="well compare">${rows}<div class="caption">Time to build this proof natively. Shorter is faster.</div></div>`;
  }

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

  function renderSheet() {
    const how = (iconName, title, text) => `<div class="how"><span class="ring-icon accent">${icon(iconName)}</span><div><div class="title">${title}</div><p>${text}</p></div></div>`;
    return `<div class="scrim" data-do="close"></div>
      <div class="sheet" role="dialog" aria-label="How it works">
        <div class="grabber"></div>
        <h1>How it works</h1>
        <p class="lede">The Privacy Pool keeps amounts, and which notes pay for what, out of sight. Every action still has to follow the pool's rules. A ZK proof shows that it does without showing the secrets.</p>
        ${how("phone", `This ${deviceKind} runs the action`, "It executes the pool's code with the private key and notes, on the Starknet state of a recent block.")}
        ${how("proof", "It builds a ZK proof", "About 220 KB that shows the run followed Starknet's rules exactly. Building it is the heavy part: hundreds of thousands of steps, on every core.")}
        ${how("network", "The network checks the proof", "Starknet verifies it in milliseconds instead of running the action again, so it never needs the key or the notes.")}
        ${how("eyeOff", "Only the result is public", "The pool records which notes were spent and the new ones, encrypted. Amounts show only where tokens are shielded or unshielded.")}
        <div class="status info">${icon("info")}<div>Proving on a server would mean sending it the private key. Here it stays on this ${deviceKind}. This demo proves recorded transactions and sends nothing.</div></div>
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
      set("memory", `${gigabytes(run.memoryMib)} GB${total ? ` of ${total} GB` : ""}`);
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
    if (run.phase && !run.phaseEnded[run.phase]) run.phaseEnded[run.phase] = performance.now();
    state.running = null;
    clearInterval(ticker);
    render();
    window.scrollTo(0, 0);
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

  function shareText(action) {
    const report = state.runs[action.id].report;
    return `My ${deviceName} built the ZK proof for a Starknet Privacy Pool action ("${action.title}") in ${seconds(report.prove_s)}: ${Math.round(report.proof_bytes / 1024)} KB, ${gigabytes(report.peak.run_mib || 0)} GB of memory, ${integer(report.os_steps)} steps, verified on the device. The private key never left it.`;
  }

  app.addEventListener("click", (event) => {
    const target = event.target.closest("[data-do]");
    if (!target) return;
    const id = target.dataset.id;
    switch (target.dataset.do) {
      case "open": go("action", id); break;
      case "home": go("home"); break;
      case "prove": startProof(id); break;
      case "share": engine.share(shareText(actionById(id))); break;
      case "how": state.sheet = true; render(); break;
      case "close": state.sheet = false; render(); break;
    }
  });

  // Android's back button: true when the page handled it.
  engine.back = () => {
    if (state.sheet) { state.sheet = false; render(); return true; }
    if (state.view === "action") { go("home"); return true; }
    return false;
  };

  render("rise");
  engine.ready();
  if (params.has("auto") && engine.canProve) {
    const action = params.get("action") || "pay";
    go("action", action);
    startProof(action);
  }
})();
