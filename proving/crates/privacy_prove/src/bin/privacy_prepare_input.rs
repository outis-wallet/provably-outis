//! Evaluator-owned preparation of the #224 privacy-pool proof workload. Build it from the
//! pristine proving tree only, never from a candidate overlay. Runs outside the proof clock.
//!
//! Usage: privacy_prepare_input <pie.zip> <simple_output_compiled.json> <nonce-hex32> <out.json>
//!        privacy_prepare_input --setup-only <out.json>
//!
//! Runs StarkWare's privacy bootloader (same program, run config and output-preimage handling as
//! the private `privacy_prove::run_privacy_bootloader`) on the pinned privacy transaction PIE plus a
//! second task, the pinned `simple_output` program, echoing a fresh 128-bit nonce as four 32-bit
//! words. The words land in the output preimage, whose hash is the public input the recursive
//! verifier checks, so a proof for one nonce cannot pass for another.
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::Path;
use std::rc::Rc;

use anyhow::{Context, Result, anyhow, ensure};
use cairo_program_runner_lib::types::{HashFunc, PrivacySimpleBootloaderInput, SimpleBootloaderInput};
use cairo_program_runner_lib::{Cairo0Executable, ProgramInput, Task, TaskSpec, cairo_run_program};
use cairo_vm::types::program::Program;
use cairo_vm::vm::runners::cairo_pie::CairoPie;
use privacy_circuit_verify::get_privacy_bootloader_program;
use privacy_prove::consts::CAIRO_RUN_CONFIG;
use starknet_types_core::felt::Felt;
use stwo_cairo_adapter::ProverInput;
use stwo_cairo_adapter::adapter::adapt;

/// Must equal `PREPARED_SCHEMA` in privacy_prove_stdout.rs.
const PREPARED_SCHEMA: &str = "pf224-privacy-prepared/1";

fn nonce_words(hex: &str) -> Result<[u32; 4]> {
    ensure!(hex.len() == 32 && hex.bytes().all(|b| b.is_ascii_hexdigit()), "nonce must be 32 hex characters");
    let mut words = [0u32; 4];
    for (index, word) in words.iter_mut().enumerate() {
        *word = u32::from_str_radix(&hex[8 * index..8 * index + 8], 16)?;
    }
    Ok(words)
}

fn write_prepared(path: &Path, header: serde_json::Value, body: Option<&ProverInput>) -> Result<()> {
    let mut out = BufWriter::new(File::create_new(path).context("prepared output must not exist")?);
    serde_json::to_writer(&mut out, &header)?;
    out.write_all(b"\n")?;
    if let Some(input) = body {
        serde_json::to_writer(&mut out, input)?;
    }
    out.flush()?;
    out.into_inner().map_err(|e| anyhow!("{e}"))?.sync_all()?;
    Ok(())
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() == 3 && args[1] == "--setup-only" {
        let header = serde_json::json!({ "schema": PREPARED_SCHEMA, "mode": "setup_only" });
        return write_prepared(Path::new(&args[2]), header, None);
    }
    ensure!(args.len() == 5, "usage: privacy_prepare_input <pie.zip> <echo.json> <nonce-hex32> <out.json> | --setup-only <out.json>");
    let words = nonce_words(&args[3])?;
    let pie = CairoPie::read_zip_file(Path::new(&args[1])).map_err(|e| anyhow!("cannot read PIE: {e}"))?;
    let echo = Program::from_file(Path::new(&args[2]), Some("main")).map_err(|e| anyhow!("cannot read echo program: {e}"))?;
    let echo_task = Task::Cairo0Program(Cairo0Executable {
        program: echo,
        program_input: Some(serde_json::json!({ "output": words }).to_string()),
    });
    let output_preimage_file = tempfile::NamedTempFile::new()?;
    let bootloader_input = PrivacySimpleBootloaderInput {
        simple_bootloader_input: SimpleBootloaderInput {
            fact_topologies_path: None,
            single_page: true,
            tasks: vec![
                TaskSpec { task: Rc::new(Task::Pie(pie)), program_hash_function: HashFunc::Blake },
                TaskSpec { task: Rc::new(echo_task), program_hash_function: HashFunc::Blake },
            ],
        },
        output_preimage_dump_path: output_preimage_file.path().to_path_buf(),
    };
    let program = get_privacy_bootloader_program().map_err(|e| anyhow!("{e}"))?;
    let runner = cairo_run_program(&program, Some(ProgramInput::Value(Box::new(bootloader_input))), CAIRO_RUN_CONFIG, None)
        .map_err(|e| anyhow!("bootloader run failed: {e}"))?;
    let output_preimage: Vec<Felt> = serde_json::from_str(&fs::read_to_string(output_preimage_file.path())?)?;
    let tail: Vec<Felt> = words.iter().map(|w| Felt::from(*w)).collect();
    ensure!(output_preimage.ends_with(&tail), "bootloader output does not end with the nonce words");
    let prover_input = adapt(&runner).map_err(|e| anyhow!("adapter failed: {e}"))?;
    let header = serde_json::json!({ "schema": PREPARED_SCHEMA, "mode": "prove", "output_preimage": output_preimage });
    write_prepared(Path::new(&args[4]), header, Some(&prover_input))
}
