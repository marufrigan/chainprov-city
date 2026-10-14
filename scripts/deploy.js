const { ethers } = require("hardhat");
const F = require("../test/fixture");

// Deploys AuthorityManager, ProvenanceTracker and EventRegistry with four agencies
// (police, fire, medical, transport), one edge gateway and two registered cameras.
async function main() {
  const ctx = await F.deploy({ m: 4, k: 2, kGov: 3, gateways: 1, devicesPerGateway: 2 });
  const [police, fire, medical, transport] = ctx.agencies;
  console.log("Deployer (no residual privileges):", ctx.deployer.address);
  console.log("AuthorityManager:", await ctx.am.getAddress());
  console.log("ProvenanceTracker:", await ctx.pt.getAddress());
  console.log("EventRegistry:", await ctx.er.getAddress());
  console.log("Agencies:", { police: police.address, fire: fire.address, medical: medical.address, transport: transport.address });
  console.log("Gateway:", ctx.gateways[0].address);
  console.log("Devices:", ctx.devices.map((d) => d.wallet.address));
  console.log("k =", ctx.k, "kGov =", ctx.kGov);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
