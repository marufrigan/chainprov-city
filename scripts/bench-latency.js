// Latency / throughput benchmarks against a node with a fixed block period.
//   terminal 1: BLOCK_PERIOD_MS=2000 npx hardhat node
//   terminal 2: npx hardhat run scripts/bench-latency.js --network localnode
// Inclusion times are taken from a 25 ms block watcher, so they are not
// quantised by client-side receipt polling.
const { ethers } = require("hardhat");
const fs = require("fs");
const os = require("os");
const F = require("../test/fixture");

const REPS = Number(process.env.REPS || 5);
const LOAD_N = (process.env.LOAD_N || "1,10,50,100,200,400").split(",").map(Number);
const DEC_N = (process.env.DEC_N || "1,10,50,100").split(",").map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();

class BlockWatcher {
  constructor(provider) {
    this.p = provider;
    this.seen = new Map(); // block number -> first observation time (ms)
    this.last = -1;
    this.running = false;
    this.listeners = [];
  }
  async start() {
    this.last = await this.p.getBlockNumber();
    this.running = true;
    (async () => {
      while (this.running) {
        const b = await this.p.getBlockNumber();
        if (b > this.last) {
          const t = now();
          for (let n = this.last + 1; n <= b; n++) {
            this.seen.set(n, t);
            for (const fn of this.listeners) fn(n);
          }
          this.last = b;
        }
        await sleep(25);
      }
    })();
  }
  onBlock(fn) {
    this.listeners.push(fn);
  }
  stop() {
    this.running = false;
  }
  async waitFor(pred, timeoutMs = 300000) {
    const t0 = now();
    while (!(await pred())) {
      if (now() - t0 > timeoutMs) throw new Error("timeout");
      await sleep(50);
    }
  }
}

function stats(xs) {
  const a = [...xs].sort((x, y) => x - y);
  const n = a.length;
  const mean = a.reduce((s, x) => s + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const q = (p) => a[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))];
  return { n, mean, sd, median: q(0.5), p95: q(0.95), min: a[0], max: a[n - 1] };
}
// two-sided 95 % t quantiles for small samples
const T95 = { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262 };
const ci95 = (xs) => {
  const s = stats(xs);
  return { mean: s.mean, half: s.n > 1 ? ((T95[s.n - 1] || 1.96) * s.sd) / Math.sqrt(s.n) : 0 };
};

async function sendAll(jobs) {
  // jobs: [{ signer, txReq }] -- explicit nonces per signer, all submitted concurrently
  const nonces = new Map();
  for (const j of jobs) {
    const a = j.signer.address;
    if (!nonces.has(a)) nonces.set(a, await ethers.provider.getTransactionCount(a, "pending"));
  }
  const sent = [];
  await Promise.all(
    jobs.map(async (j) => {
      const nonce = nonces.get(j.signer.address);
      nonces.set(j.signer.address, nonce + 1);
      const t = now();
      const tx = await j.signer.sendTransaction({ ...j.txReq, nonce, gasLimit: j.gasLimit ?? 500000 });
      sent.push({ hash: tx.hash, t, tag: j.tag });
    })
  );
  return sent;
}

async function loadTest(N, rep) {
  const ctx = await F.deploy({ m: 4, k: 2, gateways: 10, devicesPerGateway: Math.ceil(N / 10) + 1 });
  const capturedAt = (await ethers.provider.getBlock("latest")).timestamp;
  const jobs = [];
  for (let i = 0; i < N; i++) {
    const dev = ctx.devices[i];
    const r = await F.makeReport(ctx.er, dev, { capturedAt });
    const txReq = await ctx.er.connect(dev.gateway).reportEvent.populateTransaction(F.strip(r));
    jobs.push({ signer: dev.gateway, txReq, gasLimit: 400000 });
  }
  const w = new BlockWatcher(ethers.provider);
  await w.start();
  const sent = await sendAll(jobs);
  const receipts = [];
  await w.waitFor(async () => {
    receipts.length = 0;
    for (const s of sent) {
      const rc = await ethers.provider.getTransactionReceipt(s.hash);
      if (!rc) return false;
      receipts.push({ ...s, block: rc.blockNumber, status: rc.status, gas: Number(rc.gasUsed) });
    }
    return receipts.every((r) => w.seen.has(r.block));
  });
  w.stop();
  const lat = receipts.map((r) => w.seen.get(r.block) - r.t);
  const t0 = Math.min(...sent.map((s) => s.t));
  const tEnd = Math.max(...receipts.map((r) => w.seen.get(r.block)));
  const blocks = new Set(receipts.map((r) => r.block)).size;
  const failed = receipts.filter((r) => r.status !== 1).length;
  return { N, rep, latencyMs: stats(lat), throughput: N / ((tEnd - t0) / 1000), blocks, failed };
}

