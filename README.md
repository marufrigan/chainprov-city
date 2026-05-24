# ChainProv-City Prototype

Ethereum-based implementation of authority-based multi-agency verification for smart city surveillance events.  
This prototype accompanies the academic chapter **"Springer Book Chapter - ChainProv-City"** and demonstrates how authority-level provenance can reduce deepfake-triggered false emergency escalation.

## Architecture

- `AuthorityManager.sol`: whitelist and role management for city agencies (police, fire, medical, transport).
- `EventRegistry.sol`: event reporting, k-of-m voting, and lifecycle state transitions.
- `ProvenanceTracker.sol`: immutable audit trail of state changes and verifier justifications.

## Installation

```bash
npm install
```

## Run tests

```bash
npx hardhat test
```

Expected result: **7 passing tests**.

## Deploy locally

```bash
npx hardhat run scripts/deploy.js
```

## Paper reference

**Springer Book Chapter - ChainProv-City**  
*ChainProv-City: Authority-Based Blockchain Provenance for Smart City Surveillance*
