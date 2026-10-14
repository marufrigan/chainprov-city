// Gas benchmarks (deterministic on any EVM client).
// Usage: npx hardhat run scripts/bench-gas.js
const { ethers, network } = require("hardhat");
const fs = require("fs");
const F = require("../test/fixture");

const J = (s) => ethers.id(s);
const gasOf = async (txp) => Number((await (await txp).wait()).gasUsed);

async function lifecycle(ctx) {
  const { er, agencies, gateways, devices } = ctx;
  const gw = gateways[0];
  const out = {};
  const rep = async (sev = 2) => {
    const r = await F.makeReport(er, devices[0], { severity: sev });
    const g = await gasOf(er.connect(gw).reportEvent(F.strip(r)));
    return { id: Number(await er.eventCount()), g };
  };
  // approve path
  const warm = await rep(); // first registration also initialises eventCount (cold slot)
  out.reportEventFirst = warm.g;
  let { id, g } = await rep();
  out.reportEvent = g; // steady-state registration
  out.voteFirst = await gasOf(er.connect(agencies[0]).submitVote(id, true, J("a")));
  for (let i = 1; i < ctx.k - 1; i++) await er.connect(agencies[i]).submitVote(id, true, J("a"));
  if (ctx.k >= 3) {
    // a mid vote with no transition
    const r2 = await rep();
    await er.connect(agencies[0]).submitVote(r2.id, true, J("a"));
    out.voteIntermediate = await gasOf(er.connect(agencies[1]).submitVote(r2.id, true, J("a")));
  }
  out.voteDecisiveApprove = await gasOf(er.connect(agencies[ctx.k - 1]).submitVote(id, true, J("a")));
  out.actionEvent = await gasOf(er.connect(agencies[0]).actionEvent(id, J("dispatch")));
  out.closeEvent = await gasOf(er.connect(agencies[0]).closeEvent(id, false, J("resolved")));
  // reject path
  ({ id } = await rep());
  for (let i = 0; i < ctx.m - ctx.k; i++) await er.connect(agencies[i]).submitVote(id, false, J("r"));
  out.voteDecisiveReject = await gasOf(er.connect(agencies[ctx.m - ctx.k]).submitVote(id, false, J("r")));
  // timeout path
  ({ id } = await rep());
  await network.provider.send("evm_increaseTime", [F.REVIEW_WINDOW + 1]);
  await network.provider.send("evm_mine");
  out.finalizeTimeoutToDisputed = await gasOf(er.finalizeTimeout(id));
  await network.provider.send("evm_increaseTime", [F.ESCALATION_WINDOW + 1]);
  await network.provider.send("evm_mine");
  out.finalizeTimeoutToRejected = await gasOf(er.finalizeTimeout(id));
  // break glass
  ({ id } = await rep(3));
  out.breakGlass = await gasOf(er.connect(agencies[0]).breakGlass(id, J("urgent")));
  // governance: add a member (propose + approvals until kGov)
  const newcomer = ctx.outsiders[0];
  const pid = Number(await ctx.am.proposalCount());
  out.govPropose = await gasOf(
    ctx.am.connect(agencies[0]).propose(F.Kind.ADD_MEMBER, newcomer.address, ethers.ZeroAddress, F.ROLE_VERIFIER, 0)
  );
  for (let i = 1; i < ctx.kGov - 1; i++) await ctx.am.connect(agencies[i]).approve(pid);
  out.govApproveExecute = await gasOf(ctx.am.connect(agencies[ctx.kGov - 1]).approve(pid));
  return out;
}

async function v1Baseline() {
  const [owner, police, fire, medical, transport, gw] = await ethers.getSigners();
  const AM = await ethers.getContractFactory("V1AuthorityManager");
  const am = await AM.deploy();
  const ER = await ethers.getContractFactory("V1EventRegistry");
  const er = await ER.deploy(await am.getAddress(), 2);
  const PT = await ethers.getContractFactory("V1ProvenanceTracker");
  const pt = await PT.deploy();
  await er.setProvenanceTracker(await pt.getAddress());
  await pt.grantRole(await pt.REGISTRY_ROLE(), await er.getAddress());
  const out = {};
  out.addAuthority = await gasOf(am.addAuthority(police.address, "police"));
  await am.addAuthority(fire.address, "fire");
  await am.addAuthority(medical.address, "medical");
  await am.addAuthority(transport.address, "transport");
  const meta = JSON.stringify({ zone: "Z-12", type: "crowd", camera: "Camera-174" });
  const cid = "bafybeigdyrztktx5b5m2y4sogf2hf5uq3k5knv5c5k2pvx7aw5w3sltgki"; // 59-char CIDv1 string
  out.reportEventFirst = await gasOf(er.connect(gw).reportEvent(ethers.sha256(ethers.toUtf8Bytes("w")), cid, meta));
  out.reportEvent = await gasOf(er.connect(gw).reportEvent(ethers.sha256(ethers.toUtf8Bytes("x")), cid, meta));
  out.voteFirst = await gasOf(er.connect(police).submitVote(2, true, "visual confirmation"));
  out.voteDecisiveApprove = await gasOf(er.connect(fire).submitVote(2, true, "fire confirms"));
  return out;
}

