"""Figure: ChainProv-City three-layer architecture (black and white, IEEE style)."""
import sys
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle, Circle, Ellipse, Polygon, Arc, Wedge

for f in ["regular", "bold", "italic", "bolditalic"]:
    try:
        fm.fontManager.addfont(f"/usr/share/texmf/fonts/opentype/public/tex-gyre/texgyretermes-{f}.otf")
    except Exception:
        pass
plt.rcParams.update({"font.family": "TeX Gyre Termes", "font.size": 7, "mathtext.fontset": "stix"})

OUT = sys.argv[1] if len(sys.argv) > 1 else "fig_architecture.png"
FW, FH = 7.3, 6.2
fig = plt.figure(figsize=(FW, FH))
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, FW)
ax.set_ylim(0, FH)
ax.axis("off")
K = "black"
LW = 0.8


def box(x, y, w, h, fc="white", lw=LW, ls="-", r=0.05, z=2):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle=f"round,pad=0,rounding_size={r}", fc=fc, ec=K, lw=lw, ls=ls, zorder=z))


def txt(x, y, s, size=7, ha="center", va="center", w="normal", st="normal", z=6):
    ax.text(x, y, s, fontsize=size, ha=ha, va=va, weight=w, style=st, zorder=z)


def arrow(p, q, ls="-", lw=0.9, rad=0.0, both=False, z=4, head=True):
    style = (("<|-|>" if both else "-|>") + ",head_length=3.6,head_width=1.9") if head else "-"
    ax.add_patch(
        FancyArrowPatch(p, q, arrowstyle=style, connectionstyle=f"arc3,rad={rad}", lw=lw, ls=ls, color=K, zorder=z, shrinkA=0, shrinkB=0)
    )


def badge(x, y, n):
    ax.add_patch(Circle((x, y), 0.085, fc="black", ec="black", zorder=8))
    ax.text(x, y - 0.003, str(n), color="white", fontsize=6.2, ha="center", va="center", weight="bold", zorder=9)


# ---------------------------------------------------------------- icons
def camera(cx, cy, s=1.0):
    ax.add_patch(Rectangle((cx - 0.17 * s, cy - 0.07 * s), 0.27 * s, 0.14 * s, fc="white", ec=K, lw=0.8, zorder=5))
    ax.add_patch(Polygon([[cx + 0.10 * s, cy - 0.04 * s], [cx + 0.18 * s, cy - 0.08 * s], [cx + 0.18 * s, cy + 0.08 * s], [cx + 0.10 * s, cy + 0.04 * s]], fc="white", ec=K, lw=0.8, zorder=5))
    ax.plot([cx - 0.05 * s, cx - 0.05 * s], [cy + 0.07 * s, cy + 0.15 * s], color=K, lw=0.8, zorder=5)
    ax.plot([cx - 0.12 * s, cx + 0.02 * s], [cy + 0.15 * s, cy + 0.15 * s], color=K, lw=0.8, zorder=5)
    ax.add_patch(Circle((cx - 0.12 * s, cy + 0.0), 0.018 * s, fc=K, zorder=6))


def drone(cx, cy, s=1.0):
    for dx, dy in [(-1, -1), (1, -1), (-1, 1), (1, 1)]:
        ax.plot([cx, cx + dx * 0.11 * s], [cy, cy + dy * 0.07 * s], color=K, lw=0.8, zorder=5)
        ax.add_patch(Ellipse((cx + dx * 0.13 * s, cy + dy * 0.085 * s), 0.11 * s, 0.035 * s, fc="white", ec=K, lw=0.7, zorder=5))
    ax.add_patch(Rectangle((cx - 0.04 * s, cy - 0.03 * s), 0.08 * s, 0.06 * s, fc="0.6", ec=K, lw=0.7, zorder=6))


def sensor(cx, cy, s=1.0):
    ax.add_patch(Circle((cx, cy - 0.03 * s), 0.035 * s, fc=K, zorder=5))
    ax.plot([cx, cx], [cy - 0.03 * s, cy - 0.13 * s], color=K, lw=0.9, zorder=5)
    for r in (0.07, 0.11, 0.15):
        ax.add_patch(Arc((cx, cy - 0.03 * s), 2 * r * s, 2 * r * s, theta1=40, theta2=140, lw=0.7, color=K, zorder=5))


