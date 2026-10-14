# ChainProv-City Prototype

Ethereum (EVM) implementation of authority-based, multi-agency verification of smart city events with blockchain provenance.

## Contracts

- `AuthorityManager.sol`: roles (reporter, verifier, actor), device registry, authority epochs, and kGov-of-m governance proposals for every membership, device or threshold change. The deployer keeps no privilege after bootstrapping.
- `EventRegistry.sol`: device-signed canonical commitments, replay and freshness guards, k-of-m adjudication (reject when rejections > m - k), review and escalation deadlines with a fail-safe REJECTED (EXPIRED) outcome, break-glass for CRITICAL events, action and closure. Seven-state lifecycle: REPORTED, UNDER_REVIEW, DISPUTED, VERIFIED, REJECTED, ACTIONED, CLOSED.
- `ProvenanceTracker.sol`: append-only, hash-chained transition log writable only by the registry.
- `baseline/`: the original (v1) contracts, kept unchanged for the gas comparison only.

## Install and test

```bash
npm install
npx hardhat test          # 24 tests: functional, adversarial, governance, lifecycle
npx hardhat coverage
```

If `binaries.soliditylang.org` is unreachable, install `solc@0.8.19` and prefix commands with `SOLCJS=1`.

## Reproduce the evaluation

```bash
npx hardhat run scripts/bench-gas.js            # results/gas.json
REPS=5 scripts/run-latency.sh                     # results/latency.jsonl (fresh node per setting, 2 s blocks)
node scripts/bench-offchain.js                    # results/offchain.json
scripts/collect-meta.sh                           # tests, coverage and Slither summary -> results/meta.json
```

Figures: `paper-figures/fig1_state_machine.dot` (Graphviz), `paper-figures/make_fig_architecture.py`, `paper-figures/make_fig_results.py`.

## Deploy locally

```bash
npx hardhat run scripts/deploy.js
```
