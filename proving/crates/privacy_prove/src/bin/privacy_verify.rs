//! Pristine verifier for the #224 privacy-pool proof diagnostic. Build it from the pristine
//! proving tree only. Usage: privacy_verify <proof.bin> <output_preimage.json>
//!
//! Exit 0: `verify_recursive_circuit` accepted the proof for this output preimage.
//! Exit 20: it rejected the proof (invalid, malformed, oversized, or for another output).
//! Exit 1: the evaluator-owned inputs could not be read, so no verdict exists.
use std::fs::File;
use std::io::Read;
use std::process::ExitCode;

use privacy_circuit_verify::{PrivacyProofOutput, verify_recursive_circuit};
use starknet_types_core::felt::Felt;

/// Must match the evaluator's `max_proof_bytes`; larger proofs are rejected unread.
const MAX_PROOF_BYTES: u64 = 8 * 1024 * 1024;
/// The evaluator writes the statement; anything larger is not one it wrote.
const MAX_STATEMENT_BYTES: u64 = 1024 * 1024;

/// Read at most `limit` bytes from a regular file; `Ok(None)` means the file is larger.
fn read_bounded(path: &str, limit: u64) -> std::io::Result<Option<Vec<u8>>> {
    let file = File::open(path)?;
    if !file.metadata()?.is_file() {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "not a regular file"));
    }
    let mut bytes = Vec::new();
    file.take(limit + 1).read_to_end(&mut bytes)?;
    Ok((bytes.len() as u64 <= limit).then_some(bytes))
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        eprintln!("usage: privacy_verify <proof.bin> <output_preimage.json>");
        return ExitCode::from(1);
    }
    let proof = match read_bounded(&args[1], MAX_PROOF_BYTES) {
        Ok(Some(bytes)) => bytes,
        Ok(None) => {
            println!("PRIVACY_VERIFY\tREJECTED\tproof exceeds {MAX_PROOF_BYTES} bytes");
            return ExitCode::from(20);
        }
        Err(err) => {
            eprintln!("cannot read proof: {err}");
            return ExitCode::from(1);
        }
    };
    let output_preimage: Vec<Felt> = match read_bounded(&args[2], MAX_STATEMENT_BYTES)
        .map_err(|e| e.to_string())
        .and_then(|bytes| bytes.ok_or_else(|| "statement is oversized".to_string()))
        .and_then(|bytes| serde_json::from_slice(&bytes).map_err(|e| e.to_string()))
    {
        Ok(values) => values,
        Err(err) => {
            eprintln!("cannot read output preimage: {err}");
            return ExitCode::from(1);
        }
    };
    match verify_recursive_circuit(&PrivacyProofOutput { proof, output_preimage }) {
        Ok(()) => {
            println!("PRIVACY_VERIFY\tACCEPTED");
            ExitCode::SUCCESS
        }
        Err(err) => {
            println!("PRIVACY_VERIFY\tREJECTED\t{err}");
            ExitCode::from(20)
        }
    }
}
