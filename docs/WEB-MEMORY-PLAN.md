# The web proof doesn't fit in an iPhone's Safari: the plan for the i9

## What the Mac found (2026-10-09)

The web engine's proof crashes Safari on an iPhone 12 Pro and an iPhone 17 Pro; the apps prove
fine on both. It isn't a wasm or JavaScriptCore bug: iOS ends the tab's process for its memory.

- **iPhone 12 Pro** (iPhone13,3, 6 GB, iOS 26.6.2), from its JetsamEvent:
  `com.apple.WebKit.WebContent` was killed with reason `highwater` (its per-process limit) at
  **2,251 MiB**, 11.6 s of CPU into the run. On the same phone the TxProver app peaked at 2,373 MiB
  and wasn't killed: apps are allowed more than Safari's tabs.
- **iPhone 17 Pro**: crashes too. Its limit isn't known yet (the Mac will read its JetsamEvent); it's
  below about 2.9 GiB.
- **What Safari's tab really uses**, measured in the iOS simulator's Safari (the same WebKit, no
  memory limit, so the proof finishes) on outis.cash/prover as deployed (wasm `c7c4d3803be4`),
  deposit, the tab process's peak `phys_footprint`:

| | Peak |
|---|---|
| Safari, 8 threads | 2,927 MiB |
| Safari, 2 threads | 2,827 MiB |
| The page's "Peak memory" (the wasm memory's size) | 2.4 GiB |
| The TxProver app in the same simulator, pay, prover db80eb1 / 9288647 | 2,325 / 2,371 MiB footprint |

So:
- **The thread count doesn't matter.** Going from 8 threads to 2 saves only about 100 MiB.
- **Safari uses about 0.5 GiB more than its wasm memory.** The page's figure under-reports the tab.
- **Only a lower prover peak can fit the 12 Pro.** The prover's own peak (about 2.3 GiB natively)
  is already above that phone's tab limit, so removing the web overhead alone can't get there.
- **The tab's memory rises from about 0.8 to 2.8 GiB in about 4 s,** right at the start of the
  prove phase.

## The goal

Lower the prover's peak memory, natively and in wasm, **without changing a byte of any proof**: all
four captures must stay `identical` and `verified`, natively, in Node and in Chrome. Changes that
alter the proof (the blowup factor, other parameters) are out. If nothing else gets there, say so,
with numbers.

