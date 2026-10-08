/* tslint:disable */
/* eslint-disable */

/**
 * Proves a prepared privacy-pool input; returns the serialized (uncompressed) recursive proof.
 */
export function prove(input: Uint8Array): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly prove: (a: number, b: number) => [number, number, number, number];
    readonly rust_zstd_wasm_shim_calloc: (a: number, b: number) => number;
    readonly rust_zstd_wasm_shim_free: (a: number) => void;
    readonly rust_zstd_wasm_shim_malloc: (a: number) => number;
    readonly rust_zstd_wasm_shim_memcmp: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_memcpy: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_memmove: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_memset: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_qsort: (a: number, b: number, c: number, d: number) => void;
    readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzBuffToBuffCompress: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzBuffToBuffDecompress: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzCompress: (a: number, b: number) => number;
    readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzCompressEnd: (a: number) => number;
    readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzCompressInit: (a: number, b: number, c: number, d: number) => number;
    readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzDecompress: (a: number) => number;
    readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzDecompressEnd: (a: number) => number;
    readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzDecompressInit: (a: number, b: number, c: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
