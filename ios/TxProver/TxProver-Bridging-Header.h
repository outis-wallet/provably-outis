// os_wasm_probe's replay entry points (sequencer/crates/os_wasm_probe/src/replay.rs), linked from
// the static library that ios/build-rust.sh builds.
#include <stdint.h>

/// Replays the capture in `capture_dir` on `threads` threads (0: one per core); returns the report
/// as JSON, or {"error": ...}. Free it with tx_prove_free.
char *tx_prove_replay(const char *capture_dir, uint32_t threads);
void tx_prove_free(char *answer);