The target is a wasm memory (the `wasm` figure of the worker's `memory_report`, which only grows)
of **1.6 GiB or less**. That's the 12 Pro's 2,251 MiB less Safari's ~0.5 GiB, with a little margin.
Native should drop with it. Any cut helps the 17 Pro, so report whatever you reach.

## 1. Baseline

For each capture (register, deposit, pay, withdraw):
- **Native:** the peak heap (heaptrack) and the max RSS (`/usr/bin/time -v`), at 1 thread and at
  6 (an iPhone's core count).
- **wasm:** threaded in Chrome at 6 threads, and single-threaded in Node. Record `memory_report`'s
  `wasm` (the memory's size) and `peak` (the peak live heap). `wasm` minus `peak` is what the
  allocator wastes.

## 2. Find what's alive at the peak

Run the native replay under heaptrack (`heaptrack_print --print-peaks`, or heaptrack_gui at the
peak). Name the 5 to 10 largest allocations alive at the peak, with their owners. Check:
- **The OS run's leftovers:** what it leaves alive into proving, such as the Cairo VM's memory and
  trace, the relocated trace, the PIE and the runner.
- **Duplicate copies:** the same data held twice between the runner, the adapter's prover input and
  the prover.
- **The prover's own buffers:** the trace and the interaction trace, their extended evaluations,
  the composition, the twiddles and the Merkle layers, and when each one is freed.
- **Per-thread scratch:** the 2-versus-8-thread difference says it's small.

## 3. Cut

In order of cost:
1. **Free the OS run's state before the prove phase starts,** once the prover input is built.
2. **Don't hold two copies of the same data:** convert in place, move it, or stream it.
3. **Free each of the prover's buffers once its last use is past,** for example the trace
   evaluations once they're committed. This is in the outis-wallet/proving fork.
4. **wasm only:** if `wasm` is well above `peak`, find the waste and fix it. Candidates are large
   buffers that don't reuse freed space, and the small-block heap's growth step from 9288647.

After each cut, check that all four captures are still identical and verified, natively and in
wasm, and record the numbers.

## 4. Hand back

- **Push** the prover commits and any proving-fork commits. The Mac pins the new prover in
  provably-outis and rebuilds the apps.
- **Rebuild the web engine into Outis** (`scripts/build-wasm.sh web`, then
  `scripts/build-web-engine.sh <outis>/wallet/apps/prover/public`), and say whether it's pushed and
  deployed.
- **A table** with, per capture, before and after: the native peak heap, the wasm `wasm` and
  `peak`, and the prove time (native at 6 threads, and Chrome).
- **The Mac then measures** Safari's footprint in the simulator and proves in Safari on the 12 Pro
  and the 17 Pro.

## From the Mac (2026-10-09, later)

- **A second proof in a Safari tab failed. Fixed in prover `a936dae`** (on `1b38be8`; Outis
  `09a4b7e`, wasm `be58014d4e3f`). The cause wasn't the page holding the memory: the rayon pool's
  workers park in a wasm atomic wait between jobs, and Safari can't end a worker parked there.
  Ending the engine worker, ending the pool's workers, or reloading the page all left them, and the
  run's 2.8 GiB, until the tab's process died.
  - `os_wasm_probe::stop_threads` traps each pool thread out of wasm. `js/worker.mjs` calls it when a
    run is over, ends the workers it started, then posts the outcome.
  - The memory figure comes from a watcher worker on a port the page sends (`memoryPort`).
  - Errors now carry the panic message and `memory_report`, since Safari's stack has no message
    line.
  - Tested in Safari in the simulator: deposit, then pay, in one tab. Both verified and identical,
    and the tab is back under 0.1 GiB after each.
- **Safari stops a tab's wasm memory at about 2.6 GiB,** apart from iOS's limit on the tab. Seen in
  the simulator, which has no such limit: an allocation failed at `wasm 2687` MiB. So on any
  iPhone, the wasm memory has to stay under it too.
- **iPhone 17 Pro:** Safari's tab dies about 2 s into "Build the ZK proof", in every capture tried.
  The page reloads, then Safari says "A problem repeatedly occurred". iOS wrote no JetsamEvent for
  it, so its limit isn't known. An Instruments (Activity Monitor) recording of one crash is on the
  Mac, not read yet.
- **Home screen warnings (Outis `d808663`, live):** on iOS, any browser shows "Safari may close
  this page during a proof" and says an app is coming. Elsewhere, the low-memory warning shows
  for devices with 4 GB of RAM or less.
- **Building the threaded wasm on a Mac:** Apple's clang has no wasm32 target, which `zstd-sys`
  needs. Point it at the Android NDK's:
  `CC_wasm32_unknown_unknown=<ndk>/toolchains/llvm/prebuilt/darwin-x86_64/bin/clang` and
  `AR_wasm32_unknown_unknown=<same>/llvm-ar`.

## Results from the i9 (2026-10-09)

**Short version:** one cut landed: −85 MiB in wasm, −73 to −146 MiB natively, no time cost,
byte-identical proofs. **1.6 GiB is not reachable by freeing buffers earlier.** About 1 GiB of the
peak is lookup data that has to outlive the base trace commit. Getting below 1.6 GiB needs changes
to code the proving fork marks AIR-generated or security-critical, which waits for a decision (see
"What's left").

### The deployed engine already had the allocator change

The plan asked whether it did. `c7c4d3803be4` is the allocator build. A clean `9288647` (cargo: Fresh) rebuilds exactly
`os_wasm_probe_bg.c7c4d3803be4.wasm.gz`. Outis `395848b` shows 15:59 because amending the commit
kept its original author date; its engine was built from the tree committed as `9288647`.

### What's alive at the peak

The peak is the Cairo leg's base trace commit, in every capture. A wasm build that reports every
block of 64 KiB or more to JS, with its stack, gave this for pay (Node, 1 thread, live 2,386 MiB):

| Alive at the peak | MiB |
|---|---|
| Allocated by the components' `write_trace`: the base trace (now its coefficients, 515 MiB, 135.2 M cells) and the **lookup data** (the rest, about 1,000 MiB). The largest: `blake_g` 278, `blake_round` 266, `add_opcode_small` 155, `range_check_20` 128, `add_opcode` 110, `assert_eq_opcode_double_deref` 75 | ~1,520 |
| The commit's stripe buffers: every column's evaluation on one stripe at a time | 540 |
| The circuit's preprocessed circuit, built up front though only the second leg uses it | ~75+ |
| Twiddles 32, Merkle leaf plan 32, the Cairo preprocessed tree 16 | ~80 |

The plan's other checks:
- **What the OS run leaves alive:** negligible. The live heap is 62 MiB after the OS run, the PIE
  included. The bootloader's runner and relocated trace are freed before proving starts.
- **Duplicate copies:** none found. The base trace is interpolated in place: at commit entry the live
  heap goes from 1,822 to 1,830 MiB.
- **Per-thread scratch:** Chrome at 6 threads peaks 30–50 MiB above Node at 1 thread.
- **Waste in wasm (`wasm` − `peak`):** about 70 MiB in every run, so not worth chasing.
- **The lookup data:** each component stores, per row, copies of the values it looks up. For
  example, `blake_g` stores 86 values per row against 53 trace columns. The interaction trace is
  built from them after the base commitment, because its random elements are drawn from that
  commitment. So the whole lookup data is held from the end of `write_trace` until after the
  commit. The live heap is already 1,822 MiB at commit entry.

Live heap at the other phases (pay, before the cut): the Cairo interaction commit about 1,740 MiB, the
circuit leg's commits about 1,885 and 1,819 MiB.

The tracer (a feature patch for `memory.rs` and a Node driver) isn't committed. It's on the i9 in
`~/development/outis-wallet/web-memory-tracer/`, with a README.

heaptrack isn't installed here (no sudo), and it couldn't see the large blocks natively anyway:
`LargeBlockCache` maps blocks of 1 MiB and up with `mmap`. The native column below is peak RSS.

### The cut (proving 70bc0693, prover 1b38be8, Outis 86d033c, wasm 58caf328de4e)

- **`privacy_recursive_prove_once`** builds each leg's precomputes when that leg starts and drops
  them when it ends. The Cairo proof no longer carries the circuit's preprocessed circuit, and the
  circuit proof no longer carries the Cairo preprocessed trace and tree.
- **`TxSession::prove`** uses it and frees the session's input side (state maps, compiled classes,
  execution data) before proving.
- **Leak fixed:** the old path leaked its process-lifetime precomputes (`ManuallyDrop`) on every
  proof, leaving 338 MiB live after a proof. Now 19. This matters for the apps' repeated proofs.
- `privacy_recursive_prove` and its precomputes are unchanged, for the sequencer.

| | register | deposit | pay | withdraw |
|---|---|---|---|---|
| Native, 6 threads, peak RSS MiB, before → after | 2,584 → 2,438 | 2,598 → 2,481 | 2,648 → 2,565 | 2,617 → 2,544 |
| Native, 6 threads, prove s, before → after | 22.3 → 21.9 | 24.1 → 24.1 | 21.7 → 21.5 | 21.3 → 21.1 |
| Native, 1 thread, peak RSS MiB, before | 2,528 | 2,592 | 2,614 | 2,615 |
| Node, 1 thread, `wasm` MiB, before → after | 2,366 → 2,281 | 2,424 → 2,340 | 2,465 → 2,380 | 2,465 → 2,380 |
| Node, 1 thread, `peak` MiB, before → after | 2,294 → 2,209 | 2,354 → 2,269 | 2,391 → 2,306 | 2,391 → 2,306 |
| Chrome, 6 threads, `wasm` MiB, before → after | 2,396 → 2,339 | 2,453 → 2,388 | 2,506 → 2,403 | 2,509 → 2,412 |
| Chrome, 6 threads, `peak` MiB, before → after | 2,326 → 2,268 | 2,384 → 2,318 | 2,434 → 2,331 | 2,438 → 2,339 |
| Chrome, 6 threads, prove s, before → after | 27.7 → 27.8 | 30.2 → 30.0 | 27.9 → 27.8 | 27.5 → 27.4 |

- Every proof is identical and verified: native, Node and Chrome, all four captures.
- Node's times weren't measured in isolation (four runs at once), so they aren't in the table.
- Deploy state: Outis main is `86d033c`, deployed: outis.cash/prover serves `58caf328de4e`.
- The prover's `Cargo.lock` now uses the already-locked hashbrown 0.15.5 for five proving crates
  (their requirement is >=0.15.2), instead of 0.17.1.

### What's left: two changes, each needing a decision

1. **Stream the commit** (stwo `pcs/mod.rs` `new_striped`, `vcs_lifted` leaf hashing; the fork's
   guide marks them `[SECURITY-CRITICAL]`).
   - Change: hash each stripe a group of columns at a time instead of evaluating every column's
     stripe at once.
   - Estimate: −~500 MiB at the Cairo base commit, −~400 at the circuit's commits.
   - Leaves the Cairo leg at about 1.75 GiB live (~1.8 GiB `wasm`), because the lookup data is still
     whole at the end of `write_trace` and across the commit.
   - Likely enough for the 17 Pro if its limit is near 2.9 GiB of footprint. Not enough for the
     12 Pro (2,251 MiB).
2. **Keep the lookup data out of the base commit** (`cairo_claim_generator.rs` and 60+ component
   files, all AIR-generated; the fork already hand-edits generated files: `43450c3d`, and about 30
   in the frontier commit).
   - Change: regenerate each component's lookup data after the commit and turn it straight into
     that component's interaction trace (a second witness pass, costing about the "Write Base trace"
     phase again), or store it compactly.
   - With 1, the estimate is a peak of about 1.4 GiB live (~1.45 GiB `wasm`): Cairo commit
     ~0.8–1.0 GiB, second witness pass ~1.2–1.3 GiB, circuit leg ~1.4 GiB.
   - This is what reaches the 1.6 GiB target.
