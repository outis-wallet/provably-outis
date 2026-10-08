//! Local timing harness (not part of the submission): setup + one recursive privacy proof.
use std::time::Instant;

use cairo_vm::vm::runners::cairo_pie::CairoPie;
use privacy_prove::{prepare_recursive_prover_precomputes, privacy_recursive_prove};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let pie_path = std::path::PathBuf::from(&args[1]);
    let out = &args[2];
    let verify = args.get(3).is_some_and(|s| s == "verify");
    let t0 = Instant::now();
    let pie = CairoPie::read_zip_file(&pie_path).unwrap();
    let precomputes = prepare_recursive_prover_precomputes().unwrap();
    let t_setup = t0.elapsed();
    let output = privacy_recursive_prove(pie, precomputes).unwrap();
    let t_total = t0.elapsed();
    std::fs::write(out, &output.proof).unwrap();
    eprintln!("setup_s={:.3} total_s={:.3} proof_bytes={}", t_setup.as_secs_f64(), t_total.as_secs_f64(), output.proof.len());
    if verify {
        privacy_circuit_verify::verify_recursive_circuit(&output).unwrap();
        eprintln!("verified");
    }
}
