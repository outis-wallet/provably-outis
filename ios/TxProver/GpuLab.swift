// EXPERIMENT (branch ios-gpu): the GPU modes on iOS. A small panel over the showcase sets how the
// prover runs (CPU, GPU lean, GPU full) before each proof, from the page or from the panel, and
// keeps each proof's numbers as text to copy: prove time, IDENTICAL and verified, threads, the
// peak phys_footprint (what jetsam counts, sampled every 20 ms), os_proc_available_memory before,
// at its lowest and after, the thermal state before and after, and the GPU's own report.
import SwiftUI
import UIKit

/// How the prover runs a proof.
enum ProveMode: String, CaseIterable, Identifiable {
    /// The GPU off (`tx_prove_set_gpu(0)`).
    case cpu
    /// The commitments on the GPU, lean (`STWO_GPU_LEAN=1`): one column group at a time through a
    /// small scratch, nothing held between commitments.
    case lean
    /// The commitments, the composition, the decommitment, the out-of-domain samples and the FRI
    /// quotients on the GPU (lean doesn't apply).
    case full

    var id: String { rawValue }
    var title: String {
        switch self {
        case .cpu: "CPU"
        case .lean: "GPU lean"
        case .full: "GPU full"
        }
    }
}

/// What the GPU code reads from the environment, set once at launch, before any GPU device exists.
enum GpuEnvironment {
    static func configure() {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let kernels = caches.appendingPathComponent("outis-gpu-kernels", isDirectory: true)
        try? FileManager.default.createDirectory(at: kernels, withIntermediateDirectories: true)
        // The composer's kernel library (its default, ~/.cache, isn't writable on iOS).
        setenv("OUTIS_GPU_KERNEL_DIR", kernels.path, 1)
        // Anything else that caches under ~/.cache by default.
        setenv("XDG_CACHE_HOME", caches.path, 1)
        // Lean commitments: read when the committer is created (at the first GPU proof). GPU full
        // keeps its columns on the GPU for the composition, so lean doesn't apply to it.
        setenv("STWO_GPU_LEAN", "1", 1)
    }
}

enum MemoryProbe {
    /// The process's physical footprint (task_info's phys_footprint, what jetsam counts), MiB.
    static func footprintMiB() -> Double {
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
        let result = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
            }
        }
        return result == KERN_SUCCESS ? Double(info.phys_footprint) / 1_048_576 : 0
    }

    /// What the app may still allocate before jetsam ends it (0 in the simulator), MiB.
    static func availableMiB() -> Double {
        Double(os_proc_available_memory()) / 1_048_576
    }
}

/// Samples the footprint and the available memory every 20 ms while a proof runs; every half
/// second it saves where it is, so that a proof the system ends shows up in the log at the next launch.
final class FootprintSampler {
    struct Snapshot {
        var peak = 0.0
        var current = 0.0
        var minAvailable = Double.infinity
        var seconds = 0.0
    }

    private let queue = DispatchQueue(label: "footprint-sampler", qos: .userInitiated)
    private let lock = NSLock()
    private var timer: DispatchSourceTimer?
    private var state = Snapshot()
    private var samples = 0
    private var started = Date()
    /// The proof's line, for the log if it never finishes.
    let header: String

    init(header: String) { self.header = header }

    func start() {
        started = Date()
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now(), repeating: .milliseconds(20), leeway: .milliseconds(2))
        timer.setEventHandler { [weak self] in self?.sample() }
        self.timer = timer
        timer.resume()
    }

    private func sample() {
        let footprint = MemoryProbe.footprintMiB()
        let available = MemoryProbe.availableMiB()
        lock.lock()
        state.current = footprint
        state.peak = max(state.peak, footprint)
        if available > 0 { state.minAvailable = min(state.minAvailable, available) }
        state.seconds = Date().timeIntervalSince(started)
        samples += 1
        let snapshot = state
        let save = samples % 25 == 0
        lock.unlock()
        if save { GpuLab.saveInFlight(header: header, snapshot: snapshot) }
    }

    func snapshot() -> Snapshot {
        lock.lock()
        defer { lock.unlock() }
        return state
    }

    func stop() -> Snapshot {
        timer?.cancel()
        timer = nil
        sample()
        return snapshot()
    }
}