def keyicon(cx, cy, s=1.0):
    ax.add_patch(Circle((cx - 0.05 * s, cy), 0.032 * s, fc="white", ec=K, lw=0.8, zorder=7))
    ax.plot([cx - 0.018 * s, cx + 0.07 * s], [cy, cy], color=K, lw=0.9, zorder=7)
    ax.plot([cx + 0.045 * s, cx + 0.045 * s], [cy, cy - 0.025 * s], color=K, lw=0.9, zorder=7)
    ax.plot([cx + 0.07 * s, cx + 0.07 * s], [cy, cy - 0.025 * s], color=K, lw=0.9, zorder=7)


def lock(cx, cy, s=1.0):
    ax.add_patch(Rectangle((cx - 0.045 * s, cy - 0.05 * s), 0.09 * s, 0.065 * s, fc=K, ec=K, zorder=7))
    ax.add_patch(Arc((cx, cy + 0.015 * s), 0.065 * s, 0.08 * s, theta1=0, theta2=180, lw=1.0, color=K, zorder=7))


def server(cx, cy, s=1.0, n=3):
    for i in range(n):
        y = cy - 0.12 * s + i * 0.08 * s
        ax.add_patch(Rectangle((cx - 0.12 * s, y), 0.24 * s, 0.07 * s, fc="white", ec=K, lw=0.8, zorder=5))
        ax.add_patch(Circle((cx + 0.08 * s, y + 0.035 * s), 0.012 * s, fc=K, zorder=6))
        ax.plot([cx - 0.09 * s, cx + 0.02 * s], [y + 0.035 * s, y + 0.035 * s], color=K, lw=0.5, zorder=6)


def cylinder(cx, cy, w=0.36, h=0.32):
    ax.add_patch(Rectangle((cx - w / 2, cy - h / 2), w, h, fc="0.9", ec="none", zorder=5))
    ax.plot([cx - w / 2, cx - w / 2], [cy - h / 2, cy + h / 2], color=K, lw=0.8, zorder=6)
    ax.plot([cx + w / 2, cx + w / 2], [cy - h / 2, cy + h / 2], color=K, lw=0.8, zorder=6)
    ax.add_patch(Ellipse((cx, cy + h / 2), w, 0.09, fc="white", ec=K, lw=0.8, zorder=6))
    ax.add_patch(Arc((cx, cy - h / 2), w, 0.09, theta1=180, theta2=360, lw=0.8, color=K, zorder=6))
    ax.add_patch(Arc((cx, cy), w, 0.09, theta1=180, theta2=360, lw=0.5, color=K, zorder=6))


def building(cx, cy, s=1.0):
    ax.add_patch(Polygon([[cx - 0.15 * s, cy + 0.04 * s], [cx, cy + 0.12 * s], [cx + 0.15 * s, cy + 0.04 * s]], fc="white", ec=K, lw=0.8, zorder=5))
    for dx in (-0.1, -0.035, 0.035, 0.1):
        ax.add_patch(Rectangle((cx + dx * s - 0.015 * s, cy - 0.09 * s), 0.03 * s, 0.13 * s, fc="white", ec=K, lw=0.6, zorder=5))
    ax.add_patch(Rectangle((cx - 0.16 * s, cy - 0.12 * s), 0.32 * s, 0.03 * s, fc=K, ec=K, zorder=5))


def monitor(cx, cy, s=1.0):
    ax.add_patch(Rectangle((cx - 0.2 * s, cy - 0.08 * s), 0.4 * s, 0.24 * s, fc="white", ec=K, lw=0.9, zorder=5))
    ax.plot([cx, cx], [cy - 0.08 * s, cy - 0.13 * s], color=K, lw=0.9, zorder=5)
    ax.plot([cx - 0.08 * s, cx + 0.08 * s], [cy - 0.13 * s, cy - 0.13 * s], color=K, lw=0.9, zorder=5)
    for i, hh in enumerate([0.06, 0.11, 0.08, 0.15]):
        ax.add_patch(Rectangle((cx - 0.15 * s + i * 0.07 * s, cy - 0.05 * s), 0.04 * s, hh * s, fc="0.5", ec="none", zorder=6))


