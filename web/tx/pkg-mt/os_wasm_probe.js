/* @ts-self-types="./os_wasm_probe.d.ts" */
import { startWorkers } from './snippets/wasm-bindgen-rayon-38edf6e439f6d70d/src/workerHelpers.js';


/**
 * One transaction's way from RPC data to a virtual OS run.
 */
export class TxSession {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TxSessionFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_txsession_free(ptr, 0);
    }
    /**
     * Adds a Cairo 1 class: its `starknet_getCompiledCasm` result and the first three felts of
     * its Sierra program (`starknet_getClass`), which encode the Sierra version.
     * @param {string} class_hash
     * @param {string} casm_json
     * @param {string} sierra_program_head_json
     */
    add_class(class_hash, casm_json, sierra_program_head_json) {
        const ptr0 = passStringToWasm0(class_hash, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(casm_json, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(sierra_program_head_json, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.txsession_add_class(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Adds state reads in the `initial_reads` format of `starknet_simulateTransactions`.
     * @param {string} initial_reads_json
     */
    add_reads(initial_reads_json) {
        const ptr0 = passStringToWasm0(initial_reads_json, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.txsession_add_reads(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Records that the node does not know this class.
     * @param {string} class_hash
     */
    add_undeclared_class(class_hash) {
        const ptr0 = passStringToWasm0(class_hash, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.txsession_add_undeclared_class(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {bigint}
     */
    block_number() {
        const ret = wasm.txsession_block_number(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * Executes the transaction. Returns `{"missing": ...}` when a read was not prefetched
     * (fetch it, add it, call again), else `{"storage_proof_params": [...]}`: the
     * `starknet_getStorageProof` requests to make.
     * @returns {string}
     */
    execute() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.txsession_execute(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free_command_export(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * `header_json`: a `starknet_getBlockWithTxHashes` result. `rpc_transaction_json`: the
     * invoke v3 transaction as sent to `starknet_proveTransaction`.
     * @param {string} chain_id
     * @param {string} header_json
     * @param {string} rpc_transaction_json
     */
    constructor(chain_id, header_json, rpc_transaction_json) {
        const ptr0 = passStringToWasm0(chain_id, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(header_json, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(rpc_transaction_json, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.txsession_new(ptr0, len0, ptr1, len1, ptr2, len2);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        TxSessionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Proves the virtual OS run as the transaction prover does; returns the
     * `starknet_proveTransaction` result JSON (proof, proof_facts, l2_to_l1_messages).
     * @returns {string}
     */
    prove() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.txsession_prove(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free_command_export(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Runs the virtual OS on the built input; returns the PIE summary.
     * @returns {string}
     */
    run_os() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.txsession_run_os(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free_command_export(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Takes the `starknet_getStorageProof` results (a JSON array, one per requested params),
     * builds the virtual OS input and returns it as JSON (the native dump's format).
     * @param {string} storage_proofs_json
     * @returns {string}
     */
    set_storage_proofs(storage_proofs_json) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(storage_proofs_json, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.txsession_set_storage_proofs(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free_command_export(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    tx_hash() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.txsession_tx_hash(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free_command_export(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) TxSession.prototype[Symbol.dispose] = TxSession.prototype.free;

/**
 * @param {number} num_threads
 * @returns {Promise<any>}
 */
export function initThreadPool(num_threads) {
    const ret = wasm.initThreadPool(num_threads);
    return ret;
}

/**
 * Sends `tracing` events at `level` and above (e.g. "info") to the console. No timestamps: there
 * is no clock on wasm32-unknown-unknown.
 * @param {string} level
 */
export function init_logging(level) {
    const ptr0 = passStringToWasm0(level, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.init_logging(ptr0, len0);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Wasm memory size, live heap and peak live heap, in MiB.
 * @returns {string}
 */
export function memory_report() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.memory_report();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free_command_export(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {Uint8Array} virtual_os_input_json
 * @returns {string}
 */
export function run_virtual_os(virtual_os_input_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passArray8ToWasm0(virtual_os_input_json, wasm.__wbindgen_malloc_command_export);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.run_virtual_os(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free_command_export(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Prints panic messages to the console; a wasm panic otherwise shows only "unreachable".
 */
export function start() {
    wasm.start();
}

/**
 * @param {string} result_json
 */
export function verify_prove_result(result_json) {
    const ptr0 = passStringToWasm0(result_json, wasm.__wbindgen_malloc_command_export, wasm.__wbindgen_realloc_command_export);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.verify_prove_result(ptr0, len0);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

export class wbg_rayon_PoolBuilder {
    static __wrap(ptr) {
        const obj = Object.create(wbg_rayon_PoolBuilder.prototype);
        obj.__wbg_ptr = ptr;
        wbg_rayon_PoolBuilderFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        wbg_rayon_PoolBuilderFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wbg_rayon_poolbuilder_free(ptr, 0);
    }
    build() {
        wasm.wbg_rayon_poolbuilder_build(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    numThreads() {
        const ret = wasm.wbg_rayon_poolbuilder_numThreads(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    receiver() {
        const ret = wasm.wbg_rayon_poolbuilder_receiver(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) wbg_rayon_PoolBuilder.prototype[Symbol.dispose] = wbg_rayon_PoolBuilder.prototype.free;

/**
 * @param {number} receiver
 */
export function wbg_rayon_start_worker(receiver) {
    wasm.wbg_rayon_start_worker(receiver);
}
function __wbg_get_imports(memory) {
    const import0 = {
        __proto__: null,
        __wbg_Error_92b29b0548f8b746: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_is_function_1ff95bcc5517c252: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_object_a27215656b807791: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_ea5e6cc2e4141dfe: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_c05833b95a3cf397: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_memory_de265df8aadd6273: function() {
            const ret = wasm.memory;
            return ret;
        },
        __wbg___wbindgen_module_a22faa8909381977: function() {
            const ret = wasmModule;
            return ret;
        },
        __wbg___wbindgen_throw_344f42d3211c4765: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_call_a6e5c5dce5018821: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_crypto_48300657fced39f9: function(arg0) {
            const ret = arg0.crypto;
            return ret;
        },
        __wbg_error_b1232c1f1edad086: function(arg0, arg1) {
            console.error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_getRandomValues_263d0aa5464054ee: function() { return handleError(function (arg0, arg1) {
            arg0.getRandomValues(arg1);
        }, arguments); },
        __wbg_getRandomValues_783a29df2108885b: function() { return handleError(function (arg0) {
            globalThis.crypto.getRandomValues(arg0);
        }, arguments); },
        __wbg_instanceof_Window_05ba1ee4f6781663: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Window;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_length_1f0964f4a5e2c6d8: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_log_c47f23f039719f29: function(arg0, arg1) {
            console.log(getStringFromWasm0(arg0, arg1));
        },
        __wbg_msCrypto_8c6d45a75ef1d3da: function(arg0) {
            const ret = arg0.msCrypto;
            return ret;
        },
        __wbg_new_with_length_e6785c33c8e4cce8: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return ret;
        },
        __wbg_node_95beb7570492fd97: function(arg0) {
            const ret = arg0.node;
            return ret;
        },
        __wbg_process_b2fea42461d03994: function(arg0) {
            const ret = arg0.process;
            return ret;
        },
        __wbg_prototypesetcall_4770620bbe4688a0: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_randomFillSync_ca9f178fb14c88cb: function() { return handleError(function (arg0, arg1) {
            arg0.randomFillSync(arg1);
        }, arguments); },
        __wbg_require_7a9419e39d796c95: function() { return handleError(function () {
            const ret = module.require;
            return ret;
        }, arguments); },
        __wbg_startWorkers_8b582d57e92bd2d4: function(arg0, arg1, arg2) {
            const ret = startWorkers(arg0, arg1, wbg_rayon_PoolBuilder.__wrap(arg2));
            return ret;
        },
        __wbg_static_accessor_GLOBAL_4ef717fb391d88b7: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_8d1badc68b5a74f4: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_146583524fe1469b: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_f2829a2234d7819e: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_subarray_3ed232c8a6baee09: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_versions_215a3ab1c9d5745a: function(arg0) {
            const ret = arg0.versions;
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
        memory: memory || new WebAssembly.Memory({initial:887,maximum:65536,shared:true}),
    };
    return {
        __proto__: null,
        "./os_wasm_probe_bg.js": import0,
    };
}

const TxSessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_txsession_free(ptr, 1));
const wbg_rayon_PoolBuilderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wbg_rayon_poolbuilder_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc_command_export();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.buffer !== wasm.memory.buffer) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store_command_export(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc_command_export(idx);
    return value;
}

let cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : undefined);
if (cachedTextDecoder) cachedTextDecoder.decode();

const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().slice(ptr, ptr + len));
}

const cachedTextEncoder = (typeof TextEncoder !== 'undefined' ? new TextEncoder() : undefined);

if (cachedTextEncoder) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module, thread_stack_size) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedUint8ArrayMemory0 = null;
    if (typeof thread_stack_size !== 'undefined' && (typeof thread_stack_size !== 'number' || thread_stack_size === 0 || thread_stack_size % 65536 !== 0)) {
        throw new Error('invalid stack size');
    }

    wasm.__wbindgen_start(thread_stack_size);
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module, memory) {
    if (wasm !== undefined) return wasm;

    let thread_stack_size
    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module, memory, thread_stack_size} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports(memory);
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module, thread_stack_size);
}

async function __wbg_init(module_or_path, memory) {
    if (wasm !== undefined) return wasm;

    let thread_stack_size
    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path, memory, thread_stack_size} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('os_wasm_probe_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports(memory);

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module, thread_stack_size);
}

export { initSync, __wbg_init as default };