/// One proof: its mode applied (on the proof's thread), its numbers before, during and after.
final class ProofRun {
    let number: Int
    let mode: ProveMode
    let action: String
    let requestedThreads: Int
    let source: String
    /// Lean reads the host's coefficients in place (`STWO_GPU_LEAN_NOCOPY`, read per commitment).
    let zeroCopy: Bool
    let started = Date()
    let sampler: FootprintSampler
    private var gpu = ""
    private var availableBefore = 0.0
    private var footprintBefore = 0.0
    private var thermalBefore = ""
    private(set) var text = ""

    init(number: Int, mode: ProveMode, action: String, threads: Int, source: String, zeroCopy: Bool) {
        self.number = number
        self.mode = mode
        self.action = action
        requestedThreads = threads
        self.source = source
        self.zeroCopy = zeroCopy
        sampler = FootprintSampler(header: "#\(number) \(action) · \(mode.title) · \(threads == 0 ? "per-core" : String(threads)) threads · \(Self.clock.string(from: started)) (\(source))")
    }

    static let clock: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter
    }()

    /// Applies the mode (it may create the GPU device and compile its kernels, about a second the
    /// first time), takes the numbers before, and starts sampling. On the proof's thread.
    func prepare() {
        setenv("STWO_GPU_LEAN_NOCOPY", zeroCopy ? "1" : "0", 1)
        gpu = applyMode()
        thermalBefore = Device.thermalState
        footprintBefore = MemoryProbe.footprintMiB()
        availableBefore = MemoryProbe.availableMiB()
        sampler.start()
    }

    private func applyMode() -> String {
        func call(_ answer: UnsafeMutablePointer<CChar>?) -> String {
            defer { tx_prove_free(answer) }
            return answer.map { String(cString: $0) } ?? "{}"
        }
        guard mode != .cpu else {
            _ = call(tx_prove_set_gpu(0))
            return "off"
        }
        let stage: UInt32 = mode == .full ? 1 : 0
        let stages = [
            call(tx_prove_set_gpu_composition(stage)),
            call(tx_prove_set_gpu_decommit(stage)),
            call(tx_prove_set_gpu_ood(stage)),
            call(tx_prove_set_gpu_fri(stage)),
        ].filter { $0.contains("error") }
        let answer = call(tx_prove_set_gpu(1))
        let parsed = (try? JSONSerialization.jsonObject(with: Data(answer.utf8))) as? [String: Any]
        var text: String
        if let adapter = parsed?["ok"] as? String {
            text = adapter
        } else if let error = parsed?["error"] as? String {
            text = "unavailable, the proof stays on the CPU: \(error)"
        } else {
            text = answer
        }
        if !stages.isEmpty { text += " (stages: \(stages.joined(separator: ", ")))" }
        return text
    }

    /// Stops sampling, takes the numbers after, and writes the run's text. On the proof's thread.
    func complete(report: String) {
        let snapshot = sampler.stop()
        let availableAfter = MemoryProbe.availableMiB()
        let parsed = (try? JSONSerialization.jsonObject(with: Data(report.utf8))) as? [String: Any] ?? [:]
        let info = Device.info
        let threads = (parsed["threads"] as? Int).map(String.init) ?? (requestedThreads == 0 ? "per-core" : String(requestedThreads))
        var lines = ["#\(number) \(action) · \(mode.title) · \(threads) threads · \(Self.clock.string(from: started)) (\(source))"]
        let ram = String(format: "%.1f GiB RAM", info["ramGiB"] as? Double ?? 0)
        lines.append("\(Device.model) \(info["chip"] as? String ?? "") · \(info["os"] as? String ?? "") · \(ram) · low power \(ProcessInfo.processInfo.isLowPowerModeEnabled ? "on" : "off") · build \(Device.build)")
        if mode != .cpu { lines.append("GPU: \(gpu)\(mode == .lean && !zeroCopy ? " · zero-copy off" : "")") }
        if let error = parsed["error"] as? String {
            lines.append("ERROR: \(error)")
        } else {
            let prove = parsed["prove_s"] as? Double ?? 0
            let total = parsed["total_s"] as? Double ?? 0
            let identical = parsed["identical"] as? Bool ?? false
            let verified = parsed["verified"] as? Bool ?? false
            let verifyError = parsed["verify_error"] as? String
            lines.append(String(format: "prove %.2f s · total %.2f s · ", prove, total)
                + (identical ? "IDENTICAL" : "DIFFERENT") + " · "
                + (verified ? "verified" : "NOT verified\(verifyError.map { ": \($0)" } ?? "")"))
        }
        let peak = parsed["peak"] as? [String: Any]
        let proverPeak = (peak?["run_mib"] as? Int).map { "\($0) MiB" } ?? "?"
        let processPeak = (peak?["footprint_mib"] as? Int).map { "\($0) MiB" } ?? "?"
        lines.append("phys_footprint peak \(Int(snapshot.peak)) MiB (sampled every 20 ms; the prover's \(proverPeak); the process's highest so far \(processPeak); before \(Int(footprintBefore)) MiB)")
        let lowest = snapshot.minAvailable.isFinite ? "\(Int(snapshot.minAvailable)) MiB" : "?"
        lines.append("os_proc_available_memory: before \(Int(availableBefore)) MiB · lowest \(lowest) · after \(Int(availableAfter)) MiB")
        lines.append("thermal \(thermalBefore) → \(Device.thermalState)")
        lines += (parsed["gpu"] as? [String]) ?? []
        text = lines.joined(separator: "\n")
        print("GPUTEST_RESULT\n\(text)")
    }
}

