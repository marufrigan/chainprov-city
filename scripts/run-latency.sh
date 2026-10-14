#!/usr/bin/env bash
# Runs every latency cell against a fresh node with a fixed 2 s block period.
set -u
cd "$(dirname "$0")/.."
REPS=${REPS:-5}
HH="node node_modules/hardhat/internal/cli/bootstrap.js"
rm -f results/latency.jsonl
run_cell () {
  BLOCK_PERIOD_MS=2000 $HH node > /dev/null 2>&1 &
  NODE_PID=$!
  sleep 10
  env "$@" REPS=$REPS $HH run scripts/bench-latency.js --network localnode 2>&1 | grep -E "^(load|decision)|Error"
  kill $NODE_PID 2>/dev/null; wait $NODE_PID 2>/dev/null; sleep 3
}
for N in 1 10 50 100 200 400; do run_cell MODE=load N=$N; done
for MK in "4 2" "5 3" "7 5"; do
  set -- $MK
  for N in 1 10 50 100; do run_cell MODE=decision M=$1 K=$2 N=$N; done
done
echo DONE
