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
   - Leaves the Cairo leg at about 1.75 GiB live, because the lookup data is still whole at the end
     of `write_trace` and across the commit. **Corrected (see "ryun1's striped commitment" below):**
     the whole proof would then peak in the circuit leg's composition, 1,909 MiB live (~1.98 GiB
     `wasm`), which the commit doesn't touch.
   - Likely enough for the 17 Pro if its limit is near 2.9 GiB of footprint. Not enough for the
     12 Pro (2,251 MiB).
2. **Keep the lookup data out of the base commit** (`cairo_claim_generator.rs` and 60+ component
   files, all AIR-generated; the fork already hand-edits generated files: `43450c3d`, and about 30
   in the frontier commit).
   - Change: regenerate each component's lookup data after the commit and turn it straight into
     that component's interaction trace (a second witness pass, costing about the "Write Base trace"
     phase again), or store it compactly.
   - With 1, the estimate was a peak of about 1.4 GiB live (~1.45 GiB `wasm`): Cairo commit
     ~0.8–1.0 GiB, second witness pass ~1.2–1.3 GiB, circuit leg ~1.4 GiB.
   - **Corrected:** that estimate missed the circuit leg's composition (1,909 MiB live) and quotients
     (1,689 MiB live), which neither change touches. 1 and 2 together land at about 1.9 GiB live.
     The revised chain to 1.6 GiB is in "ryun1's striped commitment" below.

## ryun1's striped commitment (provably.fast 0e80cbf9) on our captures (2026-10-09, i9, later)

**Short version: don't adopt it.** On our proof it costs memory and time and saves nothing at our
peak:
- **As committed:** about +500 MiB of wasm memory (pay: 2,380 → 2,895 MiB in Node, 2,422 → 2,943 in
  Chrome), +50 to +160 MiB of native RSS, 1.50x slower natively and 1.38x in Chrome.
- **Why the memory:** `new_striped` takes every column's stripe-0 buffer from the pool before it
  computes the first stripe (the block commented "Prefix columns get their stripe-0 buffer now").
  So the coefficients, the scratch stripe and the stripe-0 buffers are all held at once, 515 MiB each
  on the Cairo base trace. Natively, most of those pages aren't touched before stripe 0, so RSS
  barely sees them; in wasm, allocated memory is memory taken. The provably.fast evaluator measures
  natively, which is how it passed there. The challenge's maintainers may want to know.