def clock(cx, cy, r=0.09):
    ax.add_patch(Circle((cx, cy), r, fc="white", ec=K, lw=0.8, zorder=6))
    ax.plot([cx, cx], [cy, cy + r * 0.7], color=K, lw=0.8, zorder=7)
    ax.plot([cx, cx + r * 0.5], [cy, cy], color=K, lw=0.8, zorder=7)


def magnifier(cx, cy, s=1.0):
    ax.add_patch(Circle((cx, cy), 0.06 * s, fc="white", ec=K, lw=0.9, zorder=6))
    ax.plot([cx + 0.04 * s, cx + 0.11 * s], [cy - 0.04 * s, cy - 0.11 * s], color=K, lw=1.4, zorder=6)


def chainlinks(x, y, n=4, w=0.16, h=0.1):
    for i in range(n):
        ax.add_patch(Rectangle((x + i * (w + 0.06), y), w, h, fc="0.85" if i < n - 1 else "white", ec=K, lw=0.7, zorder=6))
        if i:
            ax.plot([x + i * (w + 0.06) - 0.06, x + i * (w + 0.06)], [y + h / 2, y + h / 2], color=K, lw=0.7, zorder=6)


# ---------------------------------------------------------------- lanes
LX1 = 5.55
lanes = {"L3": (4.30, 6.13), "L2": (2.20, 4.12), "L1": (0.12, 2.02)}
labels = {"L3": "Layer 3: Human and\ninstitutional oversight", "L2": "Layer 2: Permissioned\nblockchain and provenance", "L1": "Layer 1: Data acquisition\nand edge processing"}
for k_, (y0, y1) in lanes.items():
    ax.add_patch(Rectangle((0.05, y0), LX1 - 0.05, y1 - y0, fc="0.95" if k_ == "L2" else "white", ec=K, lw=0.9, zorder=0.5))
    ax.add_patch(Rectangle((0.05, y0), 0.32, y1 - y0, fc="0.82", ec=K, lw=0.9, zorder=0.6))
    ax.text(0.21, (y0 + y1) / 2, labels[k_], rotation=90, ha="center", va="center", fontsize=7.2, weight="bold", zorder=1)
RX0, RX1 = 5.68, 7.25
ax.add_patch(Rectangle((RX0, 0.12), RX1 - RX0, 4.0, fc="white", ec=K, lw=0.9, ls=(0, (4, 2)), zorder=0.5))
txt((RX0 + RX1) / 2, 3.95, "Off-chain services", 7.4, w="bold")

# ================================================================ Layer 1
devs = [("CCTV", camera), ("UAV", drone), ("IoT sensor", sensor)]
for i, (name, fn) in enumerate(devs):
    cx = 0.95 + i * 0.78
    box(cx - 0.34, 1.00, 0.68, 0.88, fc="white")
    fn(cx, 1.58, 0.95)
    txt(cx, 1.30, name, 6.8, w="bold")
    keyicon(cx - 0.14, 1.12, 1.0)
    txt(cx + 0.08, 1.12, "sign $C_i$", 5.9)
GX, GY, GW_, GH = 3.30, 0.25, 2.05, 1.63
box(GX, GY, GW_, GH, fc="white", lw=1.0)
server(GX + 0.30, GY + 1.20, 1.0)
txt(GX + 1.15, GY + 1.45, "Edge gateway $G_j$", 7.2, w="bold")
txt(GX + 1.15, GY + 1.24, "(trusted for availability,\nnot for attribution)", 5.9, st="italic")
steps = ["1. verify device signature $\\sigma_{s,i}$", "2. deduplicate and batch $B_t$", "3. $c_i$ = AES-256-GCM$_{k_i}$($d_i$)", "4. store $c_i$; compute CID($c_i$)", "5. reportEvent / reportBatch"]
for j, s_ in enumerate(steps):
    txt(GX + 0.12, GY + 0.88 - j * 0.155, s_, 6.1, ha="left")
