# Striped commitment on frontier 754321f3 (ryun1-style), for the S25+

Goal: rebuild ryun1's ~2 GiB whole-proof approach ourselves, from his public research-graph
description (records rgr1_552dbc29… and rgr1_c4c9e3f8…), and run it on the user's Galaxy S25+.
Not for submission for now: every submission of ours fails evaluator admission. Credit ryun1
if anything is published.

## Directories (~/development/provably-fast)
- `nf/`: pin dd1787bc + frontier 754321f3 (unstaged), plus harness bins (privacy_prepare_input,
  privacy_prove_stdout, privacy_verify, pf_official_trace) and tracing-subscriber in privacy_prove's
  Cargo.toml. It is the `measure.py --tools` dir for byte identity against the new frontier.
- `stripe/`: pin + 754321f3, no harness. The working source for the steps below.
- `frontier/`: the OLD frontier 6e80156f tools; keep it for v6 comparisons.
- Phone: `phone/`. adb is ~/.local/platform-tools/adb, zig is ~/.local/zig/zig-x86_64-linux-0.14.1.
  ARM build: `cargo zigbuild --release --target aarch64-unknown-linux-musl`, with RUSTFLAGS set to
  override the repo's -Dwarnings. On the phone, run in /data/local/tmp. Android sh is 32-bit, so
  take times from the trace logs.

## Steps
0. Baseline: build nf (evaluator flags) and get a per-phase peak table with pf_official_trace.
   ryun1 says this frontier's peak is in the Cairo leg.
