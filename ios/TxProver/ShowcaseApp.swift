// The showcase on iOS: the shared web UI (showcase/, bundled as web/) in a full-screen web view, and
// the bridge from it to the Rust prover (os_wasm_probe::replay, linked as a static library). The
// page/native contract is in showcase/bridge.js; the Android app implements the same one.
import SwiftUI
import UIKit
import WebKit

@main
struct ShowcaseApp: App {
    var body: some Scene {
        WindowGroup {
            ShowcaseView()
                .ignoresSafeArea()
                .background(Color(uiColor: Showcase.background))
                .preferredColorScheme(.dark)
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
    private var startedFromArguments = false

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addUserScript(WKUserScript(
            source: "window.provinglyNative = { device: \(Device.json) };",
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
        case "prove": prove(action: body["action"] as? String ?? "", threads: body["threads"] as? Int ?? 0)
        case "share": share(text: body["text"] as? String ?? "")
        case "ready": startFromArguments()
        default: break
        }
    }

    /// Proves a bundled capture on a thread of its own; the prover's events go to the page as they come.
    private func prove(action: String, threads: Int) {
        guard !proving else { return }
        // An action names one of the bundled captures (captures/<id>), nothing else.
        guard !action.isEmpty, action.allSatisfy({ $0.isASCII && $0.isLowercase }),
              let capture = Bundle.main.url(forResource: action, withExtension: nil, subdirectory: "captures") else {
            send(["type": "error", "message": "No capture for \(action)."])
            return
        }
        proving = true
        // A locked screen would suspend the app mid-proof.
        UIApplication.shared.isIdleTimerDisabled = true
        let thermalBefore = Device.thermalState
        let context = Unmanaged.passUnretained(self).toOpaque()
        let thread = Thread {
            let answer = capture.path.withCString { tx_prove_replay($0, UInt32(clamping: threads), progressToPage, context) }
            let report = answer.map { String(cString: $0) } ?? #"{"error": "The prover gave no answer."}"#
            tx_prove_free(answer)
            let conditions: [String: Any] = [
                "thermal_before": thermalBefore,
                "thermal_after": Device.thermalState,
                "low_power_mode": ProcessInfo.processInfo.isLowPowerModeEnabled,
            ]
            DispatchQueue.main.async { self.finish(report: report, conditions: conditions) }
        }
        thread.qualityOfService = .userInitiated
        thread.start()
    }

    private func finish(report: String, conditions: [String: Any]) {
        proving = false
        UIApplication.shared.isIdleTimerDisabled = false
        print("SHOWCASE_RESULT \(report)")
        let parsed = (try? JSONSerialization.jsonObject(with: Data(report.utf8))) as? [String: Any]
        if let error = parsed?["error"] as? String {
            send(["type": "error", "message": error])
            return
        }
        // The report goes on as the prover wrote it, so its numbers keep their precision.
        sendJSON(#"{"type":"result","report":"# + report + #","conditions":"# + Self.json(conditions) + "}")
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    private func share(text: String) {
        let sheet = UIActivityViewController(activityItems: [text], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = webView
        sheet.popoverPresentationController?.sourceRect = CGRect(x: webView.bounds.midX, y: webView.bounds.maxY - 120, width: 1, height: 1)
        var presenter = webView.window?.rootViewController
        while let presented = presenter?.presentedViewController { presenter = presented }
        presenter?.present(sheet, animated: true)
    }

    /// Launch arguments `--prove <action> [--threads N]` (devicectl, an Xcode scheme) start a proof
    /// once the page is ready.
    private func startFromArguments() {
        let arguments = CommandLine.arguments
        guard !startedFromArguments, let index = arguments.firstIndex(of: "--prove") else { return }
        startedFromArguments = true
        let action = index + 1 < arguments.count && !arguments[index + 1].hasPrefix("--") ? arguments[index + 1] : "pay"
        var threads = 0
        if let flag = arguments.firstIndex(of: "--threads"), flag + 1 < arguments.count { threads = Int(arguments[flag + 1]) ?? 0 }
        send(["type": "auto", "action": action, "threads": threads])
    }

    func send(_ message: [String: Any]) { sendJSON(Self.json(message)) }

    func sendJSON(_ json: String) {
        webView.evaluateJavaScript("provingly.receive(\(json))")
    }

    static func json(_ object: [String: Any]) -> String {
        String(decoding: (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8), as: UTF8.self)
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
    DispatchQueue.main.async { showcase.sendJSON(#"{"type":"event","event":"# + event + "}") }
}

enum Device {
    /// The hardware identifier, e.g. "iPhone18,1"; in the simulator, the simulated device's.
    static let model: String = {
        if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] { return simulated }
        var system = utsname()
        uname(&system)
        return withUnsafeBytes(of: &system.machine) { bytes in String(decoding: bytes.prefix { $0 != 0 }, as: UTF8.self) }
    }()

    /// What the page shows about this device (bridge.js `device`).
    static var json: String {
        Showcase.json([
            "platform": "ios",
            "model": model,
            "os": "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)",
            "cores": ProcessInfo.processInfo.activeProcessorCount,
            "ramGiB": Double(ProcessInfo.processInfo.physicalMemory) / Double(1 << 30),
        ])
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