lock(GX + 1.85, GY + 0.50, 1.1)
arrow((2.98, 1.45), (GX, 1.45))
badge(3.14, 1.58, 1)
# flow legend
box(0.48, 0.18, 2.72, 0.72, fc="white", lw=0.7)
flows = [
    ("1", "device → gateway: $d_i$, $C_i$, $\\sigma_{s,i}$"),
    ("2", "gateway → store, KMS: $c_i$, $k_i$"),
    ("3", "reportEvent($\\tau_i$) / reportBatch"),
    ("4", "EventReported to agencies"),
    ("5", "fetch $c_i$ by CID; key release"),
    ("6", "submitVote (signed transaction)"),
    ("7", "StateChanged to dashboard, audit"),
    ("8", "actionEvent / breakGlass"),
]
for idx, (n_, t_) in enumerate(flows):
    col, row = idx // 4, idx % 4
    bx, by = 0.60 + col * 1.34, 0.79 - row * 0.155
    ax.add_patch(Circle((bx, by), 0.055, fc="black", zorder=8))
    ax.text(bx, by - 0.003, n_, color="white", fontsize=5.2, ha="center", va="center", weight="bold", zorder=9)
    txt(bx + 0.09, by, t_, 5.6, ha="left")

# ================================================================ Layer 2
ax.add_patch(FancyBboxPatch((0.55, 2.33), 4.88, 1.66, boxstyle="round,pad=0,rounding_size=0.06", fc="white", ec=K, lw=1.0, zorder=1))
txt(2.99, 3.88, "Permissioned EVM ledger (e.g., Hyperledger Besu, QBFT); validators operated by consortium agencies", 6.5, w="bold")
for i in range(5):
    server(0.80 + i * 0.36, 3.55, 0.62, n=2)
txt(1.52, 3.33, "validators, $n \\geq 3f+1$", 5.9, st="italic")
chainlinks(2.55, 3.46, n=6, w=0.2, h=0.11)
txt(3.27, 3.33, "a block every 2 s; 30 M gas", 5.9, st="italic")
cw, ch = 1.48, 0.86
C = {"AM": (0.68, 2.40), "ER": (2.25, 2.40), "PT": (3.82, 2.40)}
for key_, lw_ in (("AM", 1.0), ("ER", 1.3), ("PT", 1.0)):
    box(*C[key_], cw, ch, fc="0.97", lw=lw_)
contents = {
    "AM": ("Authority Manager", ["roles: reporter, verifier, actor", "epochs; device registry", "$k_{gov}$-of-$m$ proposals", "no administrator key"]),
    "ER": ("Event Registry", ["recompute $C_i$; ecrecover $\\sigma_{s,i}$", "replay and freshness guards", "$k$-of-$m$ votes; deadlines", "seven-state lifecycle"]),
    "PT": ("Provenance Tracker", ["append-only transitions", "$head_n$ = keccak256($head_{n-1}$ ‖ …)", "writable only by the registry", "read by auditors"]),
}
for key_, (title, items) in contents.items():
    txt(C[key_][0] + cw / 2, 3.13, title, 7, w="bold")
    for j, s_ in enumerate(items):
        txt(C[key_][0] + 0.07, 2.97 - j * 0.14, "• " + s_, 5.9, ha="left")
arrow((C["ER"][0], 2.62), (C["AM"][0] + cw, 2.62), both=True)
arrow((C["ER"][0] + cw, 2.62), (C["PT"][0], 2.62))
# report arrow from gateway to registry
arrow((GX + 0.55, GY + GH), (C["ER"][0] + 1.05, 2.40))
badge(GX + 0.43, 2.11, 3)
clock(5.18, 2.12, 0.08)
arrow((5.10, 2.17), (C["ER"][0] + cw - 0.15, 2.40), ls=(0, (3, 2)), rad=0.25)
txt(4.62, 2.08, "finalizeTimeout\n(any account)", 5.4, ha="center")

# ================================================================ Layer 3
ag = ["Police", "Fire", "Medical", "Transport"]
for i, a in enumerate(ag):
    x0 = 0.55 + i * 0.86
    box(x0, 4.45, 0.78, 1.42, fc="white")
    building(x0 + 0.39, 5.62, 0.95)
    txt(x0 + 0.39, 5.40, a, 6.8, w="bold")
    txt(x0 + 0.39, 5.05, "fetch, decrypt,\nrecompute $C'_i$,\nreview, vote", 5.7)
    magnifier(x0 + 0.62, 4.63, 0.75)
    keyicon(x0 + 0.17, 4.61, 0.9)
