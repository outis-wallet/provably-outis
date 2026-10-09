# The showcase is now React: what the Mac needs to do

The showcase UI the apps load (`showcase/`) is now generated from `outis/wallet/apps/prover`, a
React app. The same app is outis.cash/prover. The hand-written `app.js`, `bridge.js`,
`content.js`, `ui.js` and `results.js` are gone. `showcase/` now holds four generated files:
`index.html`, `results.html`, `app.js` and `app.css`. `fonts/`, `captures.txt` and
`build-web.sh` stay.

**The page/native contract is unchanged** apart from its names (the rename, below): the same
messages and fields, on `provablyOutis.receive`, `provablyOutisNative`, `ProvablyOutisAndroid`
and `provablyOutis.back`. The shells and the generated page were changed together, so there's
nothing to edit.

## The rename: provingly is now provably-outis

The repository is `github.com/broody/provably-outis`. Everything named after it was renamed:

| Was | Now |
|---|---|
| `github.com/broody/provingly` | `github.com/broody/provably-outis` |
| `window.provingly`, `provinglyNative`, `ProvinglyAndroid` | `window.provablyOutis`, `provablyOutisNative`, `ProvablyOutisAndroid` |
| iOS bundle ID `dev.provingly.TxProver` | `dev.provablyoutis.TxProver` |
| Android application ID and Java package `dev.provingly.showcase` | `dev.provablyoutis.showcase` (the JNI function too) |

On the Mac:

1. Point the clone at the new name. GitHub redirects the old one, but don't rely on it:
   `git remote set-url origin https://github.com/broody/provably-outis.git`, then `git pull`.
   Renaming the local folder is optional: the Xcode and Gradle projects use relative paths.
2. **iOS: the new bundle ID is a new app.** Signing is automatic, so Xcode makes a profile for
   it on the first build. With a free Apple ID, that counts against its weekly limit of new app
   IDs. Delete the old TxProver from the phones; it would otherwise stay installed alongside
   the new one.
3. **Android: the new application ID is a new app too.** Uninstall the old one:
   `adb uninstall dev.provingly.showcase`. Launch the new one with
   `adb shell am start -S -n dev.provablyoutis.showcase/.MainActivity`.
4. Use a clean build for both (below), so that nothing of the old package is left.

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
`http://localhost:5196/prover/?mock`. Then regenerate the apps' copy with `showcase/sync-ui.sh`.
It builds from the Outis checkout next to provably-outis (`OUTIS=<path>` for another one) and prints
the commit to make. Don't edit the four files by hand: the next sync overwrites them.

## Where things went

| Was (provably-outis `showcase/`) | Now (`outis/wallet/apps/prover/src/`) |
|---|---|
| `app.js`, `ui.js` | `Prover.tsx`, `icons.tsx`, `format.ts` |
| `results.js` | `Results.tsx` |
| `content.js` | `content.ts` |
| `bridge.js` | `bridge.ts` |
| `app.css` | `showcase.css` (mobile, shared) and `desktop.css` (web only) |
| `build-web.sh` (page and engine) | the page: the Outis site's build. The engine: still `build-web.sh`, now writing into `outis/wallet/apps/prover/public` |