1. Stripe-0 residency on both legs (ryun1's 5.87 -> 2.84 GiB):
   - streamed commit (v6's new_streamed idea) on the new packed-leaf / sparse-layer commit path,
     keeping only part 0;
   - composition: regrow stripe 1 per component (interpolate stripe 0 -> coeffs -> evaluate part 1;
     there are no stored coeffs on this frontier) and evaluate part-wise, with v6's in_part/parts
     routing;
   - decommit column by column: IFFT stripe 0 -> coeffs -> domain_eval rows -> keep only those
     rows; then hash leaves, including the 32-leaf groups for the recomputed lower layers;
   - check what compute_fri_quotients reads on this frontier.
   Gate: byte-identical via measure.py against nf, cgroup peak <= ~3.0 GiB, then ARM + phone.
2. malloc_trim(0) after the Cairo leg (gnu only; musl has none).
3. Only if the phase table says so: windowed composition. The halves are closed under trace
   offsets in NATURAL order, not bit-reversed.

## Results
- Step 0, new frontier 754321f3 (x86, 16 threads): 4.87 s; peak 5.85 GiB, reached in the Cairo leg.
  Byte-identical to the old frontier's proof.
  Phase peaks (MiB): Cairo base commit 3473, Cairo interaction commit 5533, Cairo prove_ex 5925;
  circuit commits 5129, composition 5400, quotients 5530, FRI 5541. Both legs need stripe 0.
- Reads on this frontier: OODS (subdomain_eval_group) and FRI quotients
  (accumulate_numerators_on_subdomain) read only the first n of each column, i.e. stripe 0.
  Decommit reads queried rows plus 32-leaf blocks for the omitted layers (n_omitted lowest layers).
  The leaf hash can be replicated from row values with the CPU reference semantics:
  H::default(), then per size group (increasing) chunks of <=16 values update_leaf, then finalize;
  row of a 2^s column for leaf l is ((l >> (L-s+1)) << 1) | (l & 1).
- Step 1 done, in stripe/ (build copy with harness bins: stripe-build/). Pieces: new_striped and
  decommit_from_stripes in pcs/mod.rs; decommit_from_values and decommit_indices in
  vcs_lifted/prover.rs (from v6); domain_eval.rs, PolyOps part_twiddles/eval_at_domain_indices and
  SIMD overrides (from v6); Poly::stripe_domain/stripe_coefficients; constraint-framework
  trace_part regrows from stripe 0; simd_domain in_part/parts; prove_ex runs components one at a
  time when columns are short; bounded_memory flag on prove_cairo_common (true only in
  with_precompute); circuit prover and both precompute trees striped.
  Quick build, x86: byte-identical to nf, peak 2.83 GiB (nf 5.85), 6.3 s.
  Phase peaks (MiB): Cairo commits 2105/2175, Cairo prove_ex 1684; circuit striped commits 2855
  (peak), composition 2553, quotients and decommit 2183.
- Step 1 on the S25+ (adb, generic ARM build), alternated with the new frontier on one statement:
  nf peak 5.70-5.75 GiB, 17.9-19.7 s; s1 peak 2.31 GiB, 19.9-26.6 s (heat drift). All byte-identical.
- DONE (s2), was 'in stripe/ but not yet built': stripe 0 evaluated LAST, with the coefficients dropped right after
  it, so a column holds at most coeffs + one stripe during commit (expect about -0.4 GiB at the
  circuit commit peak). The PCS scratch test is IDENTICAL.
- Next ideas: windowed composition (a quarter resident), malloc_trim (glibc only), column-at-a-time
  decommit regrowth.
- WebAssembly (2026-10-08), in wasm-build/ (stripe + crates/privacy_wasm, a wasm-bindgen cdylib that
  mirrors the official harness and returns the UNCOMPRESSED proof). Local-only hacks:
  - getrandom js/wasm_js backends;
  - sonic-rs swapped for serde_json in cairo-program-runner-lib;
  - LargeBlockCache size check done in u64;
  - the cube_252/partial_ec_mul witness pools run on the current thread when no pool can be built.
  Flags: RUSTFLAGS='-C target-feature=+simd128 --cfg getrandom_backend="wasm_js"
  -C link-arg=-zstack-size=16777216'. Bindings via wasm-bindgen-cli 0.2.126.
  Page in runs/wasm/web (server.py logs POSTs to results.log), opened over adb reverse tcp:8765.
  Expected uncompressed proof sha256 a9c4db86...52e6e5 (263796 bytes).
  - Node 22 on the desktop, 1 thread: 120 s, wasm memory 2.77 GiB, IDENTICAL.
  - Chrome 154 on the S25+, 1 thread: 96.0 s, wasm memory 2.77 GiB, IDENTICAL.
- Threads (paused 2026-10-08): wasm-bindgen-rayon 1.3 with init_thread_pool exported. The build is
  in wasm-build/target-mt and needs -Z build-std=panic_abort,std plus
  RUSTFLAGS '+atomics,+bulk-memory,+mutable-globals,+simd128' and these link-args:
  --shared-memory --import-memory --max-memory=4294967296 and --export=__wasm_init_tls/__tls_size/
  __tls_align/__tls_base. Memory is now shared (max 65536 pages). Page: runs/wasm/web/mt/.
  The worker helper imports its package as a directory, so server.py now maps /mt/pkg/ to
  privacy_wasm.js. That fix WORKS (see results below).
- s2 (stripe 0 last), official measure.py vs nf, 10 pairs, x86 16 threads: peak 2.51 GiB
  (2.50-2.54; nf 5.87, -57.2%), time 1.233x (1.224-1.243), byte-identical and verified.
  Phase peaks (MiB): Cairo commits 1809/1845; circuit commit 2433; composition 2511 (hwm 2572),
  now the binding phase; quotients 2136. The next memory step is windowed composition.
  - Gotcha: rsync -a keeps source mtimes, so a target dir built after the edit stays stale. touch
    the edited file before building.
  - ARM s2 binary staged at phone/provably-phone/s2, not yet run on the phone.
  - The wasm builds include s2. privacy_wasm has a `threads` feature (wasm-bindgen-rayon optional);
    single-thread builds without it, target-mt with --features threads. Node, 1 thread: 117 s,
    2.77 GiB, IDENTICAL. web/pkg and web/mt/pkg are regenerated.
- S25+ results (2026-10-08, s2 code), all byte-identical:
  - native s2: peak 2.03 GiB (2080/2065M), 17.9 s and 26.6 s (heat); native nf: 5.47 GiB, 23.2 s.
  - Chrome 154, WebAssembly, 8 threads (wasm-bindgen-rayon): 25.3 s, peak wasm memory 2.85 GiB.
  - Chrome, 1 thread: 96 s, 2.77 GiB.
- Galaxy S9+ (SM-G965U1, Snapdragon 845, 2018; 5.4 GiB RAM, Android 10, Chrome 154):
  - native s2: 1.99 GiB peak, 66-67 s, byte-identical twice;
  - native nf (new frontier): REBOOTED THE PHONE (ran out of memory in the Cairo proof); don't rerun;
  - Chrome, WebAssembly, 8 threads: 93.4 s, peak wasm memory 2.84 GiB, IDENTICAL.
- v6 (old base) on S25+: 27.4 s, 3.22 GiB peak, byte-identical. Old frontier: 30.9 s, 5.74 GiB.