txt(2.22, 6.03, "Agency clients (verifiers); actor role held by police, fire and medical", 6.3, st="italic")
box(4.05, 5.30, 1.38, 0.68)
monitor(4.38, 5.62, 0.72)
txt(4.97, 5.64, "City operations\ndashboard", 6.2, w="bold")
box(4.05, 4.62, 1.38, 0.56)
magnifier(4.30, 4.93, 0.9)
txt(4.97, 4.97, "Auditor /\nregulator", 6.3, w="bold")
txt(4.97, 4.72, "read-only", 5.7, st="italic")
# L2 <-> L3 connectors
arrow((C["ER"][0] + 0.10, 3.99), (0.94, 4.45))
badge(1.62, 4.22, 4)
arrow((1.80, 4.45), (C["ER"][0] + 0.30, 3.99))
arrow((2.66, 4.45), (C["ER"][0] + 0.55, 3.99))
badge(2.50, 4.22, 6)
arrow((3.40, 4.45), (C["ER"][0] + 1.05, 3.99), ls=(0, (1.5, 1.5)))
badge(3.25, 4.22, 8)
arrow((0.68, 4.45), (C["AM"][0] + 0.20, 3.99), ls=(0, (4, 2)))
ax.add_patch(Circle((0.66, 4.22), 0.085, fc="white", ec="black", lw=0.8, zorder=8))
txt(0.66, 4.22, "G", 6.0, w="bold", z=9)
ax.plot([C["PT"][0] + cw, 5.47, 5.47], [3.20, 3.20, 5.62], color=K, lw=0.9, zorder=4)
arrow((5.47, 5.62), (5.43, 5.62))
arrow((5.47, 4.90), (5.43, 4.90), ls=(0, (1.5, 1.5)))
badge(5.47, 4.22, 7)

# ================================================================ Off-chain column
cylinder(6.47, 3.15, w=0.62, h=0.42)
txt(6.47, 2.75, "IPFS / encrypted store", 6.6, w="bold")
txt(6.47, 2.60, "ciphertext $c_i$ only", 5.8, st="italic")
box(5.85, 1.35, 1.25, 0.95)
keyicon(6.18, 2.08, 1.4)
lock(6.75, 2.06, 1.2)
txt(6.47, 1.78, "Custodian KMS", 6.8, w="bold")
txt(6.47, 1.55, "escrows $k_i$; releases to\neligible agencies only", 5.7)
box(5.85, 0.30, 1.25, 0.85)
txt(6.47, 0.92, "C2PA manifest", 6.6, w="bold")
txt(6.47, 0.62, "(optional) hash carried\nin metadata $m_i$", 5.7, st="italic")
arrow((GX + GW_, GY + 1.10), (6.16, 2.98), ls=(0, (4, 2)), rad=-0.15)
badge(5.55, 2.55, 2)
arrow((GX + GW_, GY + 0.62), (5.85, 1.72), ls=(0, (4, 2)))
ax.plot([6.47, 6.47], [3.38, 4.38], color=K, lw=0.9, ls=(0, (4, 2)), zorder=4)
ax.plot([7.05, 7.05], [2.30, 4.38], color=K, lw=0.9, ls=(0, (4, 2)), zorder=4)
ax.plot([7.05, 3.98], [4.38, 4.38], color=K, lw=0.9, ls=(0, (4, 2)), zorder=4)
arrow((3.98, 4.38), (3.91, 4.52), ls=(0, (4, 2)))
badge(6.10, 4.38, 5)
# line legend
lx, ly = 0.55, 2.08
ax.plot([lx, lx + 0.3], [ly, ly], color=K, lw=0.9)
txt(lx + 0.35, ly, "on-chain transaction / event", 5.8, ha="left")
ax.plot([lx + 1.62, lx + 1.92], [ly, ly], color=K, lw=0.9, ls=(0, (4, 2)))
txt(lx + 1.97, ly, "off-chain or governance (G) path", 5.8, ha="left")

fig.savefig(OUT, dpi=int(sys.argv[2]) if len(sys.argv) > 2 else 600)
print("saved", OUT)
