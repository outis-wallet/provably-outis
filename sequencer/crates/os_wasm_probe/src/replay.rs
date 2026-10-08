//! The whole TxSession pipeline on a recording made by rpc-record-proxy.py (as replay.mjs does in
//! Node), natively: `os_native_probe replay` and the C entry point `tx_prove_replay` (iOS app).
use std::ffi::{c_char, CStr, CString};
use std::path::{Path, PathBuf};
use std::time::Instant;

use serde::Serialize;
use serde_json::{json, Value};
use starknet_types_core::felt::Felt;

use crate::TxSession;

/// Timings, verdicts and peak memory of one replay.
#[derive(Serialize)]
pub struct Report {
    pub block: u64,
    pub tx_hash: String,
    pub threads: usize,
    pub rounds: usize,
    pub input_s: f64,
    pub os_s: f64,
    pub prove_s: f64,
    pub verify_s: f64,
    pub total_s: f64,
    pub pie: String,
    pub verified: bool,
    pub verify_error: Option<String>,
    /// Proof and proof_facts equal to the native prover's response in the capture.
    pub identical: bool,
    pub peak: PeakMemory,
    #[serde(skip)]
    pub result_json: String,
}

/// Peak memory of this process so far, in MiB. `footprint` (Apple only) is the peak physical
/// footprint, which is what jetsam counts on iOS.
#[derive(Serialize)]
pub struct PeakMemory {
    pub rss_mib: u64,
    pub footprint_mib: Option<u64>,
}

/// Replays the capture in `capture` on the current rayon pool; panics on any failure.
/// `log` gets the progress lines.
pub fn replay(capture: &Path, log: &mut dyn FnMut(&str)) -> Report {
    let recorded: Vec<Value> = std::fs::read_to_string(capture.join("rpc-log.jsonl"))
        .expect("rpc-log.jsonl")
        .lines()
        .map(|line| serde_json::from_str(line).expect("log line"))
        .collect();
    let lookup = |method: &str, matches: &dyn Fn(&Value) -> bool| -> Value {
        recorded
            .iter()
            .find(|entry| entry["request"]["method"] == method && matches(&entry["request"]["params"]))
            .map(|entry| entry["response"]["result"].clone())
            .unwrap_or_else(|| panic!("not in the recording: {method}"))
    };
    let transaction = read_json(&first_file(capture, "request-"))["params"]["transaction"].clone();

    let started = Instant::now();
    let header = lookup("starknet_getBlockWithTxHashes", &|_| true);
    let mut session =
        TxSession::new("SN_SEPOLIA", &header.to_string(), &transaction.to_string()).expect("session");
    log(&format!("block {}, tx {}", session.block_number(), session.tx_hash()));
    let simulation = lookup("starknet_simulateTransactions", &|_| true);
    let initial_reads = &simulation["initial_reads"];
    session.add_reads(&initial_reads.to_string()).expect("reads");

    let add_class = |session: &mut TxSession, class_hash: &Value| {
        let casm = read_json(&capture.join(format!("casm-{}.json", class_hash.as_str().unwrap())));
        let sierra = lookup("starknet_getClass", &|params| felt(&params["class_hash"]) == felt(class_hash));
        let head = Value::Array(sierra["sierra_program"].as_array().expect("sierra")[..3].to_vec());
        session
            .add_class(class_hash.as_str().unwrap(), &casm["result"].to_string(), &head.to_string())
            .expect("class");
    };
    for entry in initial_reads["class_hashes"].as_array().expect("class hashes") {
        add_class(&mut session, &entry["class_hash"]);
    }

    let mut rounds = 0;
    let proof_params = loop {
        rounds += 1;
        let result: Value = serde_json::from_str(&session.execute().expect("execute")).unwrap();
        let Some(missing) = result.get("missing") else {
            break result["storage_proof_params"].clone();
        };
        let storage: Vec<Value> = missing["storage"]
            .as_array()
            .unwrap()
            .iter()
            .map(|pair| {
                let value = lookup("starknet_getStorageAt", &|params| {
                    felt(&params["contract_address"]) == felt(&pair[0]) && felt(&params["key"]) == felt(&pair[1])
                });
                json!({ "contract_address": pair[0], "key": pair[1], "value": value })
            })
            .collect();
        assert!(
            missing["nonces"].as_array().unwrap().is_empty()
                && missing["class_hashes"].as_array().unwrap().is_empty()
                && missing["classes"].as_array().unwrap().is_empty(),
            "only storage misses are replayed: {missing}"
        );
        log(&format!("round {rounds} missed {} storage", storage.len()));
        session.add_reads(&json!({ "storage": storage }).to_string()).expect("reads");
    };
    let proofs: Vec<Value> = proof_params
        .as_array()
        .unwrap()
        .iter()
        .map(|_| lookup("starknet_getStorageProof", &|_| true))
        .collect();
    session.set_storage_proofs(&Value::Array(proofs).to_string()).expect("storage proofs");
    let input_s = started.elapsed().as_secs_f64();

    let os_started = Instant::now();
    let pie = session.run_os().expect("virtual OS");
    let os_s = os_started.elapsed().as_secs_f64();
    log(&pie);

    log("proving");
    let prove_started = Instant::now();
    let result_json = session.prove().expect("prove");
    let prove_s = prove_started.elapsed().as_secs_f64();

    let verify_started = Instant::now();
    let verdict = crate::verify_result(&result_json);
    let verify_s = verify_started.elapsed().as_secs_f64();

    let result: Value = serde_json::from_str(&result_json).unwrap();
    let native = read_json(&first_file(capture, "response-"))["result"].clone();
    Report {
        block: session.block_number(),
        tx_hash: session.tx_hash(),
        threads: rayon::current_num_threads(),
        rounds,
        input_s: milliseconds(input_s),
        os_s: milliseconds(os_s),
        prove_s: milliseconds(prove_s),
        verify_s: milliseconds(verify_s),
        total_s: milliseconds(started.elapsed().as_secs_f64()),
        pie,
        verified: verdict.is_ok(),
        verify_error: verdict.err(),
        identical: result["proof"] == native["proof"] && result["proof_facts"] == native["proof_facts"],
        peak: peak_memory(),
        result_json,
    }
}

