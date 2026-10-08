//! Timed #224 privacy-pool proof worker. The evaluator builds it from a candidate or pristine
//! archive extraction and launches it with no arguments inside the contained supervisor, which
//! binds the prepared input read-only at /run/pvfast-proof-input. An optional first argument
//! overrides that path for non-contained tests only.
//!
//! `prove` mode: StarkWare's recursive privacy prover (the body of
//! `privacy_prove::privacy_recursive_prove` after the bootloader run, production parameters,
//! channel salt 0) on the prepared witness; writes the version-prefixed compressed recursive
//! proof to stdout. `setup_only` mode: builds only the reusable precomputes and writes a marker,
//! so the evaluator can report setup separately from per-proof work.
use std::io::{self, Write};

use anyhow::{Result, anyhow, ensure};
use circuit_cairo_verifier::verify::{build_and_fill_cairo_verifier_circuit, prepare_cairo_proof_for_circuit_verifier};
use circuit_common::finalize::{add_zk_blinding, pad_context};
use circuit_prover::prover::{prepare_circuit_proof_for_circuit_verifier, prove_circuit_with_precompute};
use circuit_serialize::serialize::CircuitSerialize;
use privacy_circuit_verify::compute_privacy_bootloader_output_hash;
use privacy_circuit_verify::utils::Version;
use privacy_prove::consts::CAIRO_PROVER_PARAMS;
use privacy_prove::prepare_recursive_prover_precomputes;
use stwo::core::utils::MaybeOwned;
use stwo_cairo_adapter::ProverInput;
use stwo_cairo_prover::prover::prove_cairo_with_precompute;

// Prepared-input format: one line of JSON header, a newline, then (prove mode only) the
// `stwo_cairo_adapter::ProverInput` JSON. The header is exactly
// {"schema": PREPARED_SCHEMA, "mode": "prove", "output_preimage": [felt, ...]} or
// {"schema": PREPARED_SCHEMA, "mode": "setup_only"}; any other key or value is rejected.
/// Schema tag of the evaluator-prepared input.
pub const PREPARED_SCHEMA: &str = "pf224-privacy-prepared/1";

/// Fixed path where the contained supervisor binds the prepared input read-only.
pub const PREPARED_INPUT_PATH: &str = "/run/pvfast-proof-input";

/// Parsed header: `Some(preimage)` for prove mode, `None` for setup-only mode.
pub fn parse_prepared_header(
    bytes: &[u8],
) -> anyhow::Result<(Option<Vec<starknet_types_core::felt::Felt>>, &[u8])> {
    let newline = bytes
        .iter()
        .position(|&b| b == b'\n')
        .ok_or_else(|| anyhow::anyhow!("prepared input has no header line"))?;
    let header: serde_json::Value = serde_json::from_slice(&bytes[..newline])?;
    let object = header.as_object().ok_or_else(|| anyhow::anyhow!("prepared header is not an object"))?;
    anyhow::ensure!(
        object.get("schema").and_then(|v| v.as_str()) == Some(PREPARED_SCHEMA),
        "unexpected prepared-input schema"
    );
    let body = &bytes[newline + 1..];
    match object.get("mode").and_then(|v| v.as_str()) {
        Some("setup_only") => {
            anyhow::ensure!(object.len() == 2 && body.is_empty(), "setup-only input has extra content");
            Ok((None, body))
        }
        Some("prove") => {
            anyhow::ensure!(object.len() == 3, "prove header has unexpected keys");
            let preimage = serde_json::from_value(
                object.get("output_preimage").cloned().ok_or_else(|| anyhow::anyhow!("missing output_preimage"))?,
            )?;
            anyhow::ensure!(!body.is_empty(), "prove input has no witness");
            Ok((Some(preimage), body))
        }
        _ => anyhow::bail!("unknown prepared-input mode"),
    }
}

fn main() -> Result<()> {
    let path = std::env::args().nth(1).unwrap_or_else(|| PREPARED_INPUT_PATH.to_string());
    let bytes = std::fs::read(&path)?;
    let (preimage, body) = parse_prepared_header(&bytes)?;
    let precomputes = prepare_recursive_prover_precomputes().map_err(|e| anyhow!("{e}"))?;
    let Some(output_preimage) = preimage else {
        let mut stdout = io::stdout().lock();
        stdout.write_all(b"PF224_SETUP_ONLY\n")?;
        return Ok(stdout.flush()?);
    };
    let prover_input: ProverInput = serde_json::from_slice(body)?;
    drop(bytes);
    let cairo_proof = prove_cairo_with_precompute(
        &precomputes.base_column_pool,
        &precomputes.twiddles,
        precomputes.cairo_preprocessed_trace.clone(),
        MaybeOwned::Borrowed(&precomputes.cairo_preprocessed_tree),
        prover_input,
        CAIRO_PROVER_PARAMS,
    )
    .map_err(|e| anyhow!("cairo proof failed: {e:?}"))?;
    let component_enable_bits = cairo_proof.claim.flatten_claim().component_enable_bits;
    let (proof, aux) = prepare_cairo_proof_for_circuit_verifier(&cairo_proof, &component_enable_bits);
    let output_hash = compute_privacy_bootloader_output_hash(&output_preimage);
    let mut context = build_and_fill_cairo_verifier_circuit(&precomputes.cairo_verifier_config, proof, aux, output_hash);
    ensure!(context.is_circuit_valid(), "Circuit is not valid");
    let zk_blinding_seed = cairo_proof.extended_stark_proof.proof.commitments.0[1].0;
    add_zk_blinding(&mut context, zk_blinding_seed, precomputes.circuit_config.config.fri_config.n_queries);
    pad_context(&mut context);
    let circuit_proof = prove_circuit_with_precompute(
        &precomputes.base_column_pool,
        &precomputes.twiddles,
        &precomputes.preprocessed_circuit,
        MaybeOwned::Borrowed(&precomputes.circuit_preprocessed_tree),
        context.values(),
        precomputes.circuit_config.config,
    )
    .map_err(|e| anyhow!("circuit proof failed: {e:?}"))?;
    let (proof_qm31s, _public_data) = prepare_circuit_proof_for_circuit_verifier(circuit_proof);
    let mut proof_bytes: Vec<u8> = vec![];
    proof_qm31s.serialize(&mut proof_bytes);
    let compressed = zstd::encode_all(&proof_bytes[..], 3)?;
    let mut stdout = io::stdout().lock();
    stdout.write_all(&Version::current().serialize())?;
    stdout.write_all(&compressed)?;
    Ok(stdout.flush()?)
}
