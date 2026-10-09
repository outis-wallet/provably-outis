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

## Left to the Mac

- **`wallet/apps/prover/src/bridge.ts`:** after a run, the tab kept its 2.8 GiB, because the
  finished worker's `WebAssembly.Memory` stays referenced. A second proof in the same tab stacks
  on top of it. The Mac fixes it and tests it in Safari, so leave that file alone. The Mac's Outis
  checkout also has uncommitted UI work in `Prover.tsx` and `format.ts` (the low-memory warning).
- **Reading the 17 Pro's limit.**

## Check first

outis.cash/prover serves `os_wasm_probe_bg.c7c4d3803be4.wasm.gz`, which came in with Outis
`395848b` (15:59). That's before prover `9288647`, the allocator change (17:15). Outis `ccefd93`
then raised the web threads from 8 to 16 without a new wasm. If `c7c4d38` doesn't have the
allocator change, the site runs 16 threads on the locked allocator. Either way, rebuild the engine
from `9288647` and deploy it.
