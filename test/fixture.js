const { ethers } = require("hardhat");
const crypto = require("crypto");

const ROLE_REPORTER = 1;
const ROLE_VERIFIER = 2;
const ROLE_ACTOR = 4;

const State = { REPORTED: 0, UNDER_REVIEW: 1, DISPUTED: 2, VERIFIED: 3, REJECTED: 4, ACTIONED: 5, CLOSED: 6 };
const Outcome = { NONE: 0, RESOLVED: 1, FALSE_ALARM: 2, EXPIRED: 3 };
const Kind = { ADD_MEMBER: 0, REVOKE_MEMBER: 1, ADD_DEVICE: 2, REVOKE_DEVICE: 3, SET_THRESHOLD: 4, SET_GOV_THRESHOLD: 5 };

const REVIEW_WINDOW = 600; // 10 min
const ESCALATION_WINDOW = 1800; // 30 min
const MAX_CAPTURE_AGE = 300; // 5 min

/**
 * Deploys the three contracts.
 * opts.m        number of verifier agencies
 * opts.k        approval threshold
 * opts.kGov     governance threshold
 * opts.gateways number of edge gateways
 * opts.devicesPerGateway
 * Agencies 0..m-1 hold VERIFIER; all except index 3 (transport) also hold ACTOR (Table 2).
 */
async function deploy(opts = {}) {
  const m = opts.m ?? 4;
  const k = opts.k ?? 2;
  const kGov = opts.kGov ?? Math.floor(m / 2) + 1;
  const nGw = opts.gateways ?? 1;
  const nDev = opts.devicesPerGateway ?? 2;

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const agencies = signers.slice(1, 1 + m);
  const gateways = signers.slice(1 + m, 1 + m + nGw);
  const outsiders = signers.slice(1 + m + nGw);

  const devices = [];
  const deviceGw = [];
  for (let g = 0; g < nGw; g++) {
    for (let d = 0; d < nDev; d++) {
      const w = ethers.Wallet.createRandom();
      devices.push({ wallet: w, gateway: gateways[g] });
      deviceGw.push(gateways[g].address);
    }
  }

  const members = [...agencies.map((a) => a.address), ...gateways.map((g) => g.address)];
  const roles = [
    ...agencies.map((_, i) => (i === 3 ? ROLE_VERIFIER : ROLE_VERIFIER | ROLE_ACTOR)),
    ...gateways.map(() => ROLE_REPORTER),
  ];

  const AM = await ethers.getContractFactory("AuthorityManager");
  const am = await AM.deploy(members, roles, devices.map((d) => d.wallet.address), deviceGw, k, kGov);
  await am.waitForDeployment();

  const PT = await ethers.getContractFactory("ProvenanceTracker");
  const pt = await PT.deploy();
  await pt.waitForDeployment();

  const ER = await ethers.getContractFactory("EventRegistry");
  const er = await ER.deploy(
    await am.getAddress(),
    await pt.getAddress(),
    opts.reviewWindow ?? REVIEW_WINDOW,
    opts.escalationWindow ?? ESCALATION_WINDOW,
    opts.maxCaptureAge ?? MAX_CAPTURE_AGE
  );
  await er.waitForDeployment();
  await (await pt.bind(await er.getAddress())).wait();

  return { am, pt, er, deployer, agencies, gateways, outsiders, devices, m, k, kGov };
}

const DOMAIN_TAG = ethers.id("ChainProv-City/Event/v1");
/** Off-chain computation of the canonical commitment C_i (identical to EventRegistry.commitmentOf). */
function localCommitment(chainId, contentDigest, capturedAt, device, metaHash, severity) {
  const enc = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "uint256", "bytes32", "uint64", "address", "bytes32", "uint8"],
    [DOMAIN_TAG, chainId, contentDigest, capturedAt, device, metaHash, severity]
  );
  return ethers.sha256(enc);
}

let nonce = 0;
/** Builds a signed report as the edge pipeline would (Algorithm 1, steps 1 to 4). */
async function makeReport(er, device, opts = {}) {
  const evidence = opts.evidence ?? Buffer.from(`frame-seq-${Date.now()}-${nonce++}-${Math.random()}`);
  const meta = opts.meta ?? JSON.stringify({ zone: "Z-12", type: "crowd", camera: "Camera-174" });
  const contentDigest = "0x" + crypto.createHash("sha256").update(evidence).digest("hex");
  // Evidence is encrypted before off-chain storage; the CID digest commits to the ciphertext.
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(evidence), c.final(), c.getAuthTag()]);
  const cid = "0x" + crypto.createHash("sha256").update(ct).digest("hex");
  const metaHash = "0x" + crypto.createHash("sha256").update(meta).digest("hex");
  const latest = await ethers.provider.getBlock("latest");
  const capturedAt = opts.capturedAt ?? latest.timestamp;
  const severity = opts.severity ?? 2;
  const commitment = localCommitment(opts.chainId ?? 31337, contentDigest, capturedAt, device.wallet.address, metaHash, severity);
  const signer = opts.signWith ?? device.wallet;
  const signature = await signer.signMessage(ethers.getBytes(commitment));
  return { contentDigest, cid, metaHash, capturedAt, device: device.wallet.address, severity, signature, commitment };
}

function strip(r) {
  const { commitment, ...rest } = r;
  return rest;
}

module.exports = {
  deploy,
  makeReport,
  localCommitment,
  strip,
  State,
  Outcome,
  Kind,
  ROLE_REPORTER,
  ROLE_VERIFIER,
  ROLE_ACTOR,
  REVIEW_WINDOW,
  ESCALATION_WINDOW,
  MAX_CAPTURE_AGE,
};
