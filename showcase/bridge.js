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
// In a plain browser, ?mock simulates a run so the UI can be designed without a device.
(function () {
  const ios = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.prover;
  const android = window.ProvinglyAndroid;
  const mock = !ios && !android && new URLSearchParams(location.search).has("mock");

  const post = (message) => {
    if (ios) ios.postMessage(message);
    else if (android) android.postMessage(JSON.stringify(message));
    else if (mock) mockEngine(message);
  };

  let device = null;
  if (window.provinglyNative && window.provinglyNative.device) device = window.provinglyNative.device;
  else if (android && android.deviceJson) device = JSON.parse(android.deviceJson());
  else if (mock) device = { platform: "mock", model: "iPhone18,1", os: "iOS 26.5", cores: 6, ramGiB: 11.4 };

  window.provingly = {
    platform: ios ? "ios" : android ? "android" : mock ? "mock" : "browser",
    canProve: Boolean(ios || android || mock),
    device,
    onMessage: () => {},
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
})();
