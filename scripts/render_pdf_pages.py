#!/usr/bin/env python3
"""Render PDF pages to PNGs for visual QA (pypdfium2 based, no poppler needed)."""

from __future__ import annotations

import sys
from pathlib import Path

import pypdfium2 as pdfium


def render(pdf_path: str, out_prefix: str, scale: float = 2.0, pages: list[int] | None = None) -> None:
    pdf = pdfium.PdfDocument(pdf_path)
    n = len(pdf)
    out_dir = Path(out_prefix).parent
    out_dir.mkdir(parents=True, exist_ok=True)
    indices = pages if pages is not None else list(range(n))
    for i in indices:
        if i < 0 or i >= n:
            continue
        page = pdf[i]
        bitmap = page.render(scale=scale)
        image = bitmap.to_pil()
        out = f"{out_prefix}-p{i + 1:02d}.png"
        image.save(out)
        print(f"wrote {out} ({image.size[0]}x{image.size[1]})")
    print(f"total pages: {n}")


if __name__ == "__main__":
    pdf_path = sys.argv[1]
    out_prefix = sys.argv[2]
    scale = float(sys.argv[3]) if len(sys.argv) > 3 else 2.0
    pages = None
    if len(sys.argv) > 4:
        pages = [int(x) - 1 for x in sys.argv[4].split(",")]
    render(pdf_path, out_prefix, scale, pages)
