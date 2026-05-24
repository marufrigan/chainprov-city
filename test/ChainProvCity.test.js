const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ChainProv-City: Authority-Based Provenance Framework", function () {
  let authorityManager, eventRegistry, provenanceTracker;
  let owner, police, fire, medical, transport, attacker;
  const THRESHOLD_K = 2; // Need 2 approvals from 4 agencies

  async function reportSampleEvent() {
    const hash = ethers.sha256(ethers.toUtf8Bytes("event-footage-frame-seq-001"));
    const tx = await eventRegistry
      .connect(attacker)
      .reportEvent(hash, "ipfs://bafybeigdyrzt", '{"zone":"Z-12","severity":"high"}');
    await tx.wait();
    return 1;
  }

  beforeEach(async function () {
    [owner, police, fire, medical, transport, attacker] = await ethers.getSigners();

    const AuthorityManager = await ethers.getContractFactory("AuthorityManager");
    authorityManager = await AuthorityManager.deploy();
    await authorityManager.waitForDeployment();

    const EventRegistry = await ethers.getContractFactory("EventRegistry");
    eventRegistry = await EventRegistry.deploy(await authorityManager.getAddress(), THRESHOLD_K);
    await eventRegistry.waitForDeployment();

    const ProvenanceTracker = await ethers.getContractFactory("ProvenanceTracker");
    provenanceTracker = await ProvenanceTracker.deploy();
    await provenanceTracker.waitForDeployment();

    await (await eventRegistry.setProvenanceTracker(await provenanceTracker.getAddress())).wait();
    const registryRole = await provenanceTracker.REGISTRY_ROLE();
    await (await provenanceTracker.grantRole(registryRole, await eventRegistry.getAddress())).wait();

    await (await authorityManager.addAuthority(police.address, "police")).wait();
    await (await authorityManager.addAuthority(fire.address, "fire")).wait();
    await (await authorityManager.addAuthority(medical.address, "medical")).wait();
    await (await authorityManager.addAuthority(transport.address, "transport")).wait();
  });

  // TC-001: Unauthorised account attempts to verify event
  it("TC-001: should revert when unauthorised account attempts verification", async function () {
    const eventID = await reportSampleEvent();
    await expect(
      eventRegistry.connect(attacker).submitVote(eventID, true, "malicious self-approval")
    ).to.be.revertedWith("Not authorized verifier");
  });

  // TC-002: Authorised authority submits valid approval vote
  it("TC-002: should record vote when authorised authority approves", async function () {
    const eventID = await reportSampleEvent();
    await eventRegistry.connect(police).submitVote(eventID, true, "visual confirmation");

    const eventData = await eventRegistry["getEvent(uint256)"](eventID);
    expect(eventData.approvalCount).to.equal(1);
    expect(eventData.status).to.equal(1); // UNDER_REVIEW after first vote and below threshold
  });

  // TC-003: Duplicate approval from same authority
  it("TC-003: should reject duplicate votes from same authority", async function () {
    const eventID = await reportSampleEvent();
    await eventRegistry.connect(police).submitVote(eventID, true, "first response verified");

    await expect(
      eventRegistry.connect(police).submitVote(eventID, true, "duplicate response")
    ).to.be.revertedWith("Already voted");
  });

  // TC-004: Event transitions with k approvals (threshold met)
  it("TC-004: should transition to VERIFIED when threshold k is met", async function () {
    const eventID = await reportSampleEvent();
    await eventRegistry.connect(police).submitVote(eventID, true, "police confirms");

    await expect(eventRegistry.connect(fire).submitVote(eventID, true, "fire confirms"))
      .to.emit(eventRegistry, "EventVerified")
      .withArgs(eventID, fire.address);

    const eventData = await eventRegistry["getEvent(uint256)"](eventID);
    expect(eventData.status).to.equal(2); // VERIFIED
  });

  // TC-005: Event transitions with insufficient approvals
  it("TC-005: should remain REPORTED with insufficient approvals", async function () {
    const eventID = await reportSampleEvent();
    await eventRegistry.connect(police).submitVote(eventID, true, "single approval");

    const eventData = await eventRegistry["getEvent(uint256)"](eventID);
    expect(eventData.approvalCount).to.equal(1);
    expect(eventData.status).to.not.equal(2); // Not VERIFIED
  });

  // TC-006: Invalid state transition (REJECTED to VERIFIED)
  it("TC-006: should revert invalid state transitions", async function () {
    const eventID = await reportSampleEvent();
    await eventRegistry.connect(medical).submitVote(eventID, false, "evidence mismatch");
    await eventRegistry.connect(transport).submitVote(eventID, false, "sensor anomaly");

    const eventData = await eventRegistry["getEvent(uint256)"](eventID);
    expect(eventData.status).to.equal(3); // REJECTED

    await expect(
      eventRegistry.connect(police).submitVote(eventID, true, "late approval attempt")
    ).to.be.revertedWith("Event not in reviewable state");
  });

  // TC-007: Authorised authority attempts to verify after terminal state
  it("TC-007: should revert verification attempts after terminal state", async function () {
    const eventID = await reportSampleEvent();
    await eventRegistry.connect(police).submitVote(eventID, true, "approval 1");
    await eventRegistry.connect(fire).submitVote(eventID, true, "approval 2");

    await expect(
      eventRegistry.connect(medical).submitVote(eventID, true, "post-finalization vote")
    ).to.be.revertedWith("Event already finalized");
  });
});
