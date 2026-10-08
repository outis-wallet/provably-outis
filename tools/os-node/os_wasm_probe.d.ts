/* tslint:disable */
/* eslint-disable */

/**
 * One transaction's way from RPC data to a virtual OS run.
 */
export class TxSession {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Adds a Cairo 1 class: its `starknet_getCompiledCasm` result and the first three felts of
     * its Sierra program (`starknet_getClass`), which encode the Sierra version.
     */
    add_class(class_hash: string, casm_json: string, sierra_program_head_json: string): void;
    /**
     * Adds state reads in the `initial_reads` format of `starknet_simulateTransactions`.
     */
    add_reads(initial_reads_json: string): void;
    /**
     * Records that the node does not know this class.
     */
    add_undeclared_class(class_hash: string): void;
    block_number(): bigint;
    /**
     * Executes the transaction. Returns `{"missing": ...}` when a read was not prefetched
     * (fetch it, add it, call again), else `{"storage_proof_params": [...]}`: the
     * `starknet_getStorageProof` requests to make.
     */
    execute(): string;
    /**
     * `header_json`: a `starknet_getBlockWithTxHashes` result. `rpc_transaction_json`: the
     * invoke v3 transaction as sent to `starknet_proveTransaction`.
     */
    constructor(chain_id: string, header_json: string, rpc_transaction_json: string);
    /**
     * Proves the virtual OS run as the transaction prover does; returns the
     * `starknet_proveTransaction` result JSON (proof, proof_facts, l2_to_l1_messages).
     */
    prove(): string;
    /**
     * Runs the virtual OS on the built input; returns the PIE summary.
     */
    run_os(): string;
    /**
     * Takes the `starknet_getStorageProof` results (a JSON array, one per requested params),
     * builds the virtual OS input and returns it as JSON (the native dump's format).
     */
    set_storage_proofs(storage_proofs_json: string): string;
    tx_hash(): string;
}

/**
 * Sends `tracing` events at `level` and above (e.g. "info") to the console. No timestamps: there
 * is no clock on wasm32-unknown-unknown.
 */
export function init_logging(level: string): void;

/**
 * Wasm memory size, live heap and peak live heap, in MiB.
 */
export function memory_report(): string;

export function run_virtual_os(virtual_os_input_json: Uint8Array): string;

/**
 * Prints panic messages to the console; a wasm panic otherwise shows only "unreachable".
 */
export function start(): void;

export function verify_prove_result(result_json: string): void;
