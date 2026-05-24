const { ethers } = require("hardhat");

async function main() {
  const [deployer, police, fire, medical, transport] = await ethers.getSigners();

  const AuthorityManager = await ethers.getContractFactory("AuthorityManager");
  const authorityManager = await AuthorityManager.deploy();
  await authorityManager.waitForDeployment();

  const EventRegistry = await ethers.getContractFactory("EventRegistry");
  const eventRegistry = await EventRegistry.deploy(await authorityManager.getAddress(), 2);
  await eventRegistry.waitForDeployment();

  const ProvenanceTracker = await ethers.getContractFactory("ProvenanceTracker");
  const provenanceTracker = await ProvenanceTracker.deploy();
  await provenanceTracker.waitForDeployment();

  await (await eventRegistry.setProvenanceTracker(await provenanceTracker.getAddress())).wait();
  const registryRole = await provenanceTracker.REGISTRY_ROLE();
  await (await provenanceTracker.grantRole(registryRole, await eventRegistry.getAddress())).wait();

  await (await authorityManager.addAuthority(police.address, "police")).wait();
  await (await authorityManager.addAuthority(fire.address, "fire")).wait();
  await (await authorityManager.addAuthority(medical.address, "medical")).wait();
  await (await authorityManager.addAuthority(transport.address, "transport")).wait();

  console.log("Deployer:", deployer.address);
  console.log("AuthorityManager:", await authorityManager.getAddress());
  console.log("EventRegistry:", await eventRegistry.getAddress());
  console.log("ProvenanceTracker:", await provenanceTracker.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
