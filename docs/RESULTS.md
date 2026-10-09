# Scores and the results page

People can submit their proving time with their device's specs. A results page ranks the devices.
The web build (outis.cash/prover) does this already. This document is what the iOS and Android
apps need: very little, since the submission and the results page are the shared UI's
(`showcase/app.js`), not the native shells'.

## The pieces

| Piece | Where | What it is |
|---|---|---|
| Service | `outis/prover-results/` (Rust, axum, SQLite) | `POST /v1/results` stores a score; `GET /v1/results?action=<id>` ranks the devices; `GET /v1/summary`; `GET /health`. |
| Public URL | `https://rpc.outis.cash/prover-results` (`resultsUrl` in `showcase/content.js`) | Caddy on the Sepolia node's host, to `127.0.0.1:8095`. Any origin (CORS `*`), GET and POST. |
| UI | `showcase/app.js` | A "Submit score" button by the time on the result screen (Share and "Prove again" are gone), a Results row on the home screen, and the results page: tabs per action, devices ranked by their median time. `#results` in the URL opens it. |

`?results=<url>` points the page at another service, e.g. a local one:
`cargo run --release -- --listen 127.0.0.1:8095 --database /tmp/results.db` in
`outis/prover-results`.

## What the page sends

`showcase/app.js`, `submitScore()`:

```json
{
  "action": "pay",
  "build": "ios-1.2.0-abc123",
  "platform": "ios",
  "device_label": "iPhone 12 Pro",
  "device": { "platform": "ios", "model": "iPhone13,3", "os": "iOS 26.5", "cores": 6, "ramGiB": 5.6, "arch": "ARM64" },
  "conditions": { "thermal_before": "nominal", "thermal_after": "fair", "low_power_mode": false },
  "report": {
    "prove_s": 36.4, "total_s": 37.1, "os_s": 0.4, "input_s": 0.2, "verify_s": 0.1,
    "threads": 6, "os_steps": 459169, "proof_bytes": 232791, "verified": true, "identical": true,
    "simulated": false, "peak_mib": 2357
  }
}
```

- **`device`**: copied from `provingly.device`. The page sends only these keys if present:
  `platform, model, name, os, arch, cores, ramGiB, ramAtLeast, hardware, gpu, chip, soc,
  perfCores, efficiencyCores`. Strings are cut to 100 characters.
- **`device_label`**: what the results group by, computed by the page. The apps get it for free:
  it is `deviceName`, the marketing name from `content.js` `deviceNames`, else the model.
- **`report`**: the native Report as the apps already pass it.
  - `peak_mib` is taken from `peak.run_mib`, else `footprint_mib`, else `rss_mib`.
  - `identical` must be true, which the replay of a bundled capture gives.
- **`build`**: from `report.build`, else `window.provinglyNative.build`, else
  `"<platform>-unknown"`.

## What the apps need to do

1. **Give a build string.** Set `window.provinglyNative.build` before the page loads, or add
   `build` to the Report JSON. Use 64 characters at most, from `[A-Za-z0-9._+-]`, e.g.
   `ios-<app version>-<git short sha>`. Scores are stored per build, so a faster prover later can be
   told apart.
2. **Add device fields, optional but useful for the results page:**
   - `arch` (iOS: always `"ARM64"`; Android: `Build.SUPPORTED_ABIS[0]`, e.g. `arm64-v8a`);
   - `chip` (iOS: from the model, e.g. `"A14 Bionic"`; Android: `soc`, from `Build.SOC_MODEL`
     on API 31+);
   - `perfCores` and `efficiencyCores` (iOS: sysctl `hw.perflevel0.physicalcpu` /
     `hw.perflevel1.physicalcpu`; Android: group the cores by `cpuinfo_max_freq`).

   Keep every value a string, number or boolean (no nested objects). At most 24 keys.
3. **Check that `fetch` works from the WebView.** The page is a `file://` page, so its origin is
   `null`; the service answers `Access-Control-Allow-Origin: *`, which admits it. WKWebView should
   be fine. Android WebView is the one to try. If it refuses a cross-origin fetch from a file page,
   don't loosen the WebView. Implement the fallback below instead.
4. **Remove the native Share handling** if any: the page no longer posts `{type: "share"}`.

### Fallback, only if the WebView blocks the fetch

Page to native: `{type: "submit", id, payload}`, where `payload` is the JSON above. The native
side POSTs it to `https://rpc.outis.cash/prover-results/v1/results` and answers
`provingly.receive({type: "submitted", id, ok, status, body})`. Then `app.js`'s `submitScore`
needs a branch that posts through the bridge when `engine.platform` is `ios` or `android`. The
results page's GET would go the same way (`{type: "results", id, action}`). Implement this only if
step 3 fails.

## What the service accepts

Everything else gets a 4xx with `{"error": ...}`.

- **`action`**: one of `register`, `deposit`, `pay` or `withdraw`.
- **`report.os_steps` and `report.proof_bytes`:** exactly the action's, within ±2 bytes for the
  proof. They are the same on every device:

  | Action | os_steps | proof_bytes |
  |---|---|---|
  | register | 381442 | 234780 |
  | deposit | 450235 | 234607 |
  | pay | 459169 | 232791 |
  | withdraw | 461365 | 218800 |

- **The run itself:** `verified` and `identical` true, `simulated` not true. The `?mock` engine's
  runs are refused.
- **Ranges:**
  - `prove_s` from 0.5 to 3600, other times from 0 to 7200;
  - `threads` from 1 to 256;
  - `platform` one of `web`, `ios` or `android`.
- **Sizes:** `device_label` up to 100 characters and no control characters; `device` and
  `conditions` flat objects of at most 2 KB; a body of at most 16 KB.
- **Rate:** 30 submissions an hour per address, counted in memory. Addresses are never stored.

The answer is `{"id", "position", "of"}`: this run's place among all the action's scores.

## Honesty

The time can't be proven. Every replayed proof is the same bytes, and the reference proof ships with
the app. So the checks above only keep out what can't be a real run. The results page says so in
its footnote.
