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

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_txsession_free: (a: number, b: number) => void;
    readonly init_logging: (a: number, b: number) => [number, number];
    readonly memory_report: () => [number, number];
    readonly run_virtual_os: (a: number, b: number) => [number, number, number, number];
    readonly txsession_add_class: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly txsession_add_reads: (a: number, b: number, c: number) => [number, number];
    readonly txsession_add_undeclared_class: (a: number, b: number, c: number) => [number, number];
    readonly txsession_block_number: (a: number) => bigint;
    readonly txsession_execute: (a: number) => [number, number, number, number];
    readonly txsession_new: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly txsession_prove: (a: number) => [number, number, number, number];
    readonly txsession_run_os: (a: number) => [number, number, number, number];
    readonly txsession_set_storage_proofs: (a: number, b: number, c: number) => [number, number, number, number];
    readonly txsession_tx_hash: (a: number) => [number, number];
    readonly verify_prove_result: (a: number, b: number) => [number, number];
    readonly start: () => void;
    readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzBuffToBuffCompress: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzBuffToBuffDecompress: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzCompress: (a: number, b: number) => number;
    readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzCompressEnd: (a: number) => number;
    readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzCompressInit: (a: number, b: number, c: number, d: number) => number;
    readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzDecompress: (a: number) => number;
    readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzDecompressEnd: (a: number) => number;
    readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzDecompressInit: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_calloc: (a: number, b: number) => number;
    readonly rust_zstd_wasm_shim_free: (a: number) => void;
    readonly rust_zstd_wasm_shim_malloc: (a: number) => number;
    readonly rust_zstd_wasm_shim_memcmp: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_memcpy: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_memmove: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_memset: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_qsort: (a: number, b: number, c: number, d: number) => void;
    readonly __wbindgen_exn_store_command_export: (a: number) => void;
    readonly __externref_table_alloc_command_export: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc_command_export: (a: number, b: number) => number;
    readonly __wbindgen_realloc_command_export: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc_command_export: (a: number) => void;
    readonly __wbindgen_free_command_export: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
