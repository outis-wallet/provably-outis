package dev.provablyoutis.showcase;

/** os_wasm_probe's replay (the Rust prover), through the JNI shim in src/main/cpp. */
final class Prover {
    static {
        System.loadLibrary("showcase");
    }

    interface Listener {
        /** A Progress event as JSON, on one of the prover's threads. */
        void onEvent(String eventJson);
    }

    /**
     * Replays the capture in {@code captureDir} on {@code threads} threads (0: one per core) and
     * returns the report as JSON, or {"error": ...}. Blocks until the proof is verified.
     */
    static native String prove(String captureDir, int threads, Listener listener);

    private Prover() {}
}
