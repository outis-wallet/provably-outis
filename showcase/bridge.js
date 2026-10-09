// The engine behind the UI. The native apps prove with the Rust pipeline (os_wasm_probe::replay)
// and talk to this page through one contract, the same on iOS and Android:
//
//   page -> native: a JSON message {type: "prove", action, threads} | {type: "share", text} |
//                   {type: "ready"}
//     iOS:     window.webkit.messageHandlers.prover.postMessage(message)
//     Android: window.ProvinglyAndroid.postMessage(JSON.stringify(message))
//   native -> page: provingly.receive(message) with
//     {type: "event", event}               a Progress event (phase, transaction, os_steps, memory, note)
//     {type: "result", report, conditions} the Report and the device conditions around the run
//     {type: "error", message}
//     {type: "auto", action, threads}      start a proof (launch arguments, for testing)
//   device info: iOS sets window.provinglyNative = {device} before the page loads; Android
//     returns it from ProvinglyAndroid.deviceJson().
//
// In a plain browser the page proves itself: the web engine below runs the same pipeline compiled
// to WebAssembly (threads through wasm-bindgen-rayon) in a Web Worker, on the bundled captures.
// It needs cross-origin isolation (COOP/COEP headers) for shared memory. ?mock simulates a run
// instead, so the UI can be designed without a prover.
(function () {
  const ios = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.prover;
  const android = window.ProvinglyAndroid;
  const params = new URLSearchParams(location.search);
  const mock = !ios && !android && params.has("mock");
  const web = !ios && !android && !mock;
  const webReady = web && typeof WebAssembly === "object" && typeof SharedArrayBuffer === "function" && self.crossOriginIsolated === true;

  const post = (message) => {
    if (ios) ios.postMessage(message);
    else if (android) android.postMessage(JSON.stringify(message));
    else if (mock) mockEngine(message);
    else if (webReady) webEngine(message);
  };

  let device = null;
  if (window.provinglyNative && window.provinglyNative.device) device = window.provinglyNative.device;
  else if (android && android.deviceJson) device = JSON.parse(android.deviceJson());
  else if (mock) device = { platform: "mock", model: "iPhone18,1", os: "iOS 26.5", cores: 6, ramGiB: 11.4 };
  else if (web) device = webDevice();

  window.provingly = {
    platform: ios ? "ios" : android ? "android" : mock ? "mock" : "web",
    canProve: Boolean(ios || android || mock || webReady),
    unsupported: web && !webReady ? "This browser can't run the prover here: it needs WebAssembly with shared memory (threads)." : null,
    device,
    onMessage: () => {},
    onDevice: () => {}, // the device became better known (the browser's client hints arrived)
    prove: (action, threads) => post({ type: "prove", action, threads }),
    share: (text) => {
      if (ios || android) post({ type: "share", text });
      else if (navigator.share) navigator.share({ text }).catch(() => {});
      else navigator.clipboard && navigator.clipboard.writeText(text);
    },
    ready: () => post({ type: "ready" }),
    receive: (message) => window.provingly.onMessage(message),
  };

  // A pretend run with plausible timings, clearly labelled as simulated in the report.
  function mockEngine(message) {
    if (message.type !== "prove") return;
    const send = (payload, delay) => setTimeout(() => window.provingly.receive(payload), delay);
    const event = (event, delay) => send({ type: "event", event }, delay);
    const blocks = { register: 16274091, deposit: 16274129, pay: 16274179, withdraw: 16274228 };
    const steps = { register: 381442, deposit: 450235, pay: 459169, withdraw: 461365 };
    const proveMs = 9000;
    event({ event: "phase", phase: "state" }, 100);
    event({ event: "transaction", block: blocks[message.action], tx_hash: "0x17ea3101f25cc0058692d4e906fb1a822d94234330385b27ce15ce3d1b285fd" }, 250);
    event({ event: "phase", phase: "execute" }, 400);
    event({ event: "phase", phase: "os" }, 700);
    event({ event: "os_steps", steps: steps[message.action] }, 1100);
    event({ event: "phase", phase: "prove" }, 1150);
    for (let t = 0; t <= proveMs; t += 250) {
      const mib = Math.round(300 + 2050 * Math.min(1, t / (proveMs * 0.45)) - (t > proveMs * 0.8 ? 900 : 0));
      event({ event: "memory", mib }, 1150 + t);
    }
    event({ event: "phase", phase: "verify" }, 1150 + proveMs);
    send({
      type: "result",
      report: {
        simulated: true, block: blocks[message.action], tx_hash: "0x17ea3101f25cc0058692d4e906fb1a822d94234330385b27ce15ce3d1b285fd",
        threads: 6, rounds: 4, input_s: 0.16, os_s: 0.25, prove_s: proveMs / 1000, verify_s: 0.06, total_s: proveMs / 1000 + 0.5,
        os_steps: steps[message.action], verified: true, verify_error: null, identical: true, proof_bytes: 232779,
        peak: { run_mib: 2385, rss_mib: 2571, footprint_mib: 2385 },
      },
      conditions: { thermal_before: "nominal", thermal_after: "nominal", low_power_mode: false },
    }, 1250 + proveMs);
  }

  // The browser, described like the apps describe the device. RAM only where the browser tells it
  // (Chromium's deviceMemory, rounded down to a power of two and capped, 32 GB in Chrome 154): a
  // lower bound, hence ramAtLeast. null elsewhere.
  function webDevice() {
    const ua = navigator.userAgent;
    const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "iOS"
      : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
    const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
    const gpu = webGpu();
    const device = { platform: "web", kind: "browser", model: `${browser}-${os}`, name: os ? `${browser} on ${os}` : browser, os, cores: navigator.hardwareConcurrency || 1, ramGiB: navigator.deviceMemory || null, ramAtLeast: true, arch: uaArch(ua, os, gpu), gpu };
    // Chromium tells the architecture (and an Android phone's model) through client hints, later.
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      navigator.userAgentData.getHighEntropyValues(["architecture", "bitness", "model", "platformVersion"]).then((hints) => {
        const arch = hints.architecture === "arm" ? (hints.bitness === "32" ? "ARM" : "ARM64") : hints.architecture === "x86" ? (hints.bitness === "32" ? "x86" : "x86-64") : null;
        if (arch) device.arch = arch;
        if (hints.model) device.hardware = hints.model;
        window.provingly.onDevice();
      }).catch(() => {});
    }
    return device;
  }

  // The architecture as far as the user agent shows it. Safari on a Mac says "Intel" even on Apple
  // silicon, where its GPU is "Apple ...", and iPhones and iPads are all ARM64.
  function uaArch(ua, os, gpu) {
    if (/aarch64|arm64/i.test(ua)) return "ARM64";
    if (/x86_64|x64|Win64|WOW64|amd64/i.test(ua)) return "x86-64";
    if (os === "iOS") return "ARM64";
    if (os === "macOS") return /Apple/.test(gpu || "") ? "ARM64" : /Intel|AMD|Radeon/.test(gpu || "") ? "x86-64" : null;
    if (os === "Android") return /x86/i.test(ua) ? "x86" : "ARM64";
    return null;
  }

  // The GPU's name from WebGL, when the browser gives it: it often names the chip as well.
  function webGpu() {
    try {
      const gl = document.createElement("canvas").getContext("webgl");
      const info = gl && gl.getExtension("WEBGL_debug_renderer_info");
      return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null;
    } catch (error) {
      return null;
    }
  }

  // One worker per proof: ending it frees the run's wasm memory, which never shrinks otherwise.
  // While the worker is inside a long synchronous call (the proof), this side reads the size of
  // its shared wasm memory every 250 ms for the memory figure.
  let worker = null;
  function webEngine(message) {
    if (message.type !== "prove" || worker) return;
    // Past about 8 threads wasm gets slower, not faster (36 threads: 46 s, 8 threads: 29 s on the
    // same desktop), and every thread adds memory.
    const threads = message.threads || Math.min(navigator.hardwareConcurrency || 4, 8);
    const receive = (payload) => window.provingly.receive(payload);
    let memory = null;
    const poll = setInterval(() => {
      if (memory) receive({ type: "event", event: { event: "memory", mib: Math.round(memory.buffer.byteLength / 2 ** 20) } });
    }, 250);
    const end = () => { clearInterval(poll); worker.terminate(); worker = null; };
    worker = new Worker("engine/worker.mjs", { type: "module" });
    worker.onmessage = ({ data }) => {
      if (data.memory) memory = data.memory;
      else if (data.event) receive({ type: "event", event: data.event });
      else if (data.report) {
        end();
        receive({ type: "result", report: data.report, conditions: {} });
        if (params.has("report")) fetch("/result", { method: "POST", body: JSON.stringify({ page: "showcase", action: message.action, report: data.report, ua: navigator.userAgent }) }).catch(() => {});
      } else if (data.error) {
        end();
        receive({ type: "error", message: data.error });
        if (params.has("report")) fetch("/result", { method: "POST", body: JSON.stringify({ page: "showcase", action: message.action, error: data.error, ua: navigator.userAgent }) }).catch(() => {});
      }
    };
    worker.onerror = (event) => { end(); receive({ type: "error", message: event.message || "The prover's worker failed to start" }); };
    worker.postMessage({ action: message.action, threads });
  }
})();
