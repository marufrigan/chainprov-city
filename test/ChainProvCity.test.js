const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const F = require("./fixture");

const J = (s) => ethers.id(s); // justification / reference hashes

describe("ChainProv-City: Authority-Based Provenance Framework", function () {
  let ctx, er, am, pt, police, fire, medical, transport, gateway, attacker, cam174, cam175;
  const THRESHOLD_K = 2; // 2-of-4 agencies, as in the original prototype

  async function report(opts = {}, from = gateway, device = cam174) {
    const r = await F.makeReport(er, device, opts);
    await (await er.connect(from).reportEvent(F.strip(r))).wait();
    return Number(await er.eventCount());
  }

  beforeEach(async function () {
    ctx = await F.deploy({ m: 4, k: THRESHOLD_K, kGov: 3, gateways: 1, devicesPerGateway: 2 });
    ({ er, am, pt } = ctx);
    [police, fire, medical, transport] = ctx.agencies;
    gateway = ctx.gateways[0];
    attacker = ctx.outsiders[0];
    [cam174, cam175] = ctx.devices;
  });

  // ------------------------------------------------ original test cases (adapted)

  it("TC-001: should revert when unauthorised account attempts verification", async function () {
    const id = await report();
    await expect(er.connect(attacker).submitVote(id, true, J("malicious self-approval"))).to.be.revertedWithCustomError(
      er,
      "Unauthorized"
    );
  });

  it("TC-002: should record vote when authorised authority approves", async function () {
    const id = await report();
    await er.connect(police).submitVote(id, true, J("visual confirmation"));
    const e = await er.getRecord(id);
    expect(e.approvals).to.equal(1);
    expect(e.state).to.equal(F.State.UNDER_REVIEW);
  });

  it("TC-003: should reject duplicate votes from same authority", async function () {
    const id = await report();
    await er.connect(police).submitVote(id, true, J("first"));
    await expect(er.connect(police).submitVote(id, true, J("duplicate"))).to.be.revertedWithCustomError(
      er,
      "AlreadyVoted"
    );
  });

  it("TC-004: should transition to VERIFIED when threshold k is met", async function () {
    const id = await report();
    await er.connect(police).submitVote(id, true, J("police confirms"));
    await expect(er.connect(fire).submitVote(id, true, J("fire confirms")))
      .to.emit(er, "StateChanged")
      .withArgs(id, F.State.UNDER_REVIEW, F.State.VERIFIED, F.Outcome.NONE);
    expect((await er.getRecord(id)).state).to.equal(F.State.VERIFIED);
  });

  it("TC-005: should not reach VERIFIED with fewer than k approvals", async function () {
    const id = await report();
    expect((await er.getRecord(id)).state).to.equal(F.State.REPORTED);
    await er.connect(police).submitVote(id, true, J("single approval"));
    const e = await er.getRecord(id);
    expect(e.approvals).to.equal(1);
    expect(e.state).to.equal(F.State.UNDER_REVIEW);
  });

  it("TC-006: should revert invalid state transitions (REJECTED to VERIFIED)", async function () {
    const id = await report();
    // m = 4, k = 2: approval becomes impossible only after m - k + 1 = 3 rejections
    await er.connect(medical).submitVote(id, false, J("evidence mismatch"));
    await er.connect(transport).submitVote(id, false, J("sensor anomaly"));
    await er.connect(fire).submitVote(id, false, J("no corroboration"));
    expect((await er.getRecord(id)).state).to.equal(F.State.REJECTED);
    await expect(er.connect(police).submitVote(id, true, J("late approval"))).to.be.revertedWithCustomError(
      er,
      "InvalidState"
    );
  });

  it("TC-007: should revert verification attempts after terminal state", async function () {
    const id = await report();
    await er.connect(police).submitVote(id, true, J("a1"));
    await er.connect(fire).submitVote(id, true, J("a2"));
    await er.connect(police).actionEvent(id, J("dispatch"));
    await er.connect(police).closeEvent(id, false, J("report"));
    await expect(er.connect(medical).submitVote(id, true, J("post-final"))).to.be.revertedWithCustomError(
      er,
      "InvalidState"
    );
  });

  // ------------------------------------------------ registration security

  it("TC-024: off-chain and on-chain canonical commitments must agree", async function () {
    const r = await F.makeReport(er, cam174);
    expect(await er.commitmentOf(r.contentDigest, r.capturedAt, r.device, r.metaHash, r.severity)).to.equal(r.commitment);
  });

  it("TC-008: should reject event reports from non-gateway accounts", async function () {
    const r = await F.makeReport(er, cam174);
    await expect(er.connect(attacker).reportEvent(F.strip(r))).to.be.revertedWithCustomError(er, "Unauthorized");
    await expect(er.connect(police).reportEvent(F.strip(r))).to.be.revertedWithCustomError(er, "Unauthorized");
  });

  it("TC-009: should reject forged source attribution (gateway key signs for Camera-174)", async function () {
    const forger = ethers.Wallet.createRandom();
    const r = await F.makeReport(er, cam174, { signWith: forger });
    await expect(er.connect(gateway).reportEvent(F.strip(r))).to.be.revertedWithCustomError(er, "BadSignature");
  });

  it("TC-010: should reject unregistered devices and revoked devices", async function () {
    const rogue = { wallet: ethers.Wallet.createRandom() };
    const r = await F.makeReport(er, rogue);
    await expect(er.connect(gateway).reportEvent(F.strip(r))).to.be.revertedWithCustomError(er, "Unauthorized");
    // revoke Camera-175 through governance (3 of 4)
    await am.connect(police).propose(F.Kind.REVOKE_DEVICE, cam175.wallet.address, ethers.ZeroAddress, 0, 0);
    await am.connect(fire).approve(0);
    await am.connect(medical).approve(0);
    const r2 = await F.makeReport(er, cam175);
    await expect(er.connect(gateway).reportEvent(F.strip(r2))).to.be.revertedWithCustomError(er, "Unauthorized");
  });

  it("TC-011: should reject replayed content and duplicate commitments", async function () {
    const evidence = Buffer.from("same-footage");
    const first = await F.makeReport(er, cam174, { evidence });
    await (await er.connect(gateway).reportEvent(F.strip(first))).wait();
    await expect(er.connect(gateway).reportEvent(F.strip(first))).to.be.revertedWithCustomError(er, "Duplicate");
    const r = await F.makeReport(er, cam174, { evidence, meta: '{"zone":"Z-99"}' });
    await expect(er.connect(gateway).reportEvent(F.strip(r))).to.be.revertedWithCustomError(er, "ReplayedContent");
  });

  it("TC-012: should reject stale or future-dated captures", async function () {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const stale = await F.makeReport(er, cam174, { capturedAt: now - F.MAX_CAPTURE_AGE - 10 });
    await expect(er.connect(gateway).reportEvent(F.strip(stale))).to.be.revertedWithCustomError(
      er,
      "StaleOrFutureCapture"
    );
    const future = await F.makeReport(er, cam174, { capturedAt: now + 3600 });
    await expect(er.connect(gateway).reportEvent(F.strip(future))).to.be.revertedWithCustomError(
      er,
      "StaleOrFutureCapture"
    );
  });

  // ------------------------------------------------ adjudication rules

  it("TC-013: should reject only when k approvals become unreachable (rejections > m - k)", async function () {
    const id = await report();
    await er.connect(medical).submitVote(id, false, J("r1"));
    await er.connect(transport).submitVote(id, false, J("r2"));
    // 2 rejections, 2 agencies left: k = 2 approvals still reachable
    expect((await er.getRecord(id)).state).to.equal(F.State.UNDER_REVIEW);
    await expect(er.connect(fire).submitVote(id, false, J("r3")))
      .to.emit(er, "StateChanged")
      .withArgs(id, F.State.UNDER_REVIEW, F.State.REJECTED, F.Outcome.FALSE_ALARM);
  });

  it("TC-014: should escalate to DISPUTED on timeout and fail safe to REJECTED", async function () {
    const id = await report();
    await er.connect(police).submitVote(id, true, J("a1"));
    await er.connect(medical).submitVote(id, false, J("r1"));
    await expect(er.finalizeTimeout(id)).to.be.revertedWithCustomError(er, "DeadlineNotPassed");
    await time.increase(F.REVIEW_WINDOW + 1);
    await expect(er.connect(fire).submitVote(id, true, J("late"))).to.be.revertedWithCustomError(er, "DeadlinePassed");
    await er.connect(attacker).finalizeTimeout(id); // anyone may trigger
    expect((await er.getRecord(id)).state).to.equal(F.State.DISPUTED);
    await time.increase(F.ESCALATION_WINDOW + 1);
    await er.finalizeTimeout(id);
    const e = await er.getRecord(id);
    expect(e.state).to.equal(F.State.REJECTED);
    expect(e.outcome).to.equal(F.Outcome.EXPIRED);
  });

  it("TC-015: should allow a DISPUTED event to be resolved during escalation", async function () {
    const id = await report();
    await er.connect(police).submitVote(id, true, J("a1"));
    await time.increase(F.REVIEW_WINDOW + 1);
    await er.finalizeTimeout(id);
    await er.connect(fire).submitVote(id, true, J("a2 on escalation"));
    expect((await er.getRecord(id)).state).to.equal(F.State.VERIFIED);
  });

  // ------------------------------------------------ governance

  it("TC-016: should require kGov approvals for membership changes; deployer has no privilege", async function () {
    const newcomer = ctx.outsiders[1];
    await expect(
      am.connect(ctx.deployer).propose(F.Kind.ADD_MEMBER, newcomer.address, ethers.ZeroAddress, F.ROLE_VERIFIER, 0)
    ).to.be.revertedWithCustomError(am, "NotGovernor");
    await am.connect(police).propose(F.Kind.ADD_MEMBER, newcomer.address, ethers.ZeroAddress, F.ROLE_VERIFIER, 0);
    await am.connect(fire).approve(0);
    expect(await am.hasRole(newcomer.address, F.ROLE_VERIFIER)).to.equal(false);
    await expect(am.connect(fire).approve(0)).to.be.revertedWithCustomError(am, "AlreadyApproved");
    await am.connect(medical).approve(0);
    expect(await am.hasRole(newcomer.address, F.ROLE_VERIFIER)).to.equal(true);
    expect(await am.verifierCount()).to.equal(5);
  });

  it("TC-017: should bind eligibility to the event epoch and block revoked authorities", async function () {
    const id = await report(); // epoch 0, m = 4
    const newcomer = ctx.outsiders[1];
    await am.connect(police).propose(F.Kind.ADD_MEMBER, newcomer.address, ethers.ZeroAddress, F.ROLE_VERIFIER, 0);
    await am.connect(fire).approve(0);
    await am.connect(medical).approve(0);
    await expect(er.connect(newcomer).submitVote(id, true, J("x"))).to.be.revertedWithCustomError(er, "Unauthorized");
    await am.connect(police).propose(F.Kind.REVOKE_MEMBER, transport.address, ethers.ZeroAddress, 0, 0);
    await am.connect(fire).approve(1);
    await am.connect(medical).approve(1);
    await expect(er.connect(transport).submitVote(id, true, J("x"))).to.be.revertedWithCustomError(er, "Unauthorized");
    expect((await er.getRecord(id)).m).to.equal(4);
  });

  // ------------------------------------------------ response path

  it("TC-018: should restrict break-glass to CRITICAL events and ACTOR roles without changing state", async function () {
    const normal = await report({ severity: 2 });
    await expect(er.connect(police).breakGlass(normal, J("urgent"))).to.be.revertedWithCustomError(er, "NotCritical");
    const crit = await report({ severity: 3 });
    await expect(er.connect(transport).breakGlass(crit, J("urgent"))).to.be.revertedWithCustomError(
      er,
      "Unauthorized"
    );
    await expect(er.connect(police).breakGlass(crit, J("crowd crush risk")))
      .to.emit(er, "BreakGlass")
      .withArgs(crit, police.address, J("crowd crush risk"));
    const e = await er.getRecord(crit);
    expect(e.state).to.equal(F.State.REPORTED);
    expect(e.provisionalActor).to.equal(police.address);
  });

  it("TC-019: should enforce VERIFIED -> ACTIONED -> CLOSED and actor roles", async function () {
    const id = await report();
    await expect(er.connect(police).actionEvent(id, J("early"))).to.be.revertedWithCustomError(er, "InvalidState");
    await er.connect(police).submitVote(id, true, J("a1"));
    await er.connect(fire).submitVote(id, true, J("a2"));
    await expect(er.connect(transport).actionEvent(id, J("x"))).to.be.revertedWithCustomError(er, "Unauthorized");
    await expect(er.connect(police).closeEvent(id, false, J("x"))).to.be.revertedWithCustomError(er, "InvalidState");
    await er.connect(fire).actionEvent(id, J("dispatch"));
    await er.connect(fire).closeEvent(id, false, J("resolved"));
    const e = await er.getRecord(id);
    expect(e.state).to.equal(F.State.CLOSED);
    expect(e.outcome).to.equal(F.Outcome.RESOLVED);
  });

  // ------------------------------------------------ provenance and invariants

  it("TC-020: should keep a hash-chained, strictly monotonic provenance trail", async function () {
    const id = await report();
    await er.connect(police).submitVote(id, true, J("a1"));
    await er.connect(fire).submitVote(id, true, J("a2"));
    await er.connect(fire).actionEvent(id, J("dispatch"));
    await er.connect(fire).closeEvent(id, false, J("resolved"));
    const logs = await pt.queryFilter(pt.filters.Transition(id));
    let h = ethers.ZeroHash;
    let lastRank = -1;
    const coder = ethers.AbiCoder.defaultAbiCoder();
    for (const l of logs) {
      const a = l.args;
      h = ethers.keccak256(
        coder.encode(
          ["bytes32", "uint256", "uint8", "uint8", "address", "uint64", "bytes32"],
          [h, a.eventId, a.from, a.to, a.actor, a.time, a.dataHash]
        )
      );
      expect(h).to.equal(a.newHead);
      if (a.from !== a.to) {
        expect(Number(a.to)).to.be.greaterThan(Number(a.from));
        expect(Number(a.to)).to.be.greaterThan(lastRank);
        lastRank = Number(a.to);
      }
    }
    expect(await pt.head(id)).to.equal(h);
    expect(await pt.length(id)).to.equal(logs.length);
    await expect(pt.connect(attacker).record(id, 0, 3, attacker.address, ethers.ZeroHash)).to.be.revertedWith(
      "only registry"
    );
  });

  it("TC-021: should finalise exactly once when conflicting decisive votes share a block", async function () {
    const id = await report();
    await er.connect(police).submitVote(id, true, J("a1"));
    await er.connect(medical).submitVote(id, false, J("r1"));
    await er.connect(transport).submitVote(id, false, J("r2"));
    // fire's approval would verify (2 approvals); one more rejection would reject (3 > 2)
    await network.provider.send("evm_setAutomine", [false]);
    const tx1 = await er.connect(fire).submitVote(id, true, J("decisive approve"), { gasLimit: 500000 });
    const tx2 = await er.connect(police).submitVote(id, false, J("double vote"), { gasLimit: 500000 });
    await network.provider.send("evm_mine");
    await network.provider.send("evm_setAutomine", [true]);
    const r1 = await ethers.provider.getTransactionReceipt(tx1.hash);
    const r2 = await ethers.provider.getTransactionReceipt(tx2.hash);
    expect(r1.status).to.equal(1);
    expect(r2.status).to.equal(0);
    expect((await er.getRecord(id)).state).to.equal(F.State.VERIFIED);
  });

  // ------------------------------------------------ case study (Section 7)

  it("TC-022: deepfake riot alert: forged attribution blocked; re-captured deepfake rejected by agencies", async function () {
    // Stage A: compromised gateway submits a deepfake falsely attributed to Camera-174
    const fake = Buffer.from("synthetic-riot-video");
    const forged = await F.makeReport(er, cam174, { evidence: fake, severity: 3, signWith: gateway });
    await expect(er.connect(gateway).reportEvent(F.strip(forged))).to.be.revertedWithCustomError(er, "BadSignature");
    // Stage B: deepfake replayed in front of a genuine camera, so the device signature is valid
    const id = await report({ evidence: Buffer.from("re-captured-synthetic-riot"), severity: 3 });
    await er.connect(police).submitVote(id, false, J("cross-camera mismatch"));
    await er.connect(transport).submitVote(id, false, J("no traffic anomaly"));
    expect((await er.getRecord(id)).state).to.equal(F.State.UNDER_REVIEW);
    await er.connect(medical).submitVote(id, false, J("deepfake detector score"));
    const e = await er.getRecord(id);
    expect(e.state).to.equal(F.State.REJECTED);
    await expect(er.connect(fire).actionEvent(id, J("dispatch"))).to.be.revertedWithCustomError(er, "InvalidState");
  });

  it("TC-023: should apply threshold changes only to events reported after the change", async function () {
    const before = await report();
    await am.connect(police).propose(F.Kind.SET_THRESHOLD, ethers.ZeroAddress, ethers.ZeroAddress, 0, 3);
    await am.connect(fire).approve(0);
    await am.connect(medical).approve(0);
    expect(await am.k()).to.equal(3);
    const after = await report({}, gateway, cam175);
    expect((await er.getRecord(before)).k).to.equal(2);
    expect((await er.getRecord(after)).k).to.equal(3);
    // invalid parameters and unsafe revocations are refused
    await am.connect(police).propose(F.Kind.SET_THRESHOLD, ethers.ZeroAddress, ethers.ZeroAddress, 0, 9);
    await am.connect(fire).approve(1);
    await expect(am.connect(medical).approve(1)).to.be.revertedWithCustomError(am, "InvalidThreshold");
    await am.connect(police).propose(F.Kind.REVOKE_MEMBER, transport.address, ethers.ZeroAddress, 0, 0);
    await am.connect(fire).approve(2);
    await am.connect(medical).approve(2);
    await am.connect(police).propose(F.Kind.REVOKE_MEMBER, medical.address, ethers.ZeroAddress, 0, 0);
    await am.connect(fire).approve(3);
    await expect(am.connect(medical).approve(3)).to.be.revertedWithCustomError(am, "InvalidThreshold");
    await expect(
      am.connect(police).propose(F.Kind.ADD_MEMBER, police.address, ethers.ZeroAddress, F.ROLE_VERIFIER, 0)
    ).to.be.revertedWithCustomError(am, "InvalidProposal");
  });
});
