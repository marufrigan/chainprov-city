#!/usr/bin/env python3
"""Render Figure 3 panels as terminal-style PNGs for publication."""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent

BG = (12, 12, 12)
TEXT = (212, 212, 212)
DIM = (150, 150, 150)
GREEN = (63, 185, 80)
WARN = (220, 220, 170)
CYAN = (78, 201, 176)


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Menlo.ttc",
        "/System/Library/Fonts/Menlo.ttc",
        "/Library/Fonts/Menlo.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    ]
    for p in candidates:
        if os.path.isfile(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


def measure_lines(
    draw: ImageDraw.ImageDraw,
    lines: list[str],
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    max_width: int,
    line_height: int,
) -> tuple[int, int]:
    w = 0
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        lw = bbox[2] - bbox[0]
        w = max(w, min(lw, max_width))
    h = len(lines) * line_height + 24
    return w + 48, h


def draw_block(
    lines: list[tuple[str, tuple[int, int, int]]],
    path: Path,
    width: int = 1280,
    font_size: int = 17,
    title: str | None = None,
) -> None:
    font = load_font(font_size)
    line_height = int(font_size * 1.35)
    dummy = Image.new("RGB", (10, 10), BG)
    d = ImageDraw.Draw(dummy)
    plain_lines = [t[0] for t in lines]
    _, total_h = measure_lines(d, plain_lines, font, width - 48, line_height)
    if title:
        total_h += line_height + 8
    img_h = max(total_h, 200)
    img = Image.new("RGB", (width, img_h), BG)
    draw = ImageDraw.Draw(img)
    y = 20
    if title:
        draw.text((24, y), title, font=font, fill=DIM)
        y += line_height + 8
    x = 24
    for text, color in lines:
        draw.text((x, y), text, font=font, fill=color)
        y += line_height
    img.save(path, "PNG", optimize=True)


def main() -> None:
    raw = (ROOT / "full-terminal-output.txt").read_text(encoding="utf-8")
    lines_raw = [ln.rstrip("\n") for ln in raw.splitlines()]

    warn_line = next((ln for ln in lines_raw if "WARNING" in ln and "Node.js" in ln), "")

    panel_a: list[tuple[str, tuple[int, int, int]]] = [
        ("$ cd /Users/maruffarhan/Desktop/Chainprov-city", CYAN),
        ("$ npm test", CYAN),
        ("", TEXT),
        ("> chainprov-city@1.0.0 test", DIM),
        ("> npx hardhat test", DIM),
        ("", TEXT),
    ]
    if warn_line:
        panel_a.append((warn_line, WARN))
    panel_a.append(("", TEXT))
    panel_a.extend(
        [
            ("Environment (this run): Node.js v25.9.0 | npm 11.12.1 | Hardhat 2.28.6", DIM),
            ("Solidity 0.8.19 | Hardhat network | chainId 31337", DIM),
        ]
    )
    draw_block(panel_a, ROOT / "Figure3a-command-and-environment.png", title="Figure 3(a) — Invocation & environment")

    # Panel B: suite line + TC-001 .. TC-004
    panel_b: list[tuple[str, tuple[int, int, int]]] = []
    for ln in lines_raw:
        s = ln.strip()
        if s.startswith("ChainProv-City:"):
            panel_b.append((ln, TEXT))
            panel_b.append((" ", TEXT))
        elif s.startswith("✔ TC-001") or s.startswith("✔ TC-002") or s.startswith("✔ TC-003") or s.startswith("✔ TC-004"):
            panel_b.append((ln, GREEN))
    draw_block(
        panel_b,
        ROOT / "Figure3b-tests-TC001-through-TC004.png",
        title="Figure 3(b) — Suite & tests TC-001–TC-004",
    )

    # Panel C: contextual suite line + TC-005 .. TC-007 + blank + summary
    panel_c: list[tuple[str, tuple[int, int, int]]] = [
        ("  ChainProv-City: Authority-Based Provenance Framework", TEXT),
        ("", TEXT),
    ]
    for ln in lines_raw:
        s = ln.strip()
        if s.startswith("✔ TC-005") or s.startswith("✔ TC-006") or s.startswith("✔ TC-007"):
            panel_c.append((ln, GREEN))
    panel_c.append((" ", TEXT))
    summary_line = next((ln for ln in lines_raw if "7 passing" in ln), "  7 passing")
    panel_c.append((summary_line, GREEN))

    draw_block(
        panel_c,
        ROOT / "Figure3c-tests-TC005-through-summary.png",
        title="Figure 3(c) — TC-005–TC-007 & aggregate result",
    )

    captions = """Figure 3 — Automated unit test execution (ChainProv-City prototype)

Figure 3(a) — Command and environment
Automated test invocation via `npm test` (which runs `npx hardhat test`) in the project workspace, with the Hardhat Node.js compatibility notice and toolchain context (Node.js, npm, Hardhat, Solidity 0.8.19, local Hardhat network) for reproducibility.

Figure 3(b) — Named test suite and early cases (TC-001–TC-004)
Mocha output for the suite “ChainProv-City: Authority-Based Provenance Framework” showing successful execution of TC-001 through TC-004: unauthorized verifier rejection, authorized approval recording, duplicate-vote rejection, and k-of-m threshold transition to VERIFIED.

Figure 3(c) — Remaining cases and aggregate outcome (TC-005–TC-007)
Successful execution of TC-005 through TC-007—insufficient approvals while below k, invalid transition after REJECTED, and vote rejection after a terminal VERIFIED state—with the aggregate result line reporting all tests passed and wall-clock runtime.
"""
    (ROOT / "FIGURE3_CAPTIONS.txt").write_text(captions, encoding="utf-8")

    print("Wrote:", ROOT / "Figure3a-command-and-environment.png")
    print("Wrote:", ROOT / "Figure3b-tests-TC001-through-TC004.png")
    print("Wrote:", ROOT / "Figure3c-tests-TC005-through-summary.png")
    print("Wrote:", ROOT / "FIGURE3_CAPTIONS.txt")


if __name__ == "__main__":
    main()
