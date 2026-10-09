// Proves the captured Outis transaction (captures/capture2, bundled as capture2/) on the device with
// the same Rust pipeline as os_native_probe replay, and shows the report.
import SwiftUI

@main
struct TxProverApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
    }
}

struct ContentView: View {
    private static let cores = ProcessInfo.processInfo.activeProcessorCount
    @State private var threads = cores
    @State private var running = false
    @State private var output = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Stepper("Threads: \(threads)", value: $threads, in: 1...Self.cores)
                    Button(running ? "Proving…" : "Prove", action: prove).disabled(running)
                } footer: {
                    Text(Device.summary)
                }
                if !output.isEmpty {
                    Section("Result") {
                        Text(output).font(.system(.footnote, design: .monospaced)).textSelection(.enabled)
                    }
                }
            }
            .navigationTitle("Tx prover")
        }
        .onAppear(perform: proveIfLaunchedTo)
    }

    /// Launch arguments `--prove [--threads N]` (devicectl, Xcode scheme) start a proof right away.
    private func proveIfLaunchedTo() {
        let arguments = CommandLine.arguments
        guard arguments.contains("--prove"), !running else { return }
        if let index = arguments.firstIndex(of: "--threads"), index + 1 < arguments.count,
           let count = Int(arguments[index + 1]) {
            threads = min(max(count, 1), Self.cores)
        }
        prove()
    }

    private func prove() {
        guard let capture = Bundle.main.url(forResource: "capture2", withExtension: nil) else {
            output = "capture2 is missing from the app bundle"
            return
        }
        running = true
        // A locked screen would suspend the app mid-proof.
        UIApplication.shared.isIdleTimerDisabled = true
        let threadCount = threads
        let thermalBefore = Device.thermalState
        output = "proving on \(threadCount) threads, thermal state \(thermalBefore)…"
        Task.detached(priority: .userInitiated) {
            let answer: UnsafeMutablePointer<CChar>? = capture.path.withCString { tx_prove_replay($0, UInt32(threadCount)) }
            let report = answer.map { String(cString: $0) } ?? #"{"error": "no answer"}"#
            tx_prove_free(answer)
            let conditions = "\(Device.summary); thermal \(thermalBefore) -> \(Device.thermalState)"
                + (ProcessInfo.processInfo.isLowPowerModeEnabled ? ", low power mode" : "")
            print("TX_PROVER_RESULT \(conditions)\n\(report)")
            await MainActor.run {
                output = "\(conditions)\n\(report)"
                running = false
                UIApplication.shared.isIdleTimerDisabled = false
            }
        }
    }
}

enum Device {
    /// The hardware identifier, e.g. "iPhone17,1" ("arm64" in the simulator).
    static let model: String = {
        var system = utsname()
        uname(&system)
        return withUnsafeBytes(of: &system.machine) { bytes in
            String(decoding: bytes.prefix { $0 != 0 }, as: UTF8.self)
        }
    }()
    static let os = "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)"
    static let ramGiB = (Double(ProcessInfo.processInfo.physicalMemory) / Double(1 << 30) * 10).rounded() / 10
    static var summary: String { "\(model), \(os), \(ramGiB) GiB RAM, \(ProcessInfo.processInfo.activeProcessorCount) cores" }

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
