#!/usr/bin/env bash
# Collects test count, coverage and Slither summary into results/meta.json.
set -e
cd "$(dirname "$0")/.."
npx hardhat test 2>&1 | tee results/test-log.txt | tail -3
npx hardhat coverage --testfiles test/ChainProvCity.test.js 2>&1 | tee results/coverage.txt | grep -E "All files"
npx hardhat clean >/dev/null; npx hardhat compile >/dev/null
rm -f results/slither.json crytic-export -r
slither . --hardhat-ignore-compile --filter-paths "node_modules|baseline" --json results/slither.json > /dev/null 2>&1 || true
python3 - <<'PY'
import json, re, collections, subprocess
t = open("results/test-log.txt").read()
tests = int(re.search(r"(\d+) passing", t).group(1))
cov = open("results/coverage.txt").read()
row = [l for l in cov.splitlines() if l.strip().startswith("All files")][0]
v = [x.strip() for x in row.split("|")]
d = json.load(open("results/slither.json"))
det = d["results"]["detectors"]
c = collections.Counter(x["impact"] for x in det)
ver = subprocess.run(["slither", "--version"], capture_output=True, text=True).stdout.strip()
nd = len(subprocess.run(["slither", "--list-detectors-json"], capture_output=True, text=True).stdout and json.loads(subprocess.run(["slither", "--list-detectors-json"], capture_output=True, text=True).stdout))
meta = {"tests": tests, "coverage": {"stmt": v[1], "branch": v[2], "func": v[3], "lines": v[4]},
        "slither_version": ver, "slither_detectors": nd, "slither_high": c.get("High", 0), "slither_medium": c.get("Medium", 0),
        "slither_low": c.get("Low", 0), "slither_info": c.get("Informational", 0) + c.get("Optimization", 0),
        "slither_checks": sorted(collections.Counter((x["check"], x["impact"]) for x in det).items())}
json.dump(meta, open("results/meta.json", "w"), indent=1)
print(meta)
PY