- **Fixed** (stripe 0 written into the column's scratch buffer instead; two lines): back to today's
  numbers, 2,375 MiB on pay (−5), −110 MiB native RSS, still 1.5x slower.
- **Our peak is the Cairo base commit, where both stripes hold the same thing:** the coefficients,
  every column's stripe in flight, and about 1 GiB of lookup data neither touches. ryun1's gain on the
  benchmark comes from composition (windowed), which isn't our peak. It does lower ours: the Cairo
  composition goes from 1,443 to 1,344 MiB live, the circuit's from 1,909 to 1,707.

### What was built (local only, not pushed)

- proving `ryun1-stripe` (`b600ef12`, worktree `~/development/outis-wallet/proving-ryun1`):
  - `d29f3c6a`, the 754321f3 port. It is tree-identical to starknet-innovation's `7029a7f2`.
  - `0b690eeb`, ryun1's 9-file candidate dbdd1f84, as ported by starknet-innovation. Applied
    unchanged.
  - Our other commits:
    - wasm32. Its `pcs/mod.rs` hunk, the stripe-to-stripe buffer hand-off, is dropped: ryun1 keeps one
      scratch buffer per column across stripes.
    - Android.
    - The per-row Vec removal.
    - `privacy_recursive_prove_once`. It now calls `CommitmentTreeProver::new` with the same
      store flags as `prepare_recursive_prover_precomputes`; `new` stripes on its own.
  - Not taken: `4956275c` (b24c7d1d). prove_once already builds the preprocessed circuit after the
    Cairo proof, alongside the verifier context. What b24c7d1d adds is the circuit tree's commit
    overlapping the fill, and two fewer Vecs per gate: about 1% of time, nothing at our peak.
- The fix: proving `ryun1-stripe-defer-experiment` (`0f140ba5`, worktree `proving-defer`). It's in
  `pcs/mod.rs`, which the fork marks `[SECURITY-CRITICAL]`, so it isn't pushed. It's proof-neutral:
  all four captures are identical and verified, natively and in Node.
- prover worktrees `prover-ryun1` and `prover-defer` (`[patch]` by path), plus `prover-trace-base`
  and `prover-trace-new` for the tracer.
- No new C dependencies: the nine files add only `malloc_trim`, a glibc extern gated to
  linux-gnu, a no-op elsewhere. Nothing changes for the Mac's wasm build.

### Measured

Current = proving `70bc0693` / prover `a936dae`, re-measured in the same session. ryun1 = the
branch above. Fix = ryun1 plus the two-line fix (not run in Chrome). Every proof below is
identical to the native prover's and verified:
- natively by the replay;
- in Node by `os_native_probe verify` on its result;
- in Chrome by the page.

| | register | deposit | pay | withdraw |
|---|---|---|---|---|
| Native, 6 threads, peak RSS MiB, current / ryun1 / fix | 2,511 / 2,562 / 2,397 | 2,593 / 2,646 / 2,481 | 2,534 / 2,696 / 2,505 | 2,622 / 2,695 / 2,503 |
| Native, 6 threads, prove s, current / ryun1 / fix | 20.9 / 31.5 / 31.5 | 22.9 / 33.7 / 33.9 | 20.9 / 31.4 / 31.4 | 20.1 / 30.7 / 30.5 |
| Node, 1 thread, `wasm` MiB, current / ryun1 / fix | 2,281 / 2,766 / 2,272 | 2,340 / 2,848 / 2,337 | 2,380 / 2,895 / 2,375 | 2,380 / 2,896 / 2,375 |
| Node, 1 thread, `peak` MiB, current / ryun1 / fix | 2,209 / 2,695 / 2,202 | 2,269 / 2,775 / 2,266 | 2,306 / 2,822 / 2,303 | 2,306 / 2,822 / 2,303 |
| Chrome, 6 threads, `wasm` MiB, current / ryun1 | 2,320 / 2,810 | 2,384 / 2,896 | 2,422 / 2,943 | 2,415 / 2,938 |
| Chrome, 6 threads, `peak` MiB, current / ryun1 | 2,249 / 2,740 | 2,314 / 2,824 | 2,350 / 2,870 | 2,343 / 2,866 |
| Chrome, 6 threads, prove s, current / ryun1 | 28.0 / 39.7 | 30.9 / 42.3 | 28.9 / 39.5 | 28.3 / 39.0 |

How these were taken:
- Native: the median of 3 interleaved runs. RSS varies about 60 MiB from run to run.
- Chrome 154, headless: 2 runs each. Memory is the higher run, time the mean.
- Node: memory only. Its times aren't comparable (ten runs at once).
- Live heap left after a proof: 19 MiB current, 41 with ryun1's change. Its `subdomain_twiddles`
  cache is a process-lifetime static, never freed. The apps prove repeatedly; it stays bounded.
- Time, ryun1 vs current: 1.47–1.53x natively, 1.37–1.42x in Chrome. That matches the benchmark's
  ratios (s2 1.23x of 754321f3, ryun1 1.83x).
- **Where the 1.5x goes.** I ran the fix with windowed composition off (`PARITY_MIN_LOG_SIZE` 64,
  local commit `f322981e`), against current, natively at 6 threads, one run each, identical and
  verified. The results:

  | | register | deposit | pay | withdraw |
  |---|---|---|---|---|
  | Prove s, current / no windows | 21.7 / 24.9 | 23.4 / 27.2 | 20.7 / 24.4 | 20.5 / 24.0 |
  | Peak RSS MiB, current / no windows | 2,492 / 2,563 | 2,571 / 2,587 | 2,510 / 2,572 | 2,606 / 2,570 |

  - Without windows, ryun1's change costs 1.15–1.18x: its commit, its decommit, and composition
    that extends each component whole, one at a time. Native RSS is the same as today's; its wasm
    memory wasn't measured.
  - The windowed composition adds the rest, about +0.34x of today's time (7 s of 21 natively).
    It buys −200 MiB at the circuit's composition.
  - So no configuration of 0b690eeb beats our stripe on this proof.

### Phase by phase (pay, Node, live heap MiB)

From the allocation tracer, extended to name each phase from the allocating stacks
(`web-memory-tracer/trace2.mjs`). Each figure is the live heap's maximum in that phase.

| Phase | current (s2) | ryun1 | ryun1 + fix |
|---|---|---|---|
| Cairo: end of `write_trace` | 1,738 | 1,738 | 1,738 |
| **Cairo: base trace commit** | **2,306** | **2,822** | **2,304** |
| Cairo: interaction trace | 1,842 | 1,838 | 1,832 |
| Cairo: interaction commit | 1,685 | 2,173 | 1,673 |
| Cairo: composition | 1,443 | 1,355 | 1,344 |
| Cairo: quotients and FRI | 1,415 | 1,423 | 1,412 |
| Circuit: end of `write_trace` | 1,586 | 1,594 | 1,594 |
| Circuit: base trace commit | 1,884 | 2,278 | 1,896 |
| Circuit: interaction commit | 1,818 | 2,258 | 1,829 |
| Circuit: composition | 1,909 | 1,707 | 1,707 |
| Circuit: quotients | 1,689 | 1,710 | 1,710 |

### Where the Cairo leg's peak lands, and what #2 would take off

- **With ryun1's change as committed,** the Cairo leg still peaks at its base trace commit:
  2,822 MiB live, 2,895 `wasm`. With the fix, it's the same phase at today's size, 2,304 / 2,375.
- **#2 (lookup data out of the base commit) takes about 1.0 GiB off that phase,** in all three, to
  about 1.3 GiB live. The Cairo leg then peaks at its interaction commit: 1,685 (current),
  2,173 (ryun1), 1,673 (fix).
- **The proof's peak then moves to the circuit leg:**
  - current: its composition, 1,909 live, about 1.98 GiB `wasm`;
  - ryun1: its base commit, 2,278, about 2.35 GiB `wasm`;
  - ryun1 + fix: its base commit, 1,896, about 1.97 GiB `wasm`.
- So **#2 alone takes about 0.4 GiB off today's proof.** About 1.97 GiB `wasm` is roughly 2.5 GiB of
  Safari footprint: possibly under the 17 Pro's limit, not under the 12 Pro's 2,251 MiB.

### What 1.6–1.7 GiB would take (revised)

After #2, the circuit leg sets the peak. From its base commit on it holds, alongside each phase's
temporaries:
- about 1.0 GiB of committed stripes (trace, interaction and composition trees);
- about 170 MiB of the verifier circuit's context: its values (one 128 MiB Vec) and gate lists.
  `prove_once` keeps `context` until it returns, and the circuit prover borrows the values for the
  whole proof, though only its `write_trace` reads them;
- about 75 MiB of the circuit's preprocessed columns.

The chain, from today's fork, by live heap:
1. **#2:** the Cairo base commit 2.31 → about 1.3 GiB. Peak: the circuit's composition, 1.91.
2. **#1, the streamed commit:** the commits of both legs drop by about 0.4–0.5: the circuit's
   1.88 / 1.82 to about 1.4. The peak is still the circuit's composition, 1.91.
3. **Windowed composition** (ryun1's method, ported to our stripe): the circuit's composition 1.91 →
   1.71 (measured above). Peak: the circuit's quotients, about 1.70.
4. **The verifier context freed after the circuit's `write_trace`:** about −170 MiB across the
   circuit proof. Peak about 1.53 GiB live, about 1.6 GiB `wasm`.

1.6 is reachable only with all four, and with almost no margin. Steps 1–3 change code the fork marks
`[AIR-GENERATED]` or `[SECURITY-CRITICAL]`; step 4 is orchestration (`privacy_prove`,
`circuit_prover`). Time:
- #2 adds a second witness pass, about the "Write Base trace" phase again.
- Windowed composition as ryun1 wrote it adds about +0.34x (see "Where the 1.5x goes"). It
  re-extends every column of a component for each of its 4 windows. A port would need a cheaper
  form, for example windowing our part-wise composition, or windowing only the circuit leg, where
  the peak is.

### Recommendation

- **Keep our stripe (s2). Don't adopt 0b690eeb,** neither as committed (+0.5 GiB in wasm, 1.5x) nor
  fixed (no memory gain, 1.5x).
- **Do #2 on our stripe,** if about 1.97 GiB `wasm` is worth it on its own. That's possibly enough
  for the 17 Pro, whose limit isn't known.
- **For the 12 Pro,** do 1–4 above. Of ryun1's change, only the idea of windowed composition is
  worth taking. As written it costs +0.34x for −200 MiB, so it needs a cheaper form first.
- **Nothing pushed** to outis-wallet/proving or prover, and the Outis engine isn't rebuilt: the
  deployed engine stays `be58014d4e3f`.
