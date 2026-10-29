#!/bin/sh
# Does Sepolia's gateway let PROOF2 through? A check that needs no prover, node, account or key:
# it sends the gateway an invoke whose proof facts say PROOF2, with a dummy proof, a junk signature
# and a sender that holds nothing, so it can never be accepted or spend anything. The gateway checks
# the proof version before it verifies the proof: while PROOF2 is barred the answer is
# PROOF_VERSION_NOT_ALLOWED; once it is allowed the dummy proof fails verification instead
# (INVALID_PROOF, what PROOF1 gets today; run with VERSION=PROOF1 to see it).
# A lifted gate is the cue to run proof2-cron.sh, which submits a real PROOF2 payment. Sepolia's
# lifted on 2026-10-29. The probe can't tell whether a given prover's proofs verify: a prover at
# PRIVACY-0.14.4-RC.0 (proving 2b495a36) is refused ("Unknown preprocessed root"), one at
# main-v0.14.4 148de445 (proving e0035ffc) accepted.
# Needs curl, jq and HTTPS to alpha-sepolia.starknet.io and feeder.alpha-sepolia.starknet.io.
# Exits 0 when the version gate lets PROOF2 through, 2 while it refuses it, 1 when the check fails.
set -eu
FEEDER=${FEEDER:-https://feeder.alpha-sepolia.starknet.io/feeder_gateway}
GATEWAY=${GATEWAY:-https://alpha-sepolia.starknet.io/gateway}
case ${VERSION:-PROOF2} in
  PROOF2) version=0x50524f4f4632 ;;
  PROOF1) version=0x50524f4f4631 ;;
  *) echo "VERSION is PROOF1 or PROOF2" >&2; exit 1 ;;
esac
# A virtual OS program Sepolia accepts proofs of (Starknet 0.14.4), and a block it can still prove.
program=${PROGRAM:-0x53f6c9fcfd31d27279ff7d7e422b44623550a732b59fe193354a7316a96daa1}
header() { curl -sf -m 20 "$FEEDER/get_block?blockNumber=$1&headerOnly=true" | jq -r ".$2 // empty" 2>/dev/null; }
latest=$(header latest block_number || true)
[ -n "$latest" ] || { echo "feeder gateway unreachable" >&2; exit 1; }
block=$((latest - 20))
hash=$(header "$block" block_hash || true)
[ -n "$hash" ] || { echo "feeder gateway unreachable" >&2; exit 1; }
tx=$(jq -cn --arg v "$version" --arg p "$program" --arg b "$(printf '0x%x' "$block")" --arg h "$hash" '{
  type: "INVOKE_FUNCTION", version: "0x3",
  sender_address: "0x1234", calldata: [], signature: ["0x1", "0x2"], nonce: "0x0",
  resource_bounds: {
    L1_GAS: {max_amount: "0x0", max_price_per_unit: "0x0"},
    L2_GAS: {max_amount: "0x1000000", max_price_per_unit: "0x174876e800"},
    L1_DATA_GAS: {max_amount: "0x400", max_price_per_unit: "0x174876e800"}},
  tip: "0x0", paymaster_data: [], account_deployment_data: [],
  nonce_data_availability_mode: 0, fee_data_availability_mode: 0,
  proof_facts: [$v, "0x5649525455414c5f534e4f53", $p, "0x5649525455414c5f534e4f5330", $b, $h, "0x0"],
  proof: "AAAAAAAAAAA="}')
answer=$(printf '%s' "$tx" | curl -s -m 30 -H 'content-type: application/json' --data @- "$GATEWAY/add_transaction") || { echo "gateway unreachable" >&2; exit 1; }
code=$(printf '%s' "$answer" | jq -r '.code // empty' 2>/dev/null || true)
echo "$(date -Is) ${VERSION:-PROOF2} block $block: $answer"
case $code in
  StarknetErrorCode.PROOF_VERSION_NOT_ALLOWED) exit 2 ;;
  StarknetErrorCode.INVALID_PROOF) exit 0 ;;
  *) echo "unexpected answer; look at it before reading it either way" >&2; exit 1 ;;
esac