async function decisionTest(N, m, k, rep) {
  const ctx = await F.deploy({ m, k, gateways: 10, devicesPerGateway: Math.ceil(N / 10) + 1 });
  const { er } = ctx;
  const capturedAt = (await ethers.provider.getBlock("latest")).timestamp;
  const jobs = [];
  for (let i = 0; i < N; i++) {
    const dev = ctx.devices[i];
    const r = await F.makeReport(er, dev, { capturedAt });
    const txReq = await er.connect(dev.gateway).reportEvent.populateTransaction(F.strip(r));
    jobs.push({ signer: dev.gateway, txReq, gasLimit: 400000, tag: r.commitment });
  }
  const w = new BlockWatcher(ethers.provider);
  const handled = new Set();
  const verifiedAt = new Map(); // commitment -> time
  const idToCommit = new Map();
  const voters = ctx.agencies.slice(0, k); // first k agencies approve as soon as they observe the event
  let busy = Promise.resolve();
  w.onBlock((bn) => {
    busy = busy.then(async () => {
      const reps = await er.queryFilter(er.filters.EventReported(), bn, bn);
      const fresh = reps.filter((l) => !handled.has(Number(l.args.id)));
      for (const l of fresh) {
        handled.add(Number(l.args.id));
        idToCommit.set(Number(l.args.id), l.args.commitment);
      }
      if (fresh.length) {
        const vjobs = [];
        for (const a of voters)
          for (const l of fresh) {
            const txReq = await er.connect(a).submitVote.populateTransaction(l.args.id, true, ethers.id("auto-review"));
            vjobs.push({ signer: a, txReq, gasLimit: 200000 });
          }
        sendAll(vjobs).catch((e) => console.error('vote send', e.message));
      }
      const ver = await er.queryFilter(er.filters.StateChanged(), bn, bn);
      for (const l of ver)
        if (Number(l.args.to) === F.State.VERIFIED) verifiedAt.set(idToCommit.get(Number(l.args.id)), w.seen.get(bn));
    });
  });
  await w.start();
  const sent = await sendAll(jobs);
  await w.waitFor(async () => verifiedAt.size >= N, 600000);
  w.stop();
  const lat = sent.map((s) => verifiedAt.get(s.tag) - s.t);
  return { N, m, k, rep, decisionLatencyMs: stats(lat) };
}

async function main() {
  // One experiment cell per invocation (a fresh node per cell keeps memory bounded):
  //   MODE=load N=100 REPS=5   or   MODE=decision N=50 M=5 K=3 REPS=5
  const mode = process.env.MODE || "load";
  const N = Number(process.env.N || 10);
  const m = Number(process.env.M || 4);
  const k = Number(process.env.K || 2);
  const net = await ethers.provider.getNetwork();
  const b0 = await ethers.provider.getBlock("latest");
  await sleep(4500);
  const b1 = await ethers.provider.getBlock("latest");
  const env = {
    cpu: os.cpus()[0].model,
    cores: os.cpus().length,
    ramGB: +(os.totalmem() / 2 ** 30).toFixed(1),
    os: `${os.type()} ${os.release()}`,
    node: process.version,
    hardhat: require("hardhat/package.json").version,
    ethers: ethers.version,
    chainId: Number(net.chainId),
    blockPeriodS: (b1.timestamp - b0.timestamp) / Math.max(1, b1.number - b0.number),
    blockGasLimit: Number(b1.gasLimit),
  };
  fs.mkdirSync("results", { recursive: true });
  fs.writeFileSync("results/env.json", JSON.stringify(env, null, 2));
  for (let r = 0; r < REPS; r++) {
    const x = mode === "load" ? await loadTest(N, r) : await decisionTest(N, m, k, r);
    x.mode = mode;
    fs.appendFileSync("results/latency.jsonl", JSON.stringify(x) + "\n");
    const L = mode === "load" ? x.latencyMs : x.decisionLatencyMs;
    console.log(mode, m, k, N, r, "median", L.median.toFixed(0), "p95", L.p95.toFixed(0), mode === "load" ? x.throughput.toFixed(1) : "");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