/// C entry point (the iOS app): replays the capture in the directory `capture_dir` on a pool of
/// `threads` threads (0: one per core) and returns the [`Report`] as pretty JSON, or
/// `{"error": ...}`.
/// Progress lines go to stdout. Free the result with [`tx_prove_free`].
///
/// # Safety
/// `capture_dir` must be a valid NUL-terminated string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn tx_prove_replay(capture_dir: *const c_char, threads: u32) -> *mut c_char {
    let capture = PathBuf::from(unsafe { CStr::from_ptr(capture_dir) }.to_string_lossy().into_owned());
    let run = || {
        // install() runs the whole pipeline on a pool thread, not just the parallel parts: give the
        // threads a main thread's stack (as the wasm build's -zstack-size) instead of 2 MiB.
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(threads as usize)
            .stack_size(16 << 20)
            .build()
            .expect("thread pool");
        let report = pool.install(|| replay(&capture, &mut |line| println!("{line}")));
        serde_json::to_string_pretty(&report).expect("report")
    };
    let answer = std::panic::catch_unwind(run).unwrap_or_else(|panic| {
        let message = panic
            .downcast_ref::<String>()
            .map(String::as_str)
            .or_else(|| panic.downcast_ref::<&str>().copied())
            .unwrap_or("panic");
        json!({ "error": message }).to_string()
    });
    CString::new(answer).expect("no NUL in JSON").into_raw()
}

/// Frees a string returned by [`tx_prove_replay`].
///
/// # Safety
/// `answer` must come from [`tx_prove_replay`] and not be freed before.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn tx_prove_free(answer: *mut c_char) {
    if !answer.is_null() {
        drop(unsafe { CString::from_raw(answer) });
    }
}

#[cfg(target_vendor = "apple")]
pub fn peak_memory() -> PeakMemory {
    // <mach/task_info.h> `struct task_vm_info` through rev 3 (TASK_VM_INFO_REV3_COUNT = 84 ints).
    // The kernel fills whole revisions only, so the struct must cover all of rev 3. Every field
    // after page_size is 8-byte aligned, so the header's pack(4) does not change this layout.
    #[repr(C)]
    #[derive(Default)]
    struct TaskVmInfo {
        virtual_size: u64,
        region_count: i32,
        page_size: i32,
        resident_size: u64,
        resident_size_peak: u64,
        _device_to_compressed_lifetime: [u64; 14],
        phys_footprint: u64,
        min_address: u64,
        max_address: u64,
        ledger_phys_footprint_peak: i64,
        _rest_of_rev3: [i64; 20],
    }
    const TASK_VM_INFO: u32 = 22;
    unsafe extern "C" {
        static mach_task_self_: u32;
        fn task_info(task: u32, flavor: u32, info: *mut i32, count: *mut u32) -> i32;
    }
    let mut info = TaskVmInfo::default();
    let mut count = (size_of::<TaskVmInfo>() / size_of::<i32>()) as u32;
    let status = unsafe {
        task_info(mach_task_self_, TASK_VM_INFO, (&raw mut info).cast(), &mut count)
    };
    if status != 0 {
        return PeakMemory { rss_mib: 0, footprint_mib: None };
    }
    PeakMemory {
        rss_mib: info.resident_size_peak >> 20,
        footprint_mib: Some((info.ledger_phys_footprint_peak.max(0) as u64) >> 20),
    }
}

/// VmHWM (Linux / Android).
#[cfg(not(target_vendor = "apple"))]
pub fn peak_memory() -> PeakMemory {
    let status = std::fs::read_to_string("/proc/self/status").unwrap_or_default();
    let rss_mib = status
        .lines()
        .find(|line| line.starts_with("VmHWM:"))
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|kib| kib.parse::<u64>().ok())
        .map_or(0, |kib| kib / 1024);
    PeakMemory { rss_mib, footprint_mib: None }
}

/// Seconds rounded to the millisecond, which JSON then prints in full.
fn milliseconds(seconds: f64) -> f64 {
    (seconds * 1000.0).round() / 1000.0
}

fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn first_file(dir: &Path, prefix: &str) -> PathBuf {
    std::fs::read_dir(dir)
        .expect("read capture dir")
        .map(|entry| entry.expect("dir entry").path())
        .find(|path| path.file_name().unwrap().to_string_lossy().starts_with(prefix))
        .unwrap_or_else(|| panic!("no {prefix}* in {dir:?}"))
}

fn felt(value: &Value) -> Felt {
    Felt::from_hex(value.as_str().expect("hex string")).expect("felt")
}