async function batch(sizes) {
  const res = [];
  for (const n of sizes) {
    await network.provider.send("hardhat_reset");
    const ctx = await F.deploy({ m: 4, k: 2, gateways: 1, devicesPerGateway: n });
    const reports = [];
    for (let i = 0; i < n; i++) reports.push(F.strip(await F.makeReport(ctx.er, ctx.devices[i])));
    const g = await gasOf(ctx.er.connect(ctx.gateways[0]).reportBatch(reports, { gasLimit: 16_000_000 }));
    res.push({ batchSize: n, totalGas: g, gasPerEvent: g / n });
  }
  return res;
}

function binomTail(m, k, p) {
  // P[X >= k], X ~ Bin(m, p)
  const C = (n, r) => {
    let c = 1;
    for (let i = 1; i <= r; i++) c = (c * (n - r + i)) / i;
    return c;
  };
  let s = 0;
  for (let x = k; x <= m; x++) s += C(m, x) * p ** x * (1 - p) ** (m - x);
  return s;
}

async function thresholds(configs) {
  const res = [];
  for (const [m, k] of configs) {
    await network.provider.send("hardhat_reset");
    const ctx = await F.deploy({ m, k, gateways: 1, devicesPerGateway: 4 });
    const { er, agencies, gateways, devices } = ctx;
    // warm-up registration so that every measured registration is steady state
    await (await er.connect(gateways[0]).reportEvent(F.strip(await F.makeReport(er, devices[3])))).wait();
    // full approve path
    let r = await F.makeReport(er, devices[0]);
    let gApprove = await gasOf(er.connect(gateways[0]).reportEvent(F.strip(r)));
    let id = Number(await er.eventCount());
    for (let i = 0; i < k; i++) gApprove += await gasOf(er.connect(agencies[i]).submitVote(id, true, J("a")));
    // full reject path
    r = await F.makeReport(er, devices[1]);
    let gReject = await gasOf(er.connect(gateways[0]).reportEvent(F.strip(r)));
    id = Number(await er.eventCount());
    for (let i = 0; i < m - k + 1; i++) gReject += await gasOf(er.connect(agencies[i]).submitVote(id, false, J("r")));
    res.push({
      m,
      k,
      txApprove: 1 + k,
      gasApprove: gApprove,
      txReject: 1 + (m - k + 1),
      gasReject: gReject,
      // analytical governance trade-off (independent agencies)
      pFalseAccept_q05: binomTail(m, k, 0.05),
      pFalseAccept_q10: binomTail(m, k, 0.1),
      pDecision_a90: binomTail(m, k, 0.9),
      pDecision_a80: binomTail(m, k, 0.8),
      collusionTolerance: k - 1,
      crashTolerance: m - k,
    });
  }
  return res;
}

async function main() {
  const results = { generatedAt: new Date().toISOString() };
  await network.provider.send("hardhat_reset");
  let ctx = await F.deploy({ m: 4, k: 2, kGov: 3, gateways: 1, devicesPerGateway: 4 });
  results.operations_m4k2 = await lifecycle(ctx);
  await network.provider.send("hardhat_reset");
  ctx = await F.deploy({ m: 5, k: 3, kGov: 3, gateways: 1, devicesPerGateway: 4 });
  results.operations_m5k3 = await lifecycle(ctx);
  await network.provider.send("hardhat_reset");
  ctx = await F.deploy({ m: 1, k: 1, kGov: 1, gateways: 1, devicesPerGateway: 4 });
  // single authority: report + one vote
  {
    const r0 = await F.makeReport(ctx.er, ctx.devices[0]);
    await gasOf(ctx.er.connect(ctx.gateways[0]).reportEvent(F.strip(r0))); // warm-up (cold eventCount)
    const r = await F.makeReport(ctx.er, ctx.devices[1]);
    const g1 = await gasOf(ctx.er.connect(ctx.gateways[0]).reportEvent(F.strip(r)));
    const g2 = await gasOf(ctx.er.connect(ctx.agencies[0]).submitVote(2, true, J("a")));
    results.singleAuthority = { reportEvent: g1, voteDecisiveApprove: g2, total: g1 + g2 };
  }
  await network.provider.send("hardhat_reset");
  results.v1Original = await v1Baseline();
  results.batch = await batch([1, 5, 10, 25, 50]);
  results.thresholds = await thresholds([
    [3, 2],
    [4, 2],
    [4, 3],
    [5, 3],
    [7, 4],
    [7, 5],
    [9, 5],
    [9, 7],
  ]);
  fs.mkdirSync("results", { recursive: true });
  fs.writeFileSync("results/gas.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
