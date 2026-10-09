# The showcase is now React: what the Mac needs to do

The showcase UI the apps load (`showcase/`) is now generated from `outis/wallet/apps/prover`, a
React app. The same app is outis.cash/prover. The hand-written `app.js`, `bridge.js`,
`content.js`, `ui.js` and `results.js` are gone. `showcase/` now holds four generated files:
`index.html`, `results.html`, `app.js` and `app.css`. `fonts/`, `captures.txt` and
`build-web.sh` stay.

**The page/native contract is unchanged:** the same messages, fields and globals
(`provingly.receive`, `provinglyNative`, `ProvinglyAndroid`, `provingly.back`). The shells need no
code changes.

## Build

Nothing changes in Xcode or Gradle:

- iOS: the "Bundle the showcase" phase copies `showcase/*.html *.css *.js` and `fonts/*` to
  `web/`. That still matches.
- Android: `syncShowcase` includes `*.html, *.css, *.js, fonts/**`. That still matches.

Keep `fonts/`. `app.css` loads `fonts/ubuntu-sans-latin-wght-normal.woff2` from next to the page.

## Check on the devices

On an iPhone, an iPad and the Galaxy, after a clean build (so that no old `bridge.js` or
`content.js` is left in the bundle):

1. **Home** looks as before: the device name and spec at the top, Results and How it works, and
   the four steps.
2. **A proof:**
   - the phases tick, and the memory bar moves;
   - the result shows the time;
   - Submit score answers "Score submitted · #n of m";
   - Rerun proves again.
3. **The results page:**
   - it opens from Results, loads, and the filters work;
   - the "‹ Results" title goes back;
   - on Android, the back button leaves an action screen, the How it works sheet and the results
     page.
4. **The font** is Ubuntu Sans, not the system font. If the text looks like San Francisco or
   Roboto, `fonts/` didn't make it into `web/`.
5. **An iPad in landscape** keeps the phone layout. The desktop layout (split view, results
   table) is the web build's only, by design.
6. **The launch arguments** still auto-run a proof: `--prove pay` on iOS, `--es prove pay` on
   Android.

Already checked on Linux, from the files, with fake iOS and Android shells at 1366 px:
- the `ready`/`prove` messages;
- the phases, memory, result and back button;
- the phone layout kept.

Screenshots at 420 px match the previous pages, apart from the running timers and a few antialiased pixels.

## Changing the UI from now on

Edit `outis/wallet/apps/prover/src`. Preview with `pnpm dev` there, at
`http://localhost:5196/prover/?mock`. Then regenerate the apps' copy:

```
cd outis/wallet/apps/prover
NATIVE_OUT=../../../../provingly/showcase pnpm build:native   # outis and provingly side by side
```

Commit the four generated files here, saying which Outis commit they come from. Don't edit them
by hand: the next build overwrites them.

## Where things went

| Was (provingly `showcase/`) | Now (`outis/wallet/apps/prover/src/`) |
|---|---|
| `app.js`, `ui.js` | `Prover.tsx`, `icons.tsx`, `format.ts` |
| `results.js` | `Results.tsx` |
| `content.js` | `content.ts` |
| `bridge.js` | `bridge.ts` |
| `app.css` | `showcase.css` (mobile, shared) and `desktop.css` (web only) |
| `build-web.sh` (page and engine) | the page: the Outis site's build. The engine: still `build-web.sh`, now writing into `outis/wallet/apps/prover/public` |
