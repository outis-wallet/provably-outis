// os_wasm_probe's replay entry points (prover/crates/os_wasm_probe/src/replay.rs, in the prover
// submodule), linked from the static library that ios/build-rust.sh builds.
#include <stdint.h>

/// Gets each progress event as JSON (valid during the call), from any thread.
typedef void (*tx_progress_callback)(void *context, const char *event_json);

/// Replays the capture in `capture_dir` on `threads` threads (0: one per core); returns the report
/// as JSON, or {"error": ...}. `progress` may be NULL. Free the answer with tx_prove_free.
char *tx_prove_replay(const char *capture_dir, uint32_t threads, tx_progress_callback progress, void *context);
/// Asks the replay under way to stop (from any thread): it answers {"error": "cancelled",
/// "cancelled": true} within about a second and a half, or a few seconds in the proof's last part.
void tx_prove_replay_cancel(void);
void tx_prove_free(char *answer);

/// Turns the GPU on or off for the proofs from now on, process-wide (the library's gpu feature,
/// which ios/build-rust.sh builds in: prover/crates/os_wasm_probe/src/native.rs). Returns
/// {"ok": adapter} when on, {"ok": null} when off, or {"error": why} when there is no GPU to use
/// (the proofs then stay on the CPU); free it with tx_prove_free. The first call that turns it on
/// creates the GPU device, about a second.
char *tx_prove_set_gpu(uint32_t enabled);
