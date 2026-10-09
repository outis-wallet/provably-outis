package dev.provingly.showcase;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.system.ErrnoException;
import android.system.Os;
import android.util.Log;
import android.view.HapticFeedbackConstants;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The showcase on Android: the shared web UI (showcase/, in the assets as web/) in a full-screen
 * WebView, and the bridge from it to the Rust prover. The page/native contract is in
 * showcase/bridge.js; the iOS app (ios/TxProver/ShowcaseApp.swift) implements the same one.
 */
public class MainActivity extends Activity {
    private static final String TAG = "Showcase";
    /** The page's color (app.css --page), shown before it draws. */
    private static final int PAGE = 0xFF16231F;
    /** What scores are stored under: android-<version>-<the repository's commit>. */
    private static final String BUILD = "android-" + BuildConfig.VERSION_NAME + "-" + BuildConfig.COMMIT;

    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView webView;
    private boolean proving;
    private boolean startedFromIntent;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        // The prover writes a temporary file (privacy_prove's bootloader output). Without TMPDIR,
        // Rust picks /data/local/tmp, which apps can't write: Android 10 doesn't set it for apps.
        try {
            Os.setenv("TMPDIR", getCacheDir().getAbsolutePath(), true);
        } catch (ErrnoException exception) {
            Log.w(TAG, "can't set TMPDIR", exception);
        }
        webView = new WebView(this);
        webView.setBackgroundColor(PAGE);
        webView.getSettings().setJavaScriptEnabled(true);
        // The page keeps the scores it sent in localStorage (to mark them on the results page).
        webView.getSettings().setDomStorageEnabled(true);
        webView.addJavascriptInterface(new Bridge(), "ProvinglyAndroid");
        webView.setWebViewClient(new WebViewClient() {
            // Only the bundled page; a link out opens in the browser.
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("file".equals(url.getScheme())) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, url));
                return true;
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                recreate();
                return true;
            }
        });
        WebView.setWebContentsDebuggingEnabled(true);
        setContentView(webView);
        webView.loadUrl("file:///android_asset/web/index.html");
    }

    @Override
    public void onBackPressed() {
        webView.evaluateJavascript("provingly.back()", handled -> {
            if (!"true".equals(handled)) MainActivity.super.onBackPressed();
        });
    }

    /** What the page calls, as window.ProvinglyAndroid (on WebView's own thread). */
    private final class Bridge {
        @JavascriptInterface
        public void postMessage(String json) {
            main.post(() -> receive(json));
        }

        @JavascriptInterface
        public String deviceJson() {
            return Device.json(MainActivity.this);
        }
    }

    private void receive(String json) {
        try {
            JSONObject message = new JSONObject(json);
            switch (message.optString("type")) {
                case "prove": prove(message.optString("action"), message.optInt("threads", 0)); break;
                case "ready": startFromIntent(); break;
                default: break;
            }
        } catch (JSONException ignored) {
        }
    }

    /** Proves a bundled capture on a thread of its own; the prover's events go to the page as they come. */
    private void prove(String action, int threads) {
        if (proving) return;
        // An action names one of the bundled captures (captures/<id>), nothing else.
        if (!action.matches("[a-z]+") || !Captures.exists(getAssets(), action)) {
            send(error("No capture for " + action + "."));
            return;
        }
        proving = true;
        // A screen that turns off would pause the app mid-proof.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        String thermalBefore = Device.thermalState(this);
        Thread prover = new Thread(null, () -> {
            String report;
            try {
                File capture = Captures.unpack(this, action);
                report = Prover.prove(capture.getPath(), Math.max(threads, 0),
                        event -> main.post(() -> sendJson("{\"type\":\"event\",\"event\":" + event + "}")));
            } catch (IOException exception) {
                report = error(exception.toString()).toString();
            }
            String finalReport = report;
            String conditions = Device.conditions(this, thermalBefore);
            main.post(() -> finish(finalReport, conditions));
        }, "prover", 16 << 20);
        prover.start();
    }

    private void finish(String report, String conditions) {
        proving = false;
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        Log.i(TAG, "SHOWCASE_RESULT " + report);
        try {
            JSONObject parsed = new JSONObject(report);
            if (parsed.has("error")) {
                send(error(parsed.optString("error")));
                return;
            }
        } catch (JSONException exception) {
            send(error("Unreadable report: " + exception.getMessage()));
            return;
        }
        // The report goes on as the prover wrote it, so its numbers keep their precision, with the
        // build its score is stored under (docs/RESULTS.md) put in front.
        String withBuild = "{\"build\":" + JSONObject.quote(BUILD) + "," + report.trim().substring(1);
        sendJson("{\"type\":\"result\",\"report\":" + withBuild + ",\"conditions\":" + conditions + "}");
        webView.performHapticFeedback(HapticFeedbackConstants.CONFIRM);
    }

    /**
     * Extras {@code prove} (an action) and {@code threads} start a proof once the page is ready:
     * {@code adb shell am start -S -n dev.provingly.showcase/.MainActivity --es prove pay --ei threads 8}.
     */
    private void startFromIntent() {
        String action = getIntent().getStringExtra("prove");
        if (startedFromIntent || action == null) return;
        startedFromIntent = true;
        try {
            send(new JSONObject().put("type", "auto").put("action", action).put("threads", getIntent().getIntExtra("threads", 0)));
        } catch (JSONException ignored) {
        }
    }

    private static JSONObject error(String message) {
        try {
            return new JSONObject().put("type", "error").put("message", message);
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private void send(JSONObject message) {
        sendJson(message.toString());
    }

    private void sendJson(String json) {
        webView.evaluateJavascript("provingly.receive(" + json + ")", null);
    }

    /** The captures in the assets, copied to files on first use: the prover reads a directory. */
    static final class Captures {
        static boolean exists(AssetManager assets, String action) {
            try {
                String[] files = assets.list("captures/" + action);
                return files != null && files.length > 0;
            } catch (IOException exception) {
                return false;
            }
        }

        static File unpack(Context context, String action) throws IOException {
            File directory = new File(context.getFilesDir(), "captures/" + action);
            File complete = new File(directory, ".complete");
            if (complete.exists()) return directory;
            if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("can't create " + directory);
            AssetManager assets = context.getAssets();
            byte[] buffer = new byte[1 << 16];
            for (String name : assets.list("captures/" + action)) {
                try (InputStream in = assets.open("captures/" + action + "/" + name);
                     OutputStream out = new FileOutputStream(new File(directory, name))) {
                    for (int count; (count = in.read(buffer)) > 0; ) out.write(buffer, 0, count);
                }
            }
            if (!complete.createNewFile()) throw new IOException("can't mark " + directory);
            return directory;
        }
    }

    /** What the page shows about this device (bridge.js `device`), and the conditions of a run. */
    static final class Device {
        static String json(Context context) {
            ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo();
            ((ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE)).getMemoryInfo(memory);
            try {
                JSONObject device = new JSONObject()
                        .put("platform", "android")
                        .put("model", Build.MODEL)
                        .put("name", Build.MANUFACTURER + " " + Build.MODEL)
                        .put("os", "Android " + Build.VERSION.RELEASE)
                        .put("arch", Build.SUPPORTED_ABIS[0])
                        .put("cores", Runtime.getRuntime().availableProcessors())
                        .put("ramGiB", memory.totalMem / (double) (1L << 30));
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) device.put("soc", Build.SOC_MODEL);
                int[] split = coreSplit();
                if (split != null) device.put("perfCores", split[0]).put("efficiencyCores", split[1]);
                return device.toString();
            } catch (JSONException impossible) {
                throw new IllegalStateException(impossible);
            }
        }

        /**
         * Performance and efficiency cores, from each core's top frequency: a core reaching at
         * least 70% of the fastest one's counts as performance. (A Snapdragon 8 Elite's 2 + 6
         * cores are all performance cores; an Exynos 9810's 2.9 GHz and 1.8 GHz quads split 4 + 4.)
         */
        static int[] coreSplit() {
            int cores = Runtime.getRuntime().availableProcessors();
            long[] frequencies = new long[cores];
            long fastest = 0;
            for (int core = 0; core < cores; core++) {
                File file = new File("/sys/devices/system/cpu/cpu" + core + "/cpufreq/cpuinfo_max_freq");
                try (java.util.Scanner scanner = new java.util.Scanner(file)) {
                    frequencies[core] = scanner.nextLong();
                } catch (IOException | RuntimeException unreadable) {
                    return null;
                }
                fastest = Math.max(fastest, frequencies[core]);
            }
            int performance = 0;
            for (long frequency : frequencies) if (frequency * 10 >= fastest * 7) performance++;
            return new int[] {performance, cores - performance};
        }

        static String conditions(Context context, String thermalBefore) {
            PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            try {
                return new JSONObject()
                        .put("thermal_before", thermalBefore)
                        .put("thermal_after", thermalState(context))
                        .put("low_power_mode", power.isPowerSaveMode())
                        .toString();
            } catch (JSONException impossible) {
                throw new IllegalStateException(impossible);
            }
        }

        /** Android's thermal status in the iOS app's words, which the page shows. */
        static String thermalState(Context context) {
            PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            switch (power.getCurrentThermalStatus()) {
                case PowerManager.THERMAL_STATUS_NONE: return "nominal";
                case PowerManager.THERMAL_STATUS_LIGHT:
                case PowerManager.THERMAL_STATUS_MODERATE: return "fair";
                case PowerManager.THERMAL_STATUS_SEVERE: return "serious";
                default: return "critical";
            }
        }
    }
}