/// The panel's state and the log of every proof, kept across launches.
final class GpuLab: ObservableObject {
    static let shared = GpuLab()

    private enum Key {
        static let mode = "gpuLab.mode", threads = "gpuLab.threads", log = "gpuLab.log"
        static let count = "gpuLab.count", inFlight = "gpuLab.inFlight", zeroCopy = "gpuLab.zeroCopy"
    }

    @Published var mode: ProveMode { didSet { UserDefaults.standard.set(mode.rawValue, forKey: Key.mode) } }
    @Published var threads: Int { didSet { UserDefaults.standard.set(threads, forKey: Key.threads) } }
    /// Lean reads the host's coefficients in place (off: they are uploaded, about 0.5 GiB more).
    @Published var zeroCopy: Bool { didSet { UserDefaults.standard.set(zeroCopy, forKey: Key.zeroCopy) } }
    @Published var action = "pay"
    @Published var showPanel = false
    @Published private(set) var log: String
    /// The running proof, live: "pay · GPU lean · 12 s · 2100 MiB now, peak 2210 MiB".
    @Published private(set) var status: String?
    @Published private(set) var now = ""

    static let actions = ["pay", "deposit", "register", "withdraw"]
    private var count: Int
    private var ticker: Timer?

    private init() {
        let defaults = UserDefaults.standard
        mode = ProveMode(rawValue: defaults.string(forKey: Key.mode) ?? "") ?? .cpu
        let saved = defaults.integer(forKey: Key.threads)
        threads = saved > 0 ? saved : ProcessInfo.processInfo.activeProcessorCount
        zeroCopy = defaults.object(forKey: Key.zeroCopy) as? Bool ?? true
        log = defaults.string(forKey: Key.log) ?? ""
        count = defaults.integer(forKey: Key.count)
        // A proof that never finished: the system ended the app (jetsam, most likely) or it crashed.
        if let inFlight = defaults.dictionary(forKey: Key.inFlight) {
            defaults.removeObject(forKey: Key.inFlight)
            let header = inFlight["header"] as? String ?? "a proof"
            let peak = inFlight["peak"] as? Double ?? 0
            let available = inFlight["minAvailable"] as? Double ?? 0
            let seconds = inFlight["seconds"] as? Double ?? 0
            append("\(header)\nNO RESULT: the app ended during this proof: the system ended it for memory (jetsam) or it crashed (Xcode's console says which). Last sample at \(Int(seconds)) s: phys_footprint peak \(Int(peak)) MiB, os_proc_available_memory lowest \(Int(available)) MiB.")
        }
        refreshNow()
        // `--panel` (devicectl, an Xcode scheme): the panel open at launch.
        showPanel = CommandLine.arguments.contains("--panel")
    }

