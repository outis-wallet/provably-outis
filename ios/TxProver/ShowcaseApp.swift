// The showcase on iOS: the shared web UI (showcase/, bundled as web/) in a full-screen web view, and
// the bridge from it to the Rust prover (os_wasm_probe::replay, linked as a static library). The
// page/native contract is in outis/wallet/apps/prover/src/bridge.ts; the Android app implements the same one.
import Metal
import SwiftUI
import UIKit
import WebKit

@main
struct ShowcaseApp: App {
    // EXPERIMENT (ios-gpu): the GPU modes' panel (GpuLab.swift).
    @ObservedObject private var lab = GpuLab.shared

    init() {
        // Before any GPU device exists (the first GPU proof).
        GpuEnvironment.configure()
    }

    var body: some Scene {
        WindowGroup {
            ShowcaseView()
                .ignoresSafeArea()
                .background(Color(uiColor: Showcase.background))
                .preferredColorScheme(.dark)
                .overlay(alignment: .topTrailing) { GpuButton().padding(.trailing, 12) }
                .sheet(isPresented: $lab.showPanel) { GpuPanel() }
        }
    }
}

struct ShowcaseView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView { Showcase.shared.webView }
    func updateUIView(_ webView: WKWebView, context: Context) {}
}

/// The web view and its bridge, for the app's lifetime (the progress callback points at it).
final class Showcase: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    static let shared = Showcase()
    /// The page's color (app.css --page), shown before it draws and behind overscroll.
    static let background = UIColor(red: 0x16 / 255, green: 0x23 / 255, blue: 0x1f / 255, alpha: 1)

    let webView: WKWebView
    private var proving = false
    /// The page stopped the proof under way: nothing more of it goes to the page.
    fileprivate var cancelling = false
    /// A proof the page started while the stopped one was still ending: it starts when that ends,
    /// so two proofs never run (and take their memory) at once.
    private var pending: (action: String, threads: Int, engine: String?)?
    private var startedFromArguments = false

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addUserScript(WKUserScript(
            source: "window.provablyOutisNative = \(Self.json(["device": Device.info, "build": Device.build, "canCancel": true, "gpu": Device.gpu]));",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.configuration.userContentController.add(self, name: "prover")
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = Self.background
        webView.scrollView.backgroundColor = Self.background
        // The page pads itself for the notch and the home indicator (env(safe-area-inset-*)).
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        let page = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web")!
        webView.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "prove": prove(action: body["action"] as? String ?? "", threads: body["threads"] as? Int ?? 0, engine: body["engine"] as? String)
        case "cancel": cancel()
        case "ready": startFromArguments()
        default: break
        }
    }

    /// A proof from the GPU panel (GpuLab.swift): its action and threads, the page not told.
    func proveFromPanel() {
        prove(action: GpuLab.shared.action, threads: GpuLab.shared.threads, fromPage: false)
    }

    /// Proves a bundled capture on a thread of its own; the prover's events go to the page as they
    /// come (when the page asked). The page's `engine` ("gpu": GPU lean, else the CPU) is applied
    /// first, or the GPU panel's mode when the page sent none (an older UI), and the proof logged
    /// in the panel.
    private func prove(action: String, threads: Int, engine: String? = nil, fromPage: Bool = true) {
        guard !proving else {
            if cancelling && fromPage { pending = (action, threads, engine) }
            return
        }
        // An action names one of the bundled captures (captures/<id>), nothing else.
        guard !action.isEmpty, action.allSatisfy({ $0.isASCII && $0.isLowercase }),
              let capture = Bundle.main.url(forResource: action, withExtension: nil, subdirectory: "captures") else {
            if fromPage { send(["type": "error", "message": "No capture for \(action)."]) }
            return
        }
        proving = true
        // A locked screen would suspend the app mid-proof.
        UIApplication.shared.isIdleTimerDisabled = true
        let thermalBefore = Device.thermalState
        let context = Unmanaged.passUnretained(self).toOpaque()
        // The GPU for this proof, or not: it stays on the CPU if there is none to use.
        let mode: ProveMode? = engine.map { $0 == "gpu" ? .lean : .cpu }
        let run = GpuLab.shared.begin(action: action, threads: threads, source: fromPage ? "page" : "panel", mode: mode)
        let thread = Thread {
            run.prepare()
            let answer = capture.path.withCString {
                tx_prove_replay($0, UInt32(clamping: threads), fromPage ? progressToPage : nil, fromPage ? context : nil)
            }
            let report = answer.map { String(cString: $0) } ?? #"{"error": "The prover gave no answer."}"#
            tx_prove_free(answer)
            run.complete(report: report)
            let conditions: [String: Any] = [
                "thermal_before": thermalBefore,
                "thermal_after": Device.thermalState,
                "low_power_mode": ProcessInfo.processInfo.isLowPowerModeEnabled,
            ]
            DispatchQueue.main.async {
                GpuLab.shared.end(run)
                self.finish(report: report, conditions: conditions, toPage: fromPage)
            }
        }
        thread.qualityOfService = .userInitiated
        thread.start()
    }

    /// The page stopped the proof (its logo, back to the start): the prover stops at its next step,
    /// and the page hears nothing more of this proof.
    private func cancel() {
        guard proving, !cancelling else { return }
        cancelling = true
        tx_prove_replay_cancel()
    }

    private func finish(report: String, conditions: [String: Any], toPage: Bool = true) {
        proving = false
        UIApplication.shared.isIdleTimerDisabled = false
        let parsed = (try? JSONSerialization.jsonObject(with: Data(report.utf8))) as? [String: Any]
        // The report goes on as the prover wrote it, so its numbers keep their precision, with the
        // engine that proved it put in front: "gpu" when the GPU made a commitment (its report's gpu
        // lines), else "cpu".
        var result = report
        if let parsed, parsed["error"] == nil { result = Self.withEngine(report, Device.ranOnGpu(parsed) ? "gpu" : "cpu") }
        print("SHOWCASE_RESULT \(result)")
        if cancelling {
            cancelling = false
            if let next = pending {
                pending = nil
                prove(action: next.action, threads: next.threads, engine: next.engine)
            }
            return
        }
        guard toPage else { return }
        if let error = parsed?["error"] as? String {
            send(["type": "error", "message": error])
            return
        }
        sendJSON(#"{"type":"result","report":"# + result + #","conditions":"# + Self.json(conditions) + "}")
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    /// Launch arguments `--prove <action> [--threads N] [--engine cpu|gpu] [--mode cpu|lean|full]
    /// [--native] [--cancel-after S]` (devicectl, an Xcode scheme) start a proof once the page is
    /// ready: with `--engine`, the page sets its Hardware Type as if picked and proves with it;
    /// `--mode` is the GPU panel's (for `--native`, or a page that sends no engine).
    private func startFromArguments() {
        let arguments = CommandLine.arguments
        if let flag = arguments.firstIndex(of: "--mode"), flag + 1 < arguments.count,
           let mode = ProveMode(rawValue: arguments[flag + 1]) {
            GpuLab.shared.mode = mode
        }
        guard !startedFromArguments, let index = arguments.firstIndex(of: "--prove") else { return }
        startedFromArguments = true
        let action = index + 1 < arguments.count && !arguments[index + 1].hasPrefix("--") ? arguments[index + 1] : "pay"
        var threads = 0
        if let flag = arguments.firstIndex(of: "--threads"), flag + 1 < arguments.count { threads = Int(arguments[flag + 1]) ?? 0 }
        var engine: String?
        if let flag = arguments.firstIndex(of: "--engine"), flag + 1 < arguments.count { engine = arguments[flag + 1] }
        // EXPERIMENT (ios-gpu) `--native`: <action> proved without the page (which proves its one
        // transaction), logged in the GPU panel.
        if arguments.contains("--native") {
            prove(action: action, threads: threads, fromPage: false)
            return
        }
        var auto: [String: Any] = ["type": "auto", "action": action, "threads": threads]
        if let engine { auto["engine"] = engine }
        send(auto)
        // EXPERIMENT (ios-gpu) `--cancel-after S`: S seconds in, stop the proof and ask for the same
        // again at once, as the page does (stop, then prove): the new one waits for the stopped one.
        if let flag = arguments.firstIndex(of: "--cancel-after"), flag + 1 < arguments.count,
           let seconds = Double(arguments[flag + 1]) {
            DispatchQueue.main.asyncAfter(deadline: .now() + seconds) {
                self.cancel()
                self.prove(action: action, threads: threads, engine: engine)
            }
        }
    }

    func send(_ message: [String: Any]) { sendJSON(Self.json(message)) }

    func sendJSON(_ json: String) {
        webView.evaluateJavaScript("provablyOutis.receive(\(json))")
    }

    static func json(_ object: [String: Any]) -> String {
        String(decoding: (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8), as: UTF8.self)
    }

    /// A report (a JSON object, as the prover wrote it) with `engine` ("cpu" or "gpu") put in front.
    static func withEngine(_ report: String, _ engine: String) -> String {
        let rest = report.trimmingCharacters(in: .whitespacesAndNewlines).dropFirst()
        return #"{"engine":"\#(engine)""# + (rest.hasPrefix("}") ? "" : ",") + String(rest)
    }

    // Only the bundled page; a link out opens in the browser.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, url.isFileURL else {
            if let url = action.request.url { UIApplication.shared.open(url) }
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}

/// Gets the prover's events (on its threads) and passes them to the page (on the main thread).
private let progressToPage: tx_progress_callback = { context, eventJson in
    guard let context, let eventJson else { return }
    let showcase = Unmanaged<Showcase>.fromOpaque(context).takeUnretainedValue()
    let event = String(cString: eventJson)
    DispatchQueue.main.async {
        if !showcase.cancelling { showcase.sendJSON(#"{"type":"event","event":"# + event + "}") }
    }
}

enum Device {
    /// The hardware identifier, e.g. "iPhone18,1". In the simulator, "Simulator": it runs on the
    /// Mac's chip, so its scores must not be taken for the simulated iPhone's.
    static let model: String = {
        #if targetEnvironment(simulator)
        return "Simulator"
        #else
        var system = utsname()
        uname(&system)
        return withUnsafeBytes(of: &system.machine) { bytes in String(decoding: bytes.prefix { $0 != 0 }, as: UTF8.self) }
        #endif
    }()

    /// The Mac's chip, e.g. "Apple M5 Pro", when running in the simulator.
    private static let simulatorHost: String? = {
        #if targetEnvironment(simulator)
        var size = 0
        guard sysctlbyname("machdep.cpu.brand_string", nil, &size, nil, 0) == 0, size > 0 else { return nil }
        var name = [CChar](repeating: 0, count: size)
        guard sysctlbyname("machdep.cpu.brand_string", &name, &size, nil, 0) == 0 else { return nil }
        return String(cString: name)
        #else
        return nil
        #endif
    }()

    /// What the page shows about this device (bridge.ts `device`), and sends with a score
    /// (docs/RESULTS.md: flat, strings and numbers).
    static var info: [String: Any] {
        var info: [String: Any] = [
            "platform": "ios",
            "model": model,
            "os": "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)",
            "arch": "ARM64",
            // What the results page sorts devices by (Phones, Tablets, Desktops). The simulator
            // runs on a Mac.
            "form": model.hasPrefix("iPad") ? "tablet" : model == "Simulator" ? "desktop" : "phone",
            "cores": ProcessInfo.processInfo.activeProcessorCount,
            "ramGiB": Double(ProcessInfo.processInfo.physicalMemory) / Double(1 << 30),
        ]
        if let chip = chips[model] ?? simulatorHost { info["chip"] = chip }
        // The page labels a device by its name when the model isn't one it knows (content.ts).
        if model == "Simulator" { info["name"] = simulatorHost.map { "iOS Simulator (\($0))" } ?? "iOS Simulator" }
        if let performance = sysctlInt("hw.perflevel0.physicalcpu") { info["perfCores"] = performance }
        if let efficiency = sysctlInt("hw.perflevel1.physicalcpu") { info["efficiencyCores"] = efficiency }
        return info
    }

    /// What the scores are stored under: ios-<version>-<the repository's commit> (bundled as
    /// build.txt by the "Bundle the showcase" phase), so that a faster prover can be told apart.
    static let build: String = {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        let commit = Bundle.main.url(forResource: "build", withExtension: "txt")
            .flatMap { try? String(contentsOf: $0, encoding: .utf8) }?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? "unknown"
        // -gpu: this build's scores may come from the GPU modes (branch ios-gpu).
        let text = "ios-\(version)-\(commit)-gpu"
        return String(text.filter { $0.isASCII && ($0.isLetter || $0.isNumber || "._+-".contains($0)) }.prefix(64))
    }()

    /// The chip in each model we know of (Apple's identifiers; others are left out).
    private static let chips: [String: String] = [
        "iPhone13,1": "A14 Bionic", "iPhone13,2": "A14 Bionic", "iPhone13,3": "A14 Bionic", "iPhone13,4": "A14 Bionic",
        "iPhone14,2": "A15 Bionic", "iPhone14,3": "A15 Bionic", "iPhone14,4": "A15 Bionic", "iPhone14,5": "A15 Bionic",
        "iPhone14,6": "A15 Bionic", "iPhone14,7": "A15 Bionic", "iPhone14,8": "A15 Bionic",
        "iPhone15,2": "A16 Bionic", "iPhone15,3": "A16 Bionic", "iPhone15,4": "A16 Bionic", "iPhone15,5": "A16 Bionic",
        "iPhone16,1": "A17 Pro", "iPhone16,2": "A17 Pro",
        "iPhone17,1": "A18 Pro", "iPhone17,2": "A18 Pro", "iPhone17,3": "A18", "iPhone17,4": "A18", "iPhone17,5": "A18",
        "iPhone18,1": "A19 Pro", "iPhone18,2": "A19 Pro",
        "iPad13,16": "Apple M1", "iPad13,17": "Apple M1",
    ]

    /// The GPU the page may offer (bridge.ts `gpu`): a Metal device, which the prover's wgpu needs.
    /// Whether it really works shows at the first GPU proof: if it doesn't, the proof stays on the
    /// CPU and reports engine "cpu".
    static var gpu: [String: Any] {
        MTLCreateSystemDefaultDevice() != nil
            ? ["available": true]
            : ["available": false, "reason": "This device has no Metal GPU, so proofs use the CPU only."]
    }

    /// Whether a report's gpu lines (the prover's) show a commitment made on the GPU.
    static func ranOnGpu(_ report: [String: Any]) -> Bool {
        let lines = (report["gpu"] as? [Any] ?? []).compactMap { $0 as? String }
        return lines.contains { $0.hasPrefix("commitment #") && $0.contains(": GPU ") }
    }

    private static func sysctlInt(_ name: String) -> Int? {
        var value: Int32 = 0
        var size = MemoryLayout<Int32>.size
        return sysctlbyname(name, &value, &size, nil, 0) == 0 ? Int(value) : nil
    }

    static var thermalState: String {
        switch ProcessInfo.processInfo.thermalState {
        case .nominal: "nominal"
        case .fair: "fair"
        case .serious: "serious"
        case .critical: "critical"
        @unknown default: "unknown"
        }
    }
}
