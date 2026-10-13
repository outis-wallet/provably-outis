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

// EXPERIMENT (ios-gpu): the GPU prover's switches (prover/crates/os_wasm_probe/src/native.rs, in a
// library built with the gpu feature), process-wide, for the proofs from now on. Each returns
// {"ok": ...} or {"error": ...}; free it with tx_prove_free. tx_prove_set_gpu(1) creates the GPU
// device on its first call (and returns {"ok": adapter}); the stages take 0 off, 1 on, 2 shadow.
char *tx_prove_set_gpu(uint32_t enabled);
char *tx_prove_set_gpu_composition(uint32_t mode);
char *tx_prove_set_gpu_decommit(uint32_t mode);
char *tx_prove_set_gpu_ood(uint32_t mode);
char *tx_prove_set_gpu_fri(uint32_t mode);

// os_proc_available_memory(): what the app may still allocate before jetsam ends it.
#include <os/proc.h>
