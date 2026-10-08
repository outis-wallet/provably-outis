// Builds the virtual OS input for one transaction with the wasm TxSession. All network access
// goes through `rpc(method, params)`, so the same code runs against a live node (browser, Node)
// or a recording.

const SIMULATION_FLAGS = ["RETURN_INITIAL_READS", "SKIP_FEE_CHARGE"];
const MAX_ROUNDS = 20;

export async function buildOsInput({ TxSession, rpc, chainId, transaction, log = () => {} }) {
  const header = await rpc("starknet_getBlockWithTxHashes", { block_id: "latest" });
  // Pin every later read to this block, so a new block cannot slip in between.
  const block_id = { block_number: header.block_number };
  const session = new TxSession(chainId, JSON.stringify(header), JSON.stringify(transaction));
  log(`block ${header.block_number}, tx ${session.tx_hash()}`);

  const simulation = await rpc("starknet_simulateTransactions", {
    block_id,
    transactions: [transaction],
    simulation_flags: SIMULATION_FLAGS,
  });
  const initialReads = simulation.initial_reads;
  session.add_reads(JSON.stringify(initialReads));
  log(`prefetched ${initialReads.storage.length} storage, ${initialReads.nonces.length} nonces, ${initialReads.class_hashes.length} class hashes`);

  const addedClasses = new Set();
  const addClass = async (classHash) => {
    if (addedClasses.has(BigInt(classHash))) return;
    addedClasses.add(BigInt(classHash));
    let casm, sierra;
    try {
      [casm, sierra] = await Promise.all([
        rpc("starknet_getCompiledCasm", { class_hash: classHash }),
        rpc("starknet_getClass", { block_id, class_hash: classHash }),
      ]);
    } catch (error) {
      if (error.code === 28) return session.add_undeclared_class(classHash); // CLASS_HASH_NOT_FOUND
      throw error;
    }
    if (!sierra.sierra_program) throw new Error(`class ${classHash} is Cairo 0, not supported`);
    session.add_class(classHash, JSON.stringify(casm), JSON.stringify(sierra.sierra_program.slice(0, 3)));
  };
  await Promise.all(initialReads.class_hashes.map((entry) => addClass(entry.class_hash)));

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const result = JSON.parse(session.execute());
    if (!result.missing) {
      log(`executed in round ${round}; ${result.storage_proof_params.length} storage proof request(s)`);
      const proofs = await Promise.all(result.storage_proof_params.map((params) => rpc("starknet_getStorageProof", params)));
      log("building the virtual OS input from the storage proofs");
      const osInputJson = session.set_storage_proofs(JSON.stringify(proofs));
      return { session, osInputJson, storageProofParams: result.storage_proof_params };
    }
    const { storage, nonces, class_hashes, classes } = result.missing;
    log(`round ${round} missed ${storage.length} storage, ${nonces.length} nonces, ${class_hashes.length} class hashes, ${classes.length} classes`);
    const reads = {
      storage: await Promise.all(storage.map(async ([contract_address, key]) => ({
        contract_address, key, value: await rpc("starknet_getStorageAt", { block_id, contract_address, key }),
      }))),
      nonces: await Promise.all(nonces.map(async (contract_address) => ({
        contract_address, nonce: await rpc("starknet_getNonce", { block_id, contract_address }),
      }))),
      class_hashes: await Promise.all(class_hashes.map(async (contract_address) => ({
        contract_address, class_hash: await rpc("starknet_getClassHashAt", { block_id, contract_address }),
      }))),
    };
    session.add_reads(JSON.stringify(reads));
    await Promise.all([...classes, ...reads.class_hashes.map((entry) => entry.class_hash)].map(addClass));
  }
  throw new Error(`execution still missing reads after ${MAX_ROUNDS} rounds`);
}

/** JSON-RPC over fetch. */
export function liveRpc(url, onCall = () => {}) {
  let id = 0;
  return async (method, params) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    const body = await response.json();
    onCall(method, params, body);
    if (body.error) throw Object.assign(new Error(`${method}: ${body.error.message}`), body.error);
    return body.result;
  };
}
