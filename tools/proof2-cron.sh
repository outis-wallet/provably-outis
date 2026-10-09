#!/bin/sh
# Run from cron: does Sepolia accept PROOF2 yet? Runs the Outis spike's `proof2` step, which
# proves a 0.1 STRK own-pool payment with our 0.14.4 prover and submits it. Refusals cost nothing;
# results go to the spike's .state/proof2-checks.jsonl, the run output to .state/proof2-cron.log.
# After the first acceptance the step does nothing more. Starts the prover on :3000 when it is down.
# crontab: 17 */6 * * * /home/broody/development/provably-outis/tools/proof2-cron.sh
SPIKE=${SPIKE:-$HOME/development/outis/wallet/spike/strk20}
PROVER=${PROVER:-$HOME/development/sequencer-0144/target/release/starknet_transaction_prover}
export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$HOME/.local/share/pnpm:/usr/local/bin:/usr/bin:/bin"
export OUTIS_PRIVACY_SDK=${OUTIS_PRIVACY_SDK:-$HOME/development/starknet-privacy/sdk}
LOG=$SPIKE/.state/proof2-cron.log
exec 9>/tmp/proof2-cron.lock
flock -n 9 || exit 0
{
  echo "=== $(date -Is)"
  if ! ss -ltn | grep -q '127.0.0.1:3000 '; then
    echo "starting the prover on :3000"
    nohup "$PROVER" --rpc-url http://127.0.0.1:9545/rpc/v0_10 --chain-id SN_SEPOLIA --ip 127.0.0.1 \
      --port 3000 --max-concurrent-requests 1 --prefetch-state true \
      --cors-allow-origin http://localhost:5173 > "$SPIKE/.state/proof2-prover.log" 2>&1 &
    sleep 20
  fi
  cd "$SPIKE" && timeout 900 ./node_modules/.bin/tsx src/run.ts proof2
  code=$?
  echo "exit $code (0 accepted, 2 refused, other: the check itself failed)"
} >> "$LOG" 2>&1