    /// A proof starting (on the main thread): its run, numbered.
    func begin(action: String, threads: Int, source: String) -> ProofRun {
        count += 1
        UserDefaults.standard.set(count, forKey: Key.count)
        let run = ProofRun(number: count, mode: mode, action: action, threads: threads, source: source, zeroCopy: zeroCopy)
        Self.saveInFlight(header: run.sampler.header, snapshot: .init())
        ticker?.invalidate()
        ticker = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self, weak run] _ in
            guard let self, let run else { return }
            let s = run.sampler.snapshot()
            self.status = "\(run.action) · \(run.mode.title) · \(Int(Date().timeIntervalSince(run.started))) s · \(Int(s.current)) MiB now, peak \(Int(s.peak)) MiB"
        }
        status = "\(action) · \(mode.title) · starting"
        return run
    }

    /// A proof done (on the main thread).
    func end(_ run: ProofRun) {
        ticker?.invalidate()
        ticker = nil
        status = nil
        UserDefaults.standard.removeObject(forKey: Key.inFlight)
        append(run.text)
        refreshNow()
    }

    static func saveInFlight(header: String, snapshot: FootprintSampler.Snapshot) {
        UserDefaults.standard.set([
            "header": header,
            "peak": snapshot.peak,
            "minAvailable": snapshot.minAvailable.isFinite ? snapshot.minAvailable : 0,
            "seconds": snapshot.seconds,
        ], forKey: Key.inFlight)
    }

    func append(_ text: String) {
        log = log.isEmpty ? text : log + "\n\n" + text
        if log.count > 200_000 { log = String(log.suffix(150_000)) }
        UserDefaults.standard.set(log, forKey: Key.log)
    }

    func clear() {
        log = ""
        UserDefaults.standard.removeObject(forKey: Key.log)
    }

    func refreshNow() {
        now = "available \(Int(MemoryProbe.availableMiB())) MiB · footprint \(Int(MemoryProbe.footprintMiB())) MiB · thermal \(Device.thermalState)"
    }
}

/// The mode, at the top of the screen; a tap opens the panel.
struct GpuButton: View {
    @ObservedObject var lab = GpuLab.shared

    var body: some View {
        Button { lab.showPanel = true } label: {
            HStack(spacing: 4) {
                if lab.status != nil { ProgressView().controlSize(.mini) }
                Text(lab.mode.title)
            }
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(.black.opacity(0.45), in: Capsule())
        }
        .accessibilityLabel("GPU test: \(lab.mode.title)")
    }
}

struct GpuPanel: View {
    @ObservedObject var lab = GpuLab.shared
    @State private var copied = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Mode", selection: $lab.mode) {
                        ForEach(ProveMode.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .disabled(lab.status != nil)
                    if lab.mode == .lean {
                        Toggle("Zero-copy coefficients", isOn: $lab.zeroCopy)
                            .disabled(lab.status != nil)
                    }
                } footer: {
                    Text("For every proof from now on, from here or from the page. For clean memory numbers, quit and reopen the app before switching modes.")
                }
                Section("Proof") {
                    Picker("Transaction", selection: $lab.action) {
                        ForEach(GpuLab.actions, id: \.self) { Text($0).tag($0) }
                    }
                    Stepper("Threads: \(lab.threads)", value: $lab.threads, in: 1...max(8, ProcessInfo.processInfo.activeProcessorCount))
                    Button(lab.status == nil ? "Prove" : "Proving…") { Showcase.shared.proveFromPanel() }
                        .disabled(lab.status != nil)
                    if let status = lab.status {
                        Text(status).font(.footnote.monospacedDigit())
                    }
                    Text("Now: \(lab.now)").font(.footnote).foregroundStyle(.secondary)
                }
                Section {
                    Text(lab.log.isEmpty ? "No proofs yet." : lab.log)
                        .font(.system(size: 11, design: .monospaced))
                        .textSelection(.enabled)
                } header: {
                    HStack {
                        Text("Results")
                        Spacer()
                        Button(copied ? "Copied" : "Copy") {
                            UIPasteboard.general.string = lab.log
                            copied = true
                        }
                        ShareLink(item: lab.log) { Image(systemName: "square.and.arrow.up") }
                            .padding(.leading, 12)
                        Button("Clear", role: .destructive) { lab.clear() }
                            .padding(.leading, 12)
                    }
                    .textCase(nil)
                }
            }
            .navigationTitle("GPU test")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { lab.showPanel = false } }
            }
            .onAppear {
                copied = false
                lab.refreshNow()
            }
        }
    }
}
