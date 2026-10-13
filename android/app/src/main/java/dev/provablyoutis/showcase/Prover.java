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

    /**
     * Asks the proof under way to stop, from any thread: {@link #prove} then returns
     * {"error": "cancelled", "cancelled": true}, within about a second and a half (a few seconds
     * in the proof's last part).
     */
    static native void cancel();

    /**
     * Turns the GPU on or off for the proofs from now on (the striped commitments on Vulkan, lean:
     * see MainActivity's environment). Returns {"ok": adapter} when on, {"ok": null} when off, or
     * {"error": why} when there is no GPU to use (the proofs then stay on the CPU). The first call
     * that turns it on creates the device, about a second.
     */
    static native String setGpu(boolean enabled);

    private Prover() {}
}
