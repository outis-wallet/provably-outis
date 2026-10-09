// os_wasm_probe's replay entry points (sequencer/crates/os_wasm_probe/src/replay.rs), linked from
// the static library that ios/build-rust.sh builds.
#include <stdint.h>

/// Gets each progress event as JSON (valid during the call), from any thread.
typedef void (*tx_progress_callback)(void *context, const char *event_json);

/// Replays the capture in `capture_dir` on `threads` threads (0: one per core); returns the report
/// as JSON, or {"error": ...}. `progress` may be NULL. Free the answer with tx_prove_free.
char *tx_prove_replay(const char *capture_dir, uint32_t threads, tx_progress_callback progress, void *context);
void tx_prove_free(char *answer);
