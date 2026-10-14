// Off-chain evidence pipeline cost (Algorithm 1, device and gateway steps) and a
// centralised signed hash-chained log baseline. Pure Node.js, no blockchain.
//   node scripts/bench-offchain.js
const crypto = require("crypto");
const fs = require("fs");
const REPS = Number(process.env.REPS || 10);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const t = () => performance.now();

const sizes = [1, 10, 50, 100]; // MB
const off = [];
for (const mb of sizes) {
  const data = crypto.randomBytes(mb * 1024 * 1024);
  const sha = [], aes = [], cid = [];
  for (let r = 0; r < REPS + 1; r++) {
    let a = t();
    crypto.createHash("sha256").update(data).digest();
    const tSha = t() - a;
    a = t();
    const key = crypto.randomBytes(32), iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([c.update(data), c.final(), c.getAuthTag()]);
    const tAes = t() - a;
    a = t();
    crypto.createHash("sha256").update(ct).digest(); // multihash digest of the CIDv1 (raw, sha2-256)
    const tCid = t() - a;
    if (r > 0) { sha.push(tSha); aes.push(tAes); cid.push(tCid); } // first run is warm-up
  }
  const row = { label: `${mb} MB`, mb, sha: median(sha), aes: median(aes), cid: median(cid) };
  row.total = row.sha + row.aes + row.cid;
  off.push(row);
  console.log(row);
}

// Centralised baseline: operator appends (commitment, decision) to a hash chain and signs each head.
const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "secp256k1" });
const N = Number(process.env.LOG_N || 20000);
let head = Buffer.alloc(32);
const logFile = "results/central-log.tmp";
const fd = fs.openSync(logFile, "w");
const t0 = t();
for (let i = 0; i < N; i++) {
  const entry = Buffer.concat([crypto.randomBytes(32), Buffer.from([i % 2])]);
  head = crypto.createHash("sha256").update(Buffer.concat([head, entry])).digest();
  const sig = crypto.sign("sha256", head, privateKey);
  fs.writeSync(fd, Buffer.concat([entry, head, sig, Buffer.from("\n")]));
}
fs.fsyncSync(fd);
fs.closeSync(fd);
const dt = t() - t0;
fs.unlinkSync(logFile);
const clog = { N, totalMs: dt, usPerAppend: (dt * 1000) / N, appendsPerS: N / (dt / 1000) };
console.log(clog);
fs.writeFileSync("results/offchain.json", JSON.stringify({ reps: REPS, offchain: off, centralLog: clog }, null, 2));
