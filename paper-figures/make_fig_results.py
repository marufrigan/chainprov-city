"""Figure: evaluation results (black and white, four panels)."""
import json, math, statistics, sys
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm

for f in ["regular", "bold", "italic"]:
    try:
        fm.fontManager.addfont(f"/usr/share/texmf/fonts/opentype/public/tex-gyre/texgyretermes-{f}.otf")
    except Exception:
        pass
plt.rcParams.update(
    {
        "font.family": "TeX Gyre Termes",
        "font.size": 8,
        "axes.linewidth": 0.7,
        "xtick.major.width": 0.6,
        "ytick.major.width": 0.6,
        "xtick.direction": "in",
        "ytick.direction": "in",
        "mathtext.fontset": "stix",
    }
)
REPO = sys.argv[1]
OUT = sys.argv[2]
DPI = int(sys.argv[3]) if len(sys.argv) > 3 else 600
T95 = {1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447}


def ci(xs):
    m = statistics.mean(xs)
    return m, (T95[len(xs) - 1] * statistics.stdev(xs) / math.sqrt(len(xs)) if len(xs) > 1 else 0)


gas = json.load(open(f"{REPO}/results/gas.json"))
lat = [json.loads(l) for l in open(f"{REPO}/results/latency.jsonl")]
loads = [x for x in lat if x["mode"] == "load"]
Ns = sorted({x["N"] for x in loads})

fig, axs = plt.subplots(2, 2, figsize=(7.2, 4.9))
(a, b), (c, d) = axs

# (a) latency
med = [ci([x["latencyMs"]["median"] / 1000 for x in loads if x["N"] == N]) for N in Ns]
p95 = [ci([x["latencyMs"]["p95"] / 1000 for x in loads if x["N"] == N]) for N in Ns]
a.errorbar(Ns, [m for m, _ in med], yerr=[h for _, h in med], marker="o", ms=4, color="black", lw=1.0, capsize=2.5, label="median", mfc="white")
a.errorbar(Ns, [m for m, _ in p95], yerr=[h for _, h in p95], marker="s", ms=4, color="black", lw=1.0, ls="--", capsize=2.5, label="95th percentile", mfc="black")
a.axhline(2.0, color="0.4", lw=0.7, ls=":")
a.text(1.05, 2.12, "one block period (2 s)", fontsize=7, color="0.25")
a.set_xscale("log")
a.set_xlabel("Concurrent registrations N")
a.set_ylabel("Inclusion latency (s)")
a.legend(frameon=False, fontsize=7, loc="upper left")
a.set_title("(a) Registration latency", fontsize=8.5, loc="left")

# (b) throughput
tp = [ci([x["throughput"] for x in loads if x["N"] == N]) for N in Ns]
b.errorbar(Ns, [m for m, _ in tp], yerr=[h for _, h in tp], marker="^", ms=4.5, color="black", lw=1.0, capsize=2.5, mfc="white", label="measured")
steady = gas["operations_m4k2"]["reportEvent"]
ceil1 = (30e6 // steady) / 2.0
ceilb = (30e6 // gas["batch"][-1]["gasPerEvent"]) / 2.0
b.axhline(ceil1, color="black", lw=0.8, ls="--")
b.text(1.05, ceil1 + 1.5, f"block-gas ceiling, single reports ({ceil1:.0f}/s)", fontsize=7)
b.axhline(ceilb, color="0.45", lw=0.8, ls=":")
b.text(1.05, ceilb + 1.5, f"ceiling with batches of {gas['batch'][-1]['batchSize']} ({ceilb:.0f}/s)", fontsize=7, color="0.25")
b.set_xscale("log")
b.set_ylim(0, ceilb * 1.18)
b.set_xlabel("Concurrent registrations N")
b.set_ylabel("Throughput (events/s)")
b.set_title("(b) Registration throughput", fontsize=8.5, loc="left")

# (c) batching
bs = [x["batchSize"] for x in gas["batch"]]
gpe = [x["gasPerEvent"] / 1000 for x in gas["batch"]]
bars = c.bar(range(len(bs)), gpe, color="white", edgecolor="black", hatch="///", lw=0.7, width=0.6)
for i, v in enumerate(gpe):
    c.text(i, v + 3, f"{v:.0f}k", ha="center", fontsize=7)
c.set_xticks(range(len(bs)), [str(x) for x in bs])
c.set_ylim(0, max(gpe) * 1.18)
c.set_xlabel("Events per reportBatch transaction")
c.set_ylabel("Gas per event (thousands)")
c.set_title("(c) Batch registration cost", fontsize=8.5, loc="left")

# (d) threshold trade-off
mk = gas["thresholds"]
markers = {3: "o", 4: "s", 5: "D", 7: "^", 9: "v"}
for x in mk:
    d.scatter(x["pDecision_a80"], x["pFalseAccept_q05"], marker=markers[x["m"]], s=26, facecolor="white", edgecolor="black", lw=0.8, zorder=3)
    off = {(4, 3): (5, -9), (9, 7): (5, 2), (7, 5): (5, 2), (3, 2): (5, -8), (4, 2): (-28, 3), (9, 5): (-28, -6), (5, 3): (5, 2), (7, 4): (5, 2)}.get((x["m"], x["k"]), (5, 2))
    d.annotate(f"{x['k']}-of-{x['m']}", (x["pDecision_a80"], x["pFalseAccept_q05"]), textcoords="offset points", xytext=off, fontsize=6.8)
d.set_yscale("log")
d.set_xlabel("Decision probability $P_{dec}$ (agency availability $a$ = 0.8)")
d.set_ylabel("False acceptance $P_{FA}$ ($q$ = 0.05)")
d.set_title("(d) Security versus availability", fontsize=8.5, loc="left")
d.text(0.03, 0.92, "better: towards the lower right", transform=d.transAxes, fontsize=6.8, color="0.2")
d.set_xlim(0.70, 1.0)

for ax_ in axs.flat:
    ax_.grid(True, which="major", lw=0.3, color="0.8")
    ax_.tick_params(labelsize=7.2)
fig.tight_layout(pad=0.4, h_pad=1.0, w_pad=1.2)
fig.savefig(OUT, dpi=DPI)
print("saved", OUT)
