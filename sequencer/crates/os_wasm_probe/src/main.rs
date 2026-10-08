//! Native checks.
//! `os <virtual-os-input.json>`: runs the virtual OS and prints the PIE summary.
//! `verify <response.json>`: verifies a starknet_proveTransaction result.
//! `replay <capture dir> [out.json]`: the whole TxSession pipeline on a recording made by
//! rpc-record-proxy.py (as replay.mjs does in Node), with timings, peak RSS and a comparison with
//! the native prover's response.
use std::path::Path;
use std::time::Instant;

use os_wasm_probe::TxSession;
use serde_json::{json, Value};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let usage = "usage: os_native_probe os <input.json> | verify <response.json> | replay <capture dir> [out.json]";
    match args.get(1).map(String::as_str) {
        Some("os") => {
            let input = std::fs::read(&args[2]).expect("read input");
            let started = Instant::now();
            let pie = os_wasm_probe::run(&input).expect("virtual OS run");
            println!("{} in {:.2} s", os_wasm_probe::summary(&pie), started.elapsed().as_secs_f64());
        }
        Some("verify") => {
            let input = std::fs::read_to_string(&args[2]).expect("read response");
            let started = Instant::now();
            let verdict = os_wasm_probe::verify_result(&input);
            println!("{verdict:?} in {:.2} s", started.elapsed().as_secs_f64());
        }
        Some("replay") => replay(Path::new(&args[2]), args.get(3).map(Path::new)),
        _ => panic!("{usage}"),
    }
}

fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn first_file(dir: &Path, prefix: &str) -> std::path::PathBuf {
    std::fs::read_dir(dir)
        .expect("read capture dir")
        .map(|entry| entry.expect("dir entry").path())
        .find(|path| path.file_name().unwrap().to_string_lossy().starts_with(prefix))
        .unwrap_or_else(|| panic!("no {prefix}* in {dir:?}"))
}

fn felt(value: &Value) -> num_bigint_lite::Felt {
    num_bigint_lite::Felt::from_hex(value.as_str().expect("hex string")).expect("felt")
}

mod num_bigint_lite {
    pub use starknet_types_core::felt::Felt;
}

/// Peak resident set size of this process in MiB (Linux / Android).
fn peak_rss_mib() -> u64 {
    let status = std::fs::read_to_string("/proc/self/status").unwrap_or_default();
    status
        .lines()
        .find(|line| line.starts_with("VmHWM:"))
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|kib| kib.parse::<u64>().ok())
        .map_or(0, |kib| kib / 1024)
}

fn replay(capture: &Path, out: Option<&Path>) {
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
    println!("block {}, tx {}", session.block_number(), session.tx_hash());
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

    let mut round = 0;
    let proof_params = loop {
        round += 1;
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
        println!("round {round} missed {} storage", storage.len());
        session.add_reads(&json!({ "storage": storage }).to_string()).expect("reads");
    };
    let proofs: Vec<Value> = proof_params
        .as_array()
        .unwrap()
        .iter()
        .map(|_| lookup("starknet_getStorageProof", &|_| true))
        .collect();
    session.set_storage_proofs(&Value::Array(proofs).to_string()).expect("storage proofs");
    let input_seconds = started.elapsed().as_secs_f64();

    let os_started = Instant::now();
    let pie = session.run_os().expect("virtual OS");
    let os_seconds = os_started.elapsed().as_secs_f64();
    println!("{pie}");

    let prove_started = Instant::now();
    let result_json = session.prove().expect("prove");
    let prove_seconds = prove_started.elapsed().as_secs_f64();

    let verify_started = Instant::now();
    let verdict = os_wasm_probe::verify_result(&result_json);
    let verify_seconds = verify_started.elapsed().as_secs_f64();

    let result: Value = serde_json::from_str(&result_json).unwrap();
    let native = read_json(&first_file(capture, "response-"))["result"].clone();
    let identical = result["proof"] == native["proof"] && result["proof_facts"] == native["proof_facts"];
    if let Some(out) = out {
        std::fs::write(out, &result_json).expect("write result");
    }
    println!(
        "input {input_seconds:.2} s ({round} rounds), OS {os_seconds:.2} s, prove {prove_seconds:.1} s, \
         verify {verify_seconds:.2} s {verdict:?}; proof {} to the native prover's; peak RSS {} MiB",
        if identical { "IDENTICAL" } else { "DIFFERENT" },
        peak_rss_mib()
    );
}
