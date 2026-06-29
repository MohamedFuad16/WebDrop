#!/usr/bin/env python3
"""Generate the WebDrop in-depth guide PDFs (English + Japanese).

This renders a single, designed, bilingual reference that deepens
`docs/webdrop-app-documentation.md` and `docs/webdrop-concepts-revision-guide.md`:
first-principles explainers of every technology, the three-lane architecture
diagram, the UI state machine, the reservation-TDMA schedule, the proximity
scoring tables, the concurrent-cohort capacity model, the multi-device pairing
Q&A, and the UI catalog. The Japanese edition embeds Source Han Sans JP so CJK
renders without tofu. Output paths are stable:
`output/pdf/webdrop-demo-{en,ja}.pdf`.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, Sequence

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont

import webdrop_diagrams as diagrams

APP_VERSION = "1.0.87"

ROOT = Path(__file__).resolve().parents[1]
SCREENSHOT_ROOT = ROOT / "output/screenshots"
INVENTORY_PATHS = {
    "en": SCREENSHOT_ROOT / "ui-elements-en/inventory.json",
    "ja": SCREENSHOT_ROOT / "ui-elements-ja/inventory.json",
}
LEGACY_INVENTORY_PATH = SCREENSHOT_ROOT / "ui-elements/inventory.json"
OUTPUT_DIR = ROOT / "output/pdf"
PROCESSED_SCREENSHOT_DIR = ROOT / "tmp/pdf-assets"
SOURCE_HAN_SANS_JP_NORMAL = ROOT / "assets/fonts/SourceHanSansJP-Normal-static.ttf"

PAGE_W, PAGE_H = A4
MARGIN = 46
CONTENT_W = PAGE_W - (MARGIN * 2)
TOP_Y = PAGE_H - 54
BOTTOM_Y = 54

INK = HexColor("#16181D")
MUTED = HexColor("#5A6673")
FAINT = HexColor("#9298A3")
BLUE = HexColor("#377FF4")
BLUE_SOFT = HexColor("#EAF2FF")
MINT = HexColor("#28A87A")
MINT_SOFT = HexColor("#E7F8F2")
LILAC = HexColor("#8B79E8")
LILAC_SOFT = HexColor("#F0EDFF")
ROSE = HexColor("#E05C74")
ROSE_SOFT = HexColor("#FDEDF0")
AMBER = HexColor("#C97818")
AMBER_SOFT = HexColor("#FFF2DF")
PAPER = HexColor("#F7F8FA")
WHITE = HexColor("#FFFFFF")
LINE = HexColor("#E3E6EB")
CODE_BG = HexColor("#F1F3F6")
DARK = HexColor("#111318")


def find_font(candidates: Iterable[Path]) -> Path | None:
    for path in candidates:
        if path.exists():
            return path
    return None


def register_fonts() -> dict[str, str]:
    fonts = {
        "regular": "Helvetica",
        "bold": "Helvetica-Bold",
        "jp_regular": "Helvetica",
        "jp_bold": "Helvetica-Bold",
    }
    if SOURCE_HAN_SANS_JP_NORMAL.exists():
        pdfmetrics.registerFont(TTFont("SourceHanSansJP-Normal", str(SOURCE_HAN_SANS_JP_NORMAL)))
        fonts["jp_regular"] = "SourceHanSansJP-Normal"
        fonts["jp_bold"] = "SourceHanSansJP-Normal"
        return fonts
    raise RuntimeError(
        "No embeddable Japanese font found at "
        "assets/fonts/SourceHanSansJP-Normal-static.ttf"
    )


def font_names(locale: str, fonts: dict[str, str]) -> tuple[str, str]:
    if locale == "ja":
        return fonts["jp_regular"], fonts["jp_bold"]
    return fonts["regular"], fonts["bold"]


def wrap_text(text: str, font: str, size: float, max_width: float) -> list[str]:
    text = " ".join(text.split()) if " " in text else text.strip()
    if not text:
        return []
    mostly_ascii = sum(ord(ch) < 128 for ch in text) / max(len(text), 1) > 0.7
    if mostly_ascii:
        tokens = text.split(" ")
        lines: list[str] = []
        line = ""
        for token in tokens:
            candidate = token if not line else f"{line} {token}"
            if pdfmetrics.stringWidth(candidate, font, size) <= max_width:
                line = candidate
            else:
                if line:
                    lines.append(line)
                line = token
        if line:
            lines.append(line)
        return lines
    lines = []
    line = ""
    for char in text:
        candidate = f"{line}{char}"
        if not line or pdfmetrics.stringWidth(candidate, font, size) <= max_width:
            line = candidate
        else:
            lines.append(line)
            line = char
    if line:
        lines.append(line)
    return lines


def wrap_mono(text: str, size: float, max_width: float) -> list[str]:
    out: list[str] = []
    for raw in text.split("\n"):
        if pdfmetrics.stringWidth(raw, "Courier", size) <= max_width or not raw:
            out.append(raw)
            continue
        line = ""
        for ch in raw:
            if pdfmetrics.stringWidth(line + ch, "Courier", size) <= max_width or not line:
                line += ch
            else:
                out.append(line)
                line = ch
        out.append(line)
    return out


class Doc:
    def __init__(self, c: canvas.Canvas, locale: str, fonts: dict[str, str]) -> None:
        self.c = c
        self.locale = locale
        self.reg, self.bold = font_names(locale, fonts)
        self.mono = "Courier"
        self.mono_bold = "Courier-Bold"
        self.page_number = 0
        self.started = False
        self.dark = False
        self.y = TOP_Y

    def t(self, en: str, ja: str) -> str:
        return ja if self.locale == "ja" else en

    def begin_page(self, dark: bool = False) -> None:
        if self.started:
            self.c.showPage()
        self.started = True
        self.page_number += 1
        self.dark = dark
        self.c.setFillColor(DARK if dark else PAPER)
        self.c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        self._footer(dark)
        self.y = TOP_Y

    def _footer(self, dark: bool) -> None:
        color = HexColor("#AEB5C0") if dark else FAINT
        line = HexColor("#2A2E37") if dark else LINE
        self.c.setStrokeColor(line)
        self.c.setLineWidth(0.7)
        self.c.line(MARGIN, 38, PAGE_W - MARGIN, 38)
        self.c.setFillColor(color)
        self.c.setFont(self.reg, 8.2)
        self.c.drawString(MARGIN, 25, self.t("WebDrop In-Depth Guide", "WebDrop 詳細ガイド"))
        self.c.drawRightString(
            PAGE_W - MARGIN,
            25,
            self.t(f"Page {self.page_number}", f"ページ {self.page_number}"),
        )

    def finish(self) -> None:
        if self.started:
            self.c.showPage()

    def space(self, h: float) -> None:
        if self.y - h < BOTTOM_Y:
            self.begin_page(self.dark)

    # ----- blocks ----------------------------------------------------------
    def section(self, eyebrow: str, title: str, intro: str | None = None) -> None:
        self.begin_page(False)
        self.c.setFont(self.bold, 9.5)
        self.c.setFillColor(BLUE)
        self.c.drawString(MARGIN, self.y, eyebrow)
        self.y -= 30
        title_size = 22.0
        title_w = pdfmetrics.stringWidth(title, self.bold, title_size)
        if title_w > CONTENT_W:
            title_size = max(13.0, title_size * CONTENT_W / title_w)
        self.c.setFont(self.bold, title_size)
        self.c.setFillColor(INK)
        self.c.drawString(MARGIN, self.y, title)
        self.y -= 6
        if intro:
            self.para(intro, size=10.5, color=MUTED, leading=15.5, gap=12)
        self.y -= 6

    def h2(self, text: str, accent: Color = INK) -> None:
        self.y -= 11
        self.space(22)
        self.y -= 10
        self.c.setFont(self.bold, 13)
        self.c.setFillColor(accent)
        self.c.drawString(MARGIN, self.y, text)
        self.y -= 3

    def para(
        self,
        text: str,
        size: float = 10,
        color: Color = INK,
        leading: float | None = None,
        gap: float = 7,
        x: float | None = None,
        width: float | None = None,
        font: str | None = None,
    ) -> None:
        font = font or self.reg
        leading = leading or size * 1.5
        x = MARGIN if x is None else x
        width = CONTENT_W if width is None else width
        self.y -= gap
        for line in wrap_text(text, font, size, width):
            if self.y - leading < BOTTOM_Y:
                self.begin_page(self.dark)
            self.y -= leading
            self.c.setFont(font, size)
            self.c.setFillColor(color)
            self.c.drawString(x, self.y, line)

    def lead_para(self, lead: str, body: str, size: float = 10, color: Color = INK,
                  leading: float | None = None, gap: float = 7) -> None:
        leading = leading or size * 1.5
        self.y -= gap
        lead_w = pdfmetrics.stringWidth(lead + " ", self.bold, size)
        first_width = CONTENT_W - lead_w
        words = body.split(" ")
        first_line = ""
        rest = body
        # build the first line so it sits next to the bold lead-in
        if self.locale != "ja":
            line = ""
            used = 0
            for i, w in enumerate(words):
                cand = w if not line else f"{line} {w}"
                if pdfmetrics.stringWidth(cand, self.reg, size) <= first_width:
                    line = cand
                    used = i + 1
                else:
                    break
            first_line = line
            rest = " ".join(words[used:])
        else:
            line = ""
            used = 0
            for i, ch in enumerate(body):
                if pdfmetrics.stringWidth(line + ch, self.reg, size) <= first_width:
                    line += ch
                    used = i + 1
                else:
                    break
            first_line = line
            rest = body[used:]
        if self.y - leading < BOTTOM_Y:
            self.begin_page(self.dark)
        self.y -= leading
        self.c.setFont(self.bold, size)
        self.c.setFillColor(color)
        self.c.drawString(MARGIN, self.y, lead)
        self.c.setFont(self.reg, size)
        self.c.drawString(MARGIN + lead_w, self.y, first_line)
        if rest.strip():
            for line in wrap_text(rest, self.reg, size, CONTENT_W):
                if self.y - leading < BOTTOM_Y:
                    self.begin_page(self.dark)
                self.y -= leading
                self.c.setFont(self.reg, size)
                self.c.setFillColor(color)
                self.c.drawString(MARGIN, self.y, line)

    def bullets(self, items: Sequence[str], size: float = 9.8, gap: float = 6,
                color: Color = INK, accent: Color = BLUE) -> None:
        leading = size * 1.45
        self.y -= gap
        for item in items:
            lines = wrap_text(item, self.reg, size, CONTENT_W - 18)
            for i, line in enumerate(lines):
                if self.y - leading < BOTTOM_Y:
                    self.begin_page(self.dark)
                self.y -= leading
                if i == 0:
                    self.c.setFillColor(accent)
                    self.c.circle(MARGIN + 3, self.y + 3.2, 2.0, fill=1, stroke=0)
                self.c.setFont(self.reg, size)
                self.c.setFillColor(color)
                self.c.drawString(MARGIN + 16, self.y, line)
            self.y -= 2

    def numbered(self, items: Sequence[str], size: float = 10, gap: float = 6) -> None:
        leading = size * 1.5
        self.y -= gap
        for idx, item in enumerate(items, 1):
            lines = wrap_text(item, self.reg, size, CONTENT_W - 26)
            for i, line in enumerate(lines):
                if self.y - leading < BOTTOM_Y:
                    self.begin_page(self.dark)
                self.y -= leading
                if i == 0:
                    self.c.setFillColor(BLUE)
                    self.c.setFont(self.bold, size)
                    self.c.drawString(MARGIN, self.y, f"{idx}.")
                self.c.setFont(self.reg, size)
                self.c.setFillColor(INK)
                self.c.drawString(MARGIN + 22, self.y, line)
            self.y -= 4

    def code(self, text: str, size: float = 8.6) -> None:
        leading = size * 1.42
        pad = 9
        lines = wrap_mono(text, size, CONTENT_W - 2 * pad)
        block_h = len(lines) * leading + 2 * pad
        self.y -= 8
        self.space(block_h)
        top = self.y
        self.c.setFillColor(CODE_BG)
        self.c.roundRect(MARGIN, top - block_h, CONTENT_W, block_h, 7, fill=1, stroke=0)
        yy = top - pad - size
        self.c.setFont(self.mono, size)
        for line in lines:
            self.c.setFillColor(HexColor("#2B2F36"))
            self.c.drawString(MARGIN + pad, yy, line)
            yy -= leading
        self.y = top - block_h

    def callout(self, title: str, body: str, kind: str = "info") -> None:
        palette = {
            "info": (BLUE_SOFT, BLUE),
            "good": (MINT_SOFT, MINT),
            "warn": (AMBER_SOFT, AMBER),
            "note": (LILAC_SOFT, LILAC),
            "alert": (ROSE_SOFT, ROSE),
        }
        soft, accent = palette[kind]
        size = 9.6
        leading = size * 1.45
        pad = 11
        body_lines = wrap_text(body, self.reg, size, CONTENT_W - 2 * pad - 8)
        title_h = 15 if title else 0
        block_h = pad * 2 + title_h + len(body_lines) * leading
        self.y -= 9
        self.space(block_h)
        top = self.y
        self.c.setFillColor(soft)
        self.c.roundRect(MARGIN, top - block_h, CONTENT_W, block_h, 9, fill=1, stroke=0)
        self.c.setFillColor(accent)
        self.c.roundRect(MARGIN + 9, top - block_h + 11, 4.5, block_h - 22, 2.2, fill=1, stroke=0)
        tx = MARGIN + pad + 12
        yy = top - pad
        if title:
            yy -= size + 2
            self.c.setFont(self.bold, size + 0.6)
            self.c.setFillColor(accent)
            self.c.drawString(tx, yy, title)
            yy -= leading - 2
        else:
            yy -= size
        self.c.setFont(self.reg, size)
        self.c.setFillColor(INK)
        for line in body_lines:
            self.c.drawString(tx, yy, line)
            yy -= leading
        self.y = top - block_h

    def cards(self, items: Sequence[tuple[str, str]], cols: int = 2,
              body_size: float = 9.0) -> None:
        gap = 12
        card_w = (CONTENT_W - gap * (cols - 1)) / cols
        accents = [BLUE, MINT, LILAC, ROSE, AMBER]
        i = 0
        title_size = 11
        title_lead = title_size * 1.2
        body_lead = body_size * 1.4
        pad = 13
        while i < len(items):
            row = items[i:i + cols]
            heights = []
            wrapped = []
            for title, body in row:
                tl = wrap_text(title, self.bold, title_size, card_w - 2 * pad)
                bl = wrap_text(body, self.reg, body_size, card_w - 2 * pad)
                h = pad * 2 + 14 + len(tl) * title_lead + 6 + len(bl) * body_lead
                heights.append(h)
                wrapped.append((tl, bl))
            row_h = max(heights)
            self.y -= 12
            self.space(row_h)
            top = self.y
            for j, (tl, bl) in enumerate(wrapped):
                x = MARGIN + j * (card_w + gap)
                accent = accents[(i + j) % len(accents)]
                self.c.setFillColor(WHITE)
                self.c.setStrokeColor(LINE)
                self.c.setLineWidth(0.9)
                self.c.roundRect(x, top - row_h, card_w, row_h, 12, fill=1, stroke=1)
                self.c.setFillColor(accent)
                self.c.circle(x + pad + 4, top - pad - 6, 4.2, fill=1, stroke=0)
                yy = top - pad - 14
                self.c.setFont(self.bold, title_size)
                self.c.setFillColor(INK)
                for line in tl:
                    self.c.drawString(x + pad + 16, yy, line)
                    yy -= title_lead
                yy -= 6
                self.c.setFont(self.reg, body_size)
                self.c.setFillColor(MUTED)
                for line in bl:
                    self.c.drawString(x + pad, yy, line)
                    yy -= body_lead
            self.y = top - row_h
            i += cols

    def kpis(self, items: Sequence[tuple[str, str]]) -> None:
        n = len(items)
        gap = 10
        tile_w = (CONTENT_W - gap * (n - 1)) / n
        tile_h = 62
        accents = [BLUE, MINT, LILAC, ROSE, AMBER]
        self.y -= 12
        self.space(tile_h)
        top = self.y
        for i, (big, label) in enumerate(items):
            x = MARGIN + i * (tile_w + gap)
            accent = accents[i % len(accents)]
            self.c.setFillColor(WHITE)
            self.c.setStrokeColor(LINE)
            self.c.setLineWidth(0.9)
            self.c.roundRect(x, top - tile_h, tile_w, tile_h, 10, fill=1, stroke=1)
            self.c.setFillColor(accent)
            self.c.roundRect(x, top - tile_h, tile_w, 4, 2, fill=1, stroke=0)
            big_size = 19 if pdfmetrics.stringWidth(big, self.bold, 19) <= tile_w - 14 else 14
            self.c.setFont(self.bold, big_size)
            self.c.setFillColor(INK)
            self.c.drawCentredString(x + tile_w / 2, top - 30, big)
            self.c.setFont(self.reg, 7.6)
            self.c.setFillColor(MUTED)
            for k, line in enumerate(wrap_text(label, self.reg, 7.6, tile_w - 8)[:2]):
                self.c.drawCentredString(x + tile_w / 2, top - 42 - k * 9, line)
        self.y = top - tile_h

    def table(self, headers: Sequence[str], rows: Sequence[Sequence[str]],
              widths: Sequence[float], aligns: Sequence[str] | None = None,
              size: float = 8.6) -> None:
        aligns = aligns or ["left"] * len(headers)
        leading = size * 1.35
        pad = 6
        col_x = [MARGIN]
        for w in widths:
            col_x.append(col_x[-1] + w * CONTENT_W)

        def draw_row(cells, header=False, shade=False):
            font = self.bold if header else self.reg
            cell_lines = [
                wrap_text(str(c), font, size, widths[k] * CONTENT_W - 2 * pad)
                for k, c in enumerate(cells)
            ]
            row_h = max(1, max(len(cl) for cl in cell_lines)) * leading + pad
            if self.y - row_h < BOTTOM_Y:
                self.begin_page(self.dark)
                draw_row(headers, header=True, shade=True)
            top = self.y
            if header:
                self.c.setFillColor(BLUE_SOFT)
                self.c.rect(MARGIN, top - row_h, CONTENT_W, row_h, fill=1, stroke=0)
            elif shade:
                self.c.setFillColor(PAPER)
                self.c.rect(MARGIN, top - row_h, CONTENT_W, row_h, fill=1, stroke=0)
            self.c.setStrokeColor(LINE)
            self.c.setLineWidth(0.6)
            self.c.line(MARGIN, top - row_h, MARGIN + CONTENT_W, top - row_h)
            for k, lines in enumerate(cell_lines):
                self.c.setFont(font, size)
                self.c.setFillColor(BLUE if header else INK)
                yy = top - pad - size + 1
                for line in lines:
                    if aligns[k] == "right":
                        self.c.drawRightString(col_x[k + 1] - pad, yy, line)
                    elif aligns[k] == "center":
                        self.c.drawCentredString((col_x[k] + col_x[k + 1]) / 2, yy, line)
                    else:
                        self.c.drawString(col_x[k] + pad, yy, line)
                    yy -= leading
            self.y = top - row_h

        self.y -= 8
        self.space(leading * 2 + pad)
        draw_row(headers, header=True, shade=True)
        for r, row in enumerate(rows):
            draw_row(row, shade=(r % 2 == 1))

    def diagram(self, path: Path, caption: str | None = None, max_h: float = 300,
                width_frac: float = 1.0) -> None:
        reader = ImageReader(str(path))
        iw, ih = reader.getSize()
        max_w = CONTENT_W * width_frac
        scale = min(max_w / iw, max_h / ih)
        w, h = iw * scale, ih * scale
        cap_h = 14 if caption else 0
        self.y -= 12
        self.space(h + cap_h + 6)
        top = self.y
        x = MARGIN + (CONTENT_W - w) / 2
        self.c.drawImage(str(path), x, top - h, w, h, preserveAspectRatio=True, mask="auto")
        self.y = top - h
        if caption:
            self.y -= 13
            self.c.setFont(self.reg, 8.2)
            self.c.setFillColor(FAINT)
            self.c.drawCentredString(PAGE_W / 2, self.y, caption)

    def divider(self) -> None:
        self.y -= 10
        self.space(2)
        self.c.setStrokeColor(LINE)
        self.c.setLineWidth(0.7)
        self.c.line(MARGIN, self.y, PAGE_W - MARGIN, self.y)


# --------------------------------------------------------------------------- #
# Cover + closing
# --------------------------------------------------------------------------- #
def cover(doc: Doc) -> None:
    c = doc.c
    doc.begin_page(dark=True)
    c.setFillColor(HexColor("#1B2330"))
    c.circle(PAGE_W - 60, PAGE_H - 88, 150, fill=1, stroke=0)
    c.setStrokeColor(HexColor("#34445E"))
    c.setLineWidth(9)
    for radius in (56, 90, 124):
        c.circle(PAGE_W - 60, PAGE_H - 88, radius, fill=0, stroke=1)

    c.setFillColor(MINT)
    c.circle(MARGIN + 7, PAGE_H - 71, 7, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont(doc.bold, 12)
    c.drawString(MARGIN + 22, PAGE_H - 75, "WebDrop")

    c.setFillColor(HexColor("#8DA0B9"))
    c.setFont(doc.bold, 9)
    c.drawString(MARGIN, PAGE_H - 210, doc.t(
        "BROWSER-NATIVE NEARBY FILE TRANSFER",
        "ブラウザネイティブの近距離ファイル転送",
    ))

    c.setFillColor(WHITE)
    c.setFont(doc.bold, 44)
    c.drawString(MARGIN, PAGE_H - 276, "WebDrop")
    c.setFont(doc.bold, 27)
    c.drawString(MARGIN, PAGE_H - 314, doc.t("In-Depth Guide", "詳細ガイド"))

    c.setFillColor(BLUE)
    c.roundRect(MARGIN, PAGE_H - 362, 104, 28, 14, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont(doc.bold, 9)
    c.drawCentredString(MARGIN + 52, PAGE_H - 352, f"VERSION {APP_VERSION}")

    summary = doc.t(
        "A first-principles tour of how WebDrop works end to end: the three-lane "
        "architecture, WebSocket/WebRTC, NAT/STUN/TURN/ICE, the encrypted data "
        "channel and receive ladder, the ultrasonic + motion proximity ceremony, "
        "reservation-TDMA scheduling, the proximity scoring model, the concurrent "
        "cohort capacity model, the security model, and the interface catalog.",
        "WebDrop の仕組みを基礎から通しで解説します。3レーン構成、WebSocket/WebRTC、"
        "NAT/STUN/TURN/ICE、暗号化データチャネルと受信ラダー、超音波と動きによる近接"
        "セレモニー、予約型TDMAスケジューリング、近接スコアモデル、並行コホートの容量"
        "モデル、セキュリティモデル、そして画面カタログまでを収録しています。",
    )
    c.setFillColor(HexColor("#1C2028"))
    c.setStrokeColor(HexColor("#303642"))
    c.setLineWidth(1)
    c.roundRect(MARGIN, 150, CONTENT_W, 210, 18, fill=1, stroke=1)
    yy = 332
    for line in wrap_text(summary, doc.reg, 12.5, CONTENT_W - 48):
        c.setFillColor(HexColor("#CAD2DE"))
        c.setFont(doc.reg, 12.5)
        c.drawString(MARGIN + 24, yy, line)
        yy -= 21
    c.setFillColor(HexColor("#768396"))
    c.setFont(doc.reg, 10)
    c.drawString(MARGIN + 24, 170, doc.t("English edition", "日本語版"))


def roadmap(doc: Doc) -> None:
    c = doc.c
    doc.begin_page(dark=True)
    c.setFillColor(BLUE)
    c.setFont(doc.bold, 10)
    c.drawString(MARGIN, PAGE_H - 60, doc.t("WHAT'S NEXT", "今後の予定"))
    c.setFillColor(WHITE)
    c.setFont(doc.bold, 30)
    c.drawString(MARGIN, PAGE_H - 100, doc.t("Production activation", "本番化に向けて"))

    statement = doc.t(
        "The static client and the signaling backend are built and hardened. The "
        "remaining work is operational: calibrate the proximity ceremony on real "
        "devices, prove direct and relay transfers at scale, and grow capacity "
        "toward the 10,000-user target.",
        "静的クライアントとシグナリングバックエンドは実装・堅牢化済みです。残るのは"
        "運用面の作業です。実機で近接セレモニーを較正し、直接接続とリレー転送を規模"
        "ありで実証し、10,000ユーザー目標に向けて容量を拡張します。",
    )
    yy = PAGE_H - 142
    for line in wrap_text(statement, doc.bold, 14, CONTENT_W):
        c.setFillColor(HexColor("#DCE5F2"))
        c.setFont(doc.bold, 14)
        c.drawString(MARGIN, yy, line)
        yy -= 22

    cards_data = [
        doc.t("Device calibration", "実機での較正"),
        doc.t(
            "Measure ultrasonic detection, bump, and tilt on real iOS/Android "
            "phones; tune band, gain, slot length, and thresholds. Acoustic "
            "reliability is physical-device dependent.",
            "実機の iOS/Android で超音波検出・バンプ・傾きを測定し、帯域・ゲイン・"
            "スロット長・しきい値を調整します。音響の信頼性は端末依存です。",
        ),
        doc.t("Transfer proof", "転送の実証"),
        doc.t(
            "Prove direct and TURN-relayed WebRTC transfers between two browsers, "
            "including large receives, cancel/retry, and storage exhaustion.",
            "2つのブラウザ間で直接および TURN リレーの WebRTC 転送を実証します"
            "(大容量受信・キャンセル/再試行・保存容量不足を含む)。",
        ),
        doc.t("Scale to 10,000", "10,000へのスケール"),
        doc.t(
            "Add shared presence/state (Redis), sticky multi-node WebSocket "
            "balancing, staged load testing, and monitoring before raising the "
            "global participant cap.",
            "共有在席/状態(Redis)、スティッキーなマルチノード WebSocket 分散、段階的"
            "負荷試験、監視を整えてから全体参加上限を引き上げます。",
        ),
    ]
    accents = [BLUE, MINT, LILAC]
    card_y = PAGE_H - 320
    for i in range(3):
        title = cards_data[i * 2]
        body = cards_data[i * 2 + 1]
        y = card_y - i * 150
        c.setFillColor(HexColor("#1C2028"))
        c.setStrokeColor(HexColor("#303642"))
        c.setLineWidth(1)
        c.roundRect(MARGIN, y - 122, CONTENT_W, 130, 14, fill=1, stroke=1)
        c.setFillColor(accents[i])
        c.circle(MARGIN + 27, y - 22, 8, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont(doc.bold, 13)
        c.drawString(MARGIN + 48, y - 27, title)
        yy = y - 52
        for line in wrap_text(body, doc.reg, 9.6, CONTENT_W - 70):
            c.setFillColor(HexColor("#B8C0CC"))
            c.setFont(doc.reg, 9.6)
            c.drawString(MARGIN + 48, yy, line)
            yy -= 14


# --------------------------------------------------------------------------- #
# UI catalog (screenshots) appendix
# --------------------------------------------------------------------------- #
JP_ITEMS = {
    "app-light": ("ライトモードのホーム画面", "タイトル、端末名、4本の軌道、緩やかに表情が変わる自分のアイコン、静止した近隣候補を表示するメイン画面です。"),
    "topbar-brand": ("WebDropステータス", "転送操作を早く見せすぎず、WebDrop名と近隣検索中または接続中の状態を表示します。"),
    "settings-icon": ("設定アイコン", "プロフィール、リング色、言語、アプリ情報、バージョンを設定するシートを開きます。"),
    "theme-icon": ("テーマ切替", "メイン画面からライトモードとダークモードを切り替えます。"),
    "topbar-actions": ("ヘッダー操作", "設定とテーマ切替をヘッダー右上にまとめています。"),
    "orbit-empty": ("候補なしの軌道", "近くの端末を表示する前の、4本の軌道パターンです。"),
    "orbit-with-peers": ("候補を表示した軌道", "候補を別々のリングに配置します。プロフィールは静止させ、軌道移動中も落ち着いて見えるようにします。"),
    "connect-sheet": ("接続シート", "相手を選ぶと下部シートが開き、右スワイプで接続を確定します。"),
    "connect-friend-strip": ("候補アイコン列", "軌道と同じプロフィール表現を使い、円形の縁が見える小さな重なりで候補を並べます。"),
    "orbit-connected": ("接続中のベン図表示", "自分と相手を同じ大きさで重ねた静止プロフィールとして表示し、リングのアニメーションで接続状態を示します。"),
    "topbar-brand-connected": ("接続中ステータス", "接続完了後は、接続している相手の名前をステータス行に表示します。"),
    "dock-actions": ("接続後のドック", "接続確認後にだけ、送信、受信、チャット、切断を表示します。"),
    "dock-send-icon": ("送信アイコン", "ファイル送信シートを開きます。"),
    "dock-receive-icon": ("受信アイコン", "受信ファイルを開き、利用可能なファイルがある場合はバッジを表示します。"),
    "dock-chat-icon": ("チャットアイコン", "接続相手とのチャットシートを開きます。"),
    "dock-disconnect-icon": ("切断アイコン", "短い解除アニメーションの後で現在の接続を終了します。"),
    "send-sheet-empty": ("ファイル選択前の送信シート", "最初にファイルを選択します。ファイルが選ばれるまで送信スワイプは無効です。"),
    "send-sheet-selected": ("ファイル選択後の送信シート", "選択したファイルを一覧に表示し、アイコンと文字が重ならない上スワイプ操作で送信します。"),
    "receive-sheet": ("受信シート", "受信したファイルを開く操作とともに表示し、ドックのバッジへ件数を反映します。"),
    "chat-sheet": ("チャットシート", "ファイル操作とは別の専用シートで短いメッセージを送ります。"),
    "settings-sheet": ("設定シート", "プロフィール、リング、端末名、言語、アプリ情報をまとめています。"),
    "settings-profile-icons": ("プロフィールアイコン選択", "写真をアップロードする代わりに、用意されたキャラクターを横スワイプして選びます。"),
    "settings-profile-ring": ("プロフィールリング選択", "標準の白に加え、青、緑、紫、ローズのリング色を選択できます。"),
    "settings-device-name": ("端末名入力", "最後の1文字まで消しても勝手に初期値へ戻らず、自由に編集できます。"),
    "settings-language": ("言語選択", "アプリ内の全ラベルを英語と日本語で切り替えます。"),
    "settings-app-info-link": ("アプリ情報リンク", "デザイン、技術構成、軌道アニメーションの詳細を別シートへ移動します。"),
    "settings-app-version": ("アプリバージョン", f"設定画面の下部に現在のバージョン{APP_VERSION}を表示します。"),
    "app-information-sheet": ("アプリ情報シート", "設定画面を整理したまま、プロトタイプの説明と軌道アニメーション設定を表示します。"),
    "app-dark": ("ダークモードのホーム画面", "同じ近隣端末UIを落ち着いたダークテーマで表示します。"),
}

TRIMMED_CONTROL_SCREENSHOTS = {"settings-icon", "theme-icon"}
DOCK_ICON_PRESENTATIONS = {
    "dock-send-icon", "dock-receive-icon", "dock-chat-icon", "dock-disconnect-icon",
}
SOLO_ITEMS = {"app-light", "settings-sheet", "app-dark"}


def load_inventory(locale: str) -> list[dict[str, str]]:
    inventory_path = INVENTORY_PATHS.get(locale, LEGACY_INVENTORY_PATH)
    if not inventory_path.exists() and locale == "en" and LEGACY_INVENTORY_PATH.exists():
        inventory_path = LEGACY_INVENTORY_PATH
    data = json.loads(inventory_path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("inventory", [])
    items: list[dict[str, str]] = []
    for raw in data:
        name = str(raw.get("name") or Path(str(raw.get("file", ""))).stem)
        image_path = Path(str(raw.get("file", "")))
        if not image_path.is_absolute():
            direct = inventory_path.parent / image_path
            rooted = ROOT / image_path
            image_path = direct if direct.exists() else rooted
        if not image_path.exists():
            raise FileNotFoundError(f"Missing screenshot for {name}: {image_path}")
        label = str(raw.get("label") or name.replace("-", " ").title())
        description = str(raw.get("description") or "")
        for stale in ("1.0.34", "1.0.10", "1.0.73"):
            label = label.replace(stale, APP_VERSION)
            description = description.replace(stale, APP_VERSION)
        items.append({"name": name, "file": str(image_path), "label": label, "description": description})
    return items


def translated_item(item: dict[str, str], locale: str) -> tuple[str, str]:
    if locale == "ja":
        return JP_ITEMS.get(item["name"], (item["label"], item["description"]))
    return item["label"], item["description"]


def image_dimensions(path: Path) -> tuple[float, float]:
    reader = ImageReader(str(path))
    width, height = reader.getSize()
    return float(width), float(height)


def fit_image(path: Path, max_width: float, max_height: float, upscale_limit: float = 1.85) -> tuple[float, float]:
    width, height = image_dimensions(path)
    scale = min(max_width / width, max_height / height, upscale_limit)
    return width * scale, height * scale


def dock_icon_presentation(name: str) -> Path:
    PROCESSED_SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    output = PROCESSED_SCREENSHOT_DIR / f"{name}.png"
    size = 360
    tile = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(tile)
    colors = {
        "dock-send-icon": ((242, 237, 255, 255), (139, 121, 232, 255)),
        "dock-receive-icon": ((232, 241, 255, 255), (55, 127, 244, 255)),
        "dock-chat-icon": ((253, 237, 240, 255), (231, 104, 128, 255)),
        "dock-disconnect-icon": ((253, 237, 240, 255), (255, 91, 107, 255)),
    }
    fill, stroke = colors[name]
    draw.rounded_rectangle((58, 58, 302, 302), radius=62, fill=fill)
    if name in {"dock-send-icon", "dock-receive-icon"}:
        draw.rounded_rectangle((126, 142, 234, 226), radius=13, outline=stroke, width=13)
        draw.line((126, 164, 153, 164, 164, 178, 234, 178), fill=stroke, width=13, joint="curve")
        if name == "dock-send-icon":
            draw.line((180, 213, 180, 151), fill=stroke, width=13)
            draw.line((158, 173, 180, 151, 202, 173), fill=stroke, width=13, joint="curve")
        else:
            draw.line((180, 153, 180, 215), fill=stroke, width=13)
            draw.line((158, 193, 180, 215, 202, 193), fill=stroke, width=13, joint="curve")
            draw.ellipse((232, 36, 330, 134), fill=(255, 59, 85, 255), outline=(255, 255, 255, 255), width=10)
            badge_font = ImageFont.load_default(size=54)
            draw.text((282, 84), "1", font=badge_font, fill=(255, 255, 255, 255), anchor="mm")
    elif name == "dock-chat-icon":
        draw.rounded_rectangle((118, 126, 242, 208), radius=18, outline=stroke, width=14)
        draw.line((150, 208, 133, 236, 173, 208), fill=stroke, width=14, joint="curve")
        draw.line((148, 153, 214, 153), fill=stroke, width=12)
        draw.line((148, 181, 198, 181), fill=stroke, width=12)
    else:
        draw.arc((96, 120, 190, 214), 124, 318, fill=stroke, width=15)
        draw.arc((170, 146, 264, 240), -56, 138, fill=stroke, width=15)
        draw.line((148, 105, 171, 128), fill=stroke, width=15)
        draw.line((212, 233, 235, 256), fill=stroke, width=15)
        draw.line((151, 205, 210, 146), fill=stroke, width=13)
    tile.save(output, optimize=True)
    return output


def presentation_image(item: dict[str, str]) -> Path:
    path = Path(item["file"])
    if item["name"] in DOCK_ICON_PRESENTATIONS:
        return dock_icon_presentation(item["name"])
    if item["name"] not in TRIMMED_CONTROL_SCREENSHOTS:
        return path
    PROCESSED_SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    output = PROCESSED_SCREENSHOT_DIR / path.name
    with Image.open(path) as source:
        inset = max(12, round(min(source.size) * 0.12))
        cropped = source.crop((inset, inset, source.width - inset, source.height - inset))
        cropped.save(output, optimize=True)
    return output


def group_inventory(items: Sequence[dict[str, str]]) -> list[list[dict[str, str]]]:
    groups: list[list[dict[str, str]]] = []
    pending: list[dict[str, str]] = []
    for item in items:
        if item["name"] in SOLO_ITEMS:
            if pending:
                groups.append(pending)
                pending = []
            groups.append([item])
            continue
        pending.append(item)
        if len(pending) == 2:
            groups.append(pending)
            pending = []
    if pending:
        groups.append(pending)
    return groups


def _draw_solo_item(doc: Doc, item: dict[str, str]) -> None:
    c = doc.c
    label, description = translated_item(item, doc.locale)
    path = presentation_image(item)
    image_w, image_h = fit_image(path, CONTENT_W - 36, 470, 1.32)
    image_x = (PAGE_W - image_w) / 2
    image_y = 188 + max(0, (468 - image_h) / 2)
    c.drawImage(str(path), image_x, image_y, image_w, image_h, preserveAspectRatio=True, mask="auto")
    c.setFillColor(INK)
    c.setFont(doc.bold, 16)
    c.drawCentredString(PAGE_W / 2, 150, label)
    yy = 126
    for line in wrap_text(description, doc.reg, 9.8, CONTENT_W - 42):
        c.setFillColor(MUTED)
        c.setFont(doc.reg, 9.8)
        c.drawCentredString(PAGE_W / 2, yy, line)
        yy -= 14


def _draw_paired_item(doc: Doc, item: dict[str, str], top: float, index_label: str) -> None:
    c = doc.c
    row_h = 296
    row_y = top - row_h
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.line(MARGIN, row_y, PAGE_W - MARGIN, row_y)
    label, description = translated_item(item, doc.locale)
    path = presentation_image(item)
    image_area_w = 245
    image_w, image_h = fit_image(path, image_area_w, 244, 1.85)
    image_x = MARGIN + (image_area_w - image_w) / 2
    image_y = row_y + (row_h - image_h) / 2
    c.drawImage(str(path), image_x, image_y, image_w, image_h, preserveAspectRatio=True, mask="auto")
    text_x = MARGIN + image_area_w + 25
    text_w = CONTENT_W - image_area_w - 25
    title_lines = wrap_text(label, doc.bold, 15, text_w)
    body_lines = wrap_text(description, doc.reg, 9.5, text_w)
    total_h = 13 + len(title_lines) * 20 + 9 + len(body_lines) * 14
    text_top = row_y + (row_h + total_h) / 2
    c.setFillColor(BLUE)
    c.setFont(doc.bold, 8.5)
    c.drawString(text_x, text_top, index_label)
    text_top -= 23
    c.setFillColor(INK)
    c.setFont(doc.bold, 15)
    for line in title_lines:
        c.drawString(text_x, text_top, line)
        text_top -= 20
    text_top -= 3
    c.setFillColor(MUTED)
    c.setFont(doc.reg, 9.5)
    for line in body_lines:
        c.drawString(text_x, text_top, line)
        text_top -= 14


def ui_catalog(doc: Doc) -> None:
    items = load_inventory(doc.locale)
    groups = group_inventory(items)
    item_index = 0
    for group_index, group in enumerate(groups, 1):
        doc.begin_page(False)
        c = doc.c
        c.setFillColor(BLUE)
        c.setFont(doc.bold, 9)
        c.drawString(MARGIN, PAGE_H - 56, doc.t(
            f"APPENDIX / UI CATALOG  {group_index:02d}", f"付録 / UIカタログ  {group_index:02d}"))
        c.setFillColor(INK)
        c.setFont(doc.bold, 22)
        c.drawString(MARGIN, PAGE_H - 86, doc.t("Interface catalog", "画面カタログ"))
        c.setFillColor(MUTED)
        c.setFont(doc.reg, 9.5)
        c.drawString(MARGIN, PAGE_H - 105, doc.t(
            f"Approved WebDrop {APP_VERSION} interface inventory",
            f"承認済み WebDrop {APP_VERSION} 画面一覧"))
        if len(group) == 1:
            item_index += 1
            _draw_solo_item(doc, group[0])
        else:
            first_top = PAGE_H - 128
            for row_index, item in enumerate(group):
                item_index += 1
                _draw_paired_item(doc, item, first_top - row_index * 296, f"{item_index:02d}")


def build(doc: Doc) -> None:
    cover(doc)
    overview(doc)
    architecture_section(doc)
    flow_section(doc)
    foundations_section(doc)
    webrtc_section(doc)
    data_section(doc)
    sensing_section(doc)
    tdma_section(doc)
    scoring_section(doc)
    capacity_section(doc)
    qa_section(doc)
    state_machine_section(doc)
    security_section(doc)
    operations_section(doc)
    limitations_section(doc)
    roadmap(doc)
    ui_catalog(doc)


def overview(doc: Doc) -> None:
    doc.section(
        doc.t("01 / OVERVIEW", "01 / 概要"),
        doc.t("What WebDrop is", "WebDrop とは"),
        doc.t(
            "WebDrop is a browser-native nearby file-transfer app - AirDrop-style, "
            "but with zero install. You open a web page, see nearby devices orbiting "
            "your own avatar, pair with one by tapping the phones together (or scanning "
            "a QR code), and then files move directly browser-to-browser, encrypted, "
            "over WebRTC. The signaling server only coordinates - it never sees a "
            "single file byte.",
            "WebDrop はインストール不要の、ブラウザネイティブな近距離ファイル転送アプリです。"
            "AirDrop のような体験を目指します。ページを開くと、自分のアバターの周りに近くの端末が"
            "軌道状に表示されます。端末同士を軽くぶつける(またはQRを読み取る)とペアになり、以後は"
            "ファイルが WebRTC 上で暗号化され、ブラウザからブラウザへ直接流れます。シグナリング"
            "サーバーは仲介に徹し、ファイルのバイトを一切見ません。",
        ),
    )
    doc.kpis([
        (APP_VERSION, doc.t("app version", "アプリ版")),
        ("3", doc.t("independent lanes", "独立レーン")),
        ("256 KiB", doc.t("file chunk size", "チャンクサイズ")),
        ("500 MB", doc.t("per-session cap", "セッション上限")),
        ("~50", doc.t("concurrent pairs", "同時ペア")),
    ])
    doc.h2(doc.t("The three rules that define the product", "製品を定義する3つの原則"))
    doc.callout(
        doc.t("Trust before controls", "信頼が先、操作は後"),
        doc.t(
            "No transfer UI appears until a verified connection exists. Send / receive "
            "/ chat are never first-screen affordances.",
            "検証済みの接続が確立するまで転送 UI は出しません。送信・受信・チャットを初期画面に"
            "置くことはありません。",
        ),
        "good",
    )
    doc.callout(
        doc.t("Metadata on signaling, bytes on WebRTC", "メタデータはシグナリング、バイトは WebRTC"),
        doc.t(
            "The WebSocket lane carries only small JSON (presence, invites, the "
            "proximity ceremony, SDP/ICE). File bytes ride an encrypted WebRTC data "
            "channel - never the server.",
            "WebSocket レーンは小さな JSON(在席・招待・近接セレモニー・SDP/ICE)だけを運びます。"
            "ファイルのバイトは暗号化された WebRTC データチャネルを通り、サーバーを経由しません。",
        ),
        "info",
    )
    doc.callout(
        doc.t("Receiving never surprises you", "受信で驚かせない"),
        doc.t(
            "Incoming bytes are buffered safely and only exported to a download when "
            "the user taps Save - a received file can never auto-start a download.",
            "受信したバイトは安全にバッファされ、ユーザーが「保存」を押したときだけダウンロードへ"
            "書き出されます。受信が勝手にダウンロードを始めることはありません。",
        ),
        "note",
    )
    doc.h2(doc.t("What's inside", "本書の構成"))
    doc.bullets([
        doc.t("The three-lane architecture and how a transfer runs end to end.",
              "3レーン構成と、転送が通しでどう進むか。"),
        doc.t("First-principles explainers: HTTP/WSS, WebRTC, SDP, NAT/STUN/TURN/ICE, DTLS/SCTP.",
              "基礎からの解説: HTTP/WSS、WebRTC、SDP、NAT/STUN/TURN/ICE、DTLS/SCTP。"),
        doc.t("The data channel, chunking + backpressure, and the receive storage ladder.",
              "データチャネル、チャンク分割とバックプレッシャー、受信ストレージのラダー。"),
        doc.t("The proximity ceremony: ultrasonic chirps, bump/tilt, reservation-TDMA, scoring.",
              "近接セレモニー: 超音波チャープ、バンプ/傾き、予約型TDMA、スコアリング。"),
        doc.t("The concurrent-cohort capacity model, the security model, and the UI catalog.",
              "並行コホートの容量モデル、セキュリティモデル、UIカタログ。"),
    ])


def architecture_section(doc: Doc) -> None:
    doc.section(
        doc.t("02 / ARCHITECTURE", "02 / アーキテクチャ"),
        doc.t("The three-lane architecture", "3レーン構成"),
        doc.t(
            "WebDrop deliberately separates three concerns into independent lanes. "
            "Keeping them apart is what makes the system cheap, private, and reliable.",
            "WebDrop は3つの関心事を独立した「レーン」に分離します。これらを分けておくことが、"
            "低コスト・高プライバシー・高信頼の鍵です。",
        ),
    )
    doc.diagram(diagrams.OUT_DIR / f"diagram-architecture-{doc.locale}.png",
                caption=doc.t("Figure 1 - WebDrop three-lane architecture",
                              "図1 - WebDrop の3レーン構成"),
                max_h=355)
    doc.bullets([
        doc.t("Lane 1 - Static delivery (HTTPS): plain HTML/CSS/JS served over HTTPS. "
              "No server-side rendering, no bundler. HTTPS is mandatory because mic, "
              "motion, service workers, and WebRTC only work on a secure origin.",
              "レーン1 - 静的配信(HTTPS): プレーンな HTML/CSS/JS を HTTPS で配信します。"
              "サーバーサイドレンダリングもバンドラもありません。マイク・モーション・Service "
              "Worker・WebRTC は secure origin でしか動かないため HTTPS は必須です。"),
        doc.t("Lane 2 - Signaling (WSS, metadata only): a ws:// WebSocket that nginx "
              "upgrades to wss:// (TLS). It carries presence, invites, the proximity "
              "ceremony, and the WebRTC handshake (SDP + ICE). No file bytes, ever.",
              "レーン2 - シグナリング(WSS・メタデータのみ): ws:// の WebSocket を nginx が "
              "wss://(TLS)へ昇格します。在席・招待・近接セレモニー・WebRTC ハンドシェイク"
              "(SDP+ICE)を運びます。ファイルのバイトは決して通しません。"),
        doc.t("Lane 3 - Data (WebRTC): an encrypted RTCDataChannel between the two "
              "browsers. STUN discovers a direct path; Cloudflare TURN relays only if "
              "the direct path fails.",
              "レーン3 - データ(WebRTC): 2つのブラウザ間の暗号化された RTCDataChannel。"
              "STUN で直接経路を見つけ、直接が不可能なときだけ Cloudflare TURN が中継します。"),
    ])
    doc.callout(
        doc.t("System invariant", "システム不変条件"),
        doc.t("The signaling server is a coordinator, not a file server. It must never "
              "accept or relay file bytes - only the two browsers ever touch the payload.",
              "シグナリングサーバーは仲介役であってファイルサーバーではありません。ファイルの"
              "バイトを受理・中継してはなりません。ペイロードに触れるのは2つのブラウザだけです。"),
        "warn",
    )


def flow_section(doc: Doc) -> None:
    doc.section(
        doc.t("03 / FLOW", "03 / 流れ"),
        doc.t("How a transfer runs, step by step", "転送の流れ(ステップ別)"),
        doc.t(
            "The same interfaces run locally and in production. Permissions are "
            "requested only from the Connect gesture; the transfer dock appears only "
            "after a verified connection.",
            "同じインターフェースがローカルでも本番でも動きます。権限は「接続」操作からのみ要求し、"
            "転送ドックは検証済みの接続が成立した後にだけ現れます。",
        ),
    )
    doc.numbered([
        doc.t("Discover. The signaling service announces small presence records, so "
              "nearby devices appear on the orbit. No file payload is sent.",
              "発見。シグナリングが小さな在席情報を共有し、近くの端末が軌道に現れます。"
              "ファイル本体は送りません。"),
        doc.t("Choose and verify. The sender taps a candidate and swipes Connect. This "
              "is the only place permissions (mic/motion) are requested, from that gesture.",
              "選択と確認。送信者が候補をタップしてスワイプで接続します。権限(マイク/モーション)を"
              "要求するのはこの操作のときだけです。"),
        doc.t("Pairing ceremony. Both phones emit and listen for ultrasonic chirps and "
              "capture a bump + tilt. The server reveals identities only when the "
              "evidence is reciprocal, consistent, and correctly timed.",
              "ペアリングセレモニー。両端末が超音波チャープを送受信し、バンプと傾きを取得します。"
              "証拠が相互かつ整合し、タイミングも正しいときだけサーバーは身元を開示します。"),
        doc.t("Negotiate WebRTC. The signaling lane relays the SDP offer/answer and ICE "
              "candidates; WebRTC then tries a direct path and falls back to TURN relay.",
              "WebRTC 交渉。シグナリングが SDP のオファー/アンサーと ICE 候補を中継し、WebRTC は"
              "直接経路を試し、必要なら TURN リレーへフォールバックします。"),
        doc.t("Move file chunks. The file is sliced into 256 KiB chunks and streamed over "
              "the data channel while watching bufferedAmount for backpressure.",
              "チャンク転送。ファイルを 256 KiB のチャンクに分割し、bufferedAmount を監視して"
              "バックプレッシャーを掛けながらデータチャネルで流します。"),
        doc.t("Store, then export. Incoming chunks defer into IndexedDB (or a capped Blob "
              "on iOS). Only when the user taps Save are they streamed to a download via "
              "StreamSaver. Transfer-finished and download-started stay separate.",
              "保存してから書き出し。受信チャンクは IndexedDB(iOS では上限付き Blob)に退避します。"
              "ユーザーが「保存」を押したときだけ StreamSaver でダウンロードへ流します。"
              "「転送完了」と「ダウンロード開始」は分離されています。"),
    ])


def foundations_section(doc: Doc) -> None:
    doc.section(
        doc.t("04 / FOUNDATIONS", "04 / 基盤技術"),
        doc.t("Foundations: the web platform", "基盤: Web プラットフォーム"),
        doc.t(
            "WebDrop ships as a tiny static app and relies on the browser's own "
            "capabilities. Here is each foundation in plain language, with why WebDrop "
            "chose it.",
            "WebDrop は極小の静的アプリとして配布され、ブラウザ自身の機能に依存します。"
            "各基盤を平易に説明し、WebDrop が選んだ理由を添えます。",
        ),
    )
    doc.h2(doc.t("Static HTML / CSS / JS over HTTPS", "HTTPS 上の静的 HTML / CSS / JS"))
    doc.lead_para(doc.t("What it is:", "これは何か:"), doc.t(
        "three plain text files the browser downloads and runs - HTML (structure), CSS "
        "(looks), JavaScript (behaviour) - with nothing to install; HTTPS is just the "
        "encrypted version of that download. Like a pop-up book: HTML is the pages, CSS "
        "the art, JS the pull-tabs that make things move.",
        "ブラウザがダウンロードして実行する3つのテキストファイル - HTML(構造)・CSS(見た目)・"
        "JavaScript(振る舞い) - で、インストールは不要です。HTTPS はその通信を暗号化しただけの"
        "ものです。飛び出す絵本のように、HTML はページ、CSS は挿絵、JS は仕掛けを動かすつまみです。"))
    doc.para(doc.t(
        "Three text files - structure (HTML), looks (CSS), behaviour (JS) - that the "
        "browser downloads and runs, with nothing installed. index.html is a fixed DOM "
        "contract; the app flips attributes like data-mode and data-theme on the root "
        "element, and CSS reacts. Why: it keeps the app tiny and fast, and HTTPS is "
        "mandatory anyway for the powerful sensor APIs.",
        "ブラウザがダウンロードして実行する3種のテキスト - 構造(HTML)、見た目(CSS)、振る舞い"
        "(JS) - で、インストールは不要です。index.html は固定的な DOM 契約で、アプリはルート要素の "
        "data-mode や data-theme などの属性を切り替え、CSS が反応します。理由: アプリを小さく"
        "高速に保て、強力なセンサー API のためにも HTTPS は必須だからです。"))
    doc.h2(doc.t("ES modules", "ES モジュール"))
    doc.lead_para(doc.t("What it is:", "これは何か:"), doc.t(
        "JavaScript's built-in way to split code across files that import and export "
        "pieces from each other - like labelled Lego bricks that each declare what they "
        "offer and what they need, snapped together by the browser.",
        "JavaScript 標準の仕組みで、コードをファイルに分け、互いに import / export します - "
        "それぞれが「提供するもの」と「必要なもの」を書いたラベル付きのレゴブロックのようで、"
        "ブラウザが組み合わせます。"))
    doc.para(doc.t(
        "Native import/export with <script type=\"module\">. js/app.js imports the store, "
        "view, services, transport, and controller - no webpack/rollup. Imports carry a "
        "?v=1.0.87 cache-buster tied to the app version. Why: a small static app does not "
        "need a build pipeline, and native modules give clean dependency boundaries.",
        "<script type=\"module\"> によるネイティブな import/export です。js/app.js がストア・"
        "ビュー・サービス・トランスポート・コントローラを取り込みます(webpack/rollup なし)。import "
        "には ?v=1.0.87 というアプリ版に紐づくキャッシュバスターが付きます。理由: 小さな静的アプリに"
        "ビルド工程は不要で、ネイティブモジュールは依存関係の境界を明確にします。"))
    doc.h2(doc.t("Service worker and offline", "Service Worker とオフライン"))
    doc.lead_para(doc.t("What it is:", "これは何か:"), doc.t(
        "a small background script the browser keeps running even after the page closes, "
        "able to answer the page's network requests - like an office receptionist who "
        "keeps copies of common documents, so you get them instantly even when the post "
        "office is shut.",
        "ページを閉じてもブラウザが動かし続ける小さな背景スクリプトで、ページのネットワーク要求に"
        "応答できます - よくある書類の控えを持つ受付係のようなもので、郵便局が閉まっていても即座に"
        "渡してくれます。"))
    doc.para(doc.t(
        "A background script the browser keeps even when the page is closed; it can answer "
        "network requests. service-worker.js pre-caches the app shell (CACHE_NAME = "
        "webdrop-v2-static-1.0.87) and always fetches runtime-config.js fresh so the live "
        "server URL is never stale. Why: the UI loads instantly and works offline while the "
        "config that points at the live server stays current.",
        "ページを閉じてもブラウザが保持する背景スクリプトで、ネットワーク要求に応答できます。"
        "service-worker.js はアプリシェルを事前キャッシュし(CACHE_NAME = webdrop-v2-static-1.0.87)、"
        "runtime-config.js は常に最新を取得して稼働サーバー URL が古くならないようにします。理由: UI が"
        "即座に読み込まれオフラインでも動き、稼働サーバーを指す設定は最新に保たれます。"))
    doc.h2(doc.t("WebSocket and the WSS/TLS upgrade", "WebSocket と WSS/TLS 昇格"))
    doc.lead_para(doc.t("What it is:", "これは何か:"), doc.t(
        "a WebSocket is one long-lived connection both sides can talk over at any moment, "
        "instead of asking again and again - like leaving a phone line open rather than "
        "mailing postcards back and forth. WSS is just the encrypted (TLS) version: "
        "wss:// is to ws:// what https:// is to http://.",
        "WebSocket は1本の長寿命な接続で、両者がいつでも話せます - 何度も問い合わせる代わりに、"
        "はがきのやり取りではなく電話線を開いたままにする感じです。WSS はその暗号化(TLS)版で、"
        "ws:// に対する wss:// は、http:// に対する https:// と同じ関係です。"))
    doc.para(doc.t(
        "A WebSocket is a long-lived, two-way connection over one TCP socket. It is born as "
        "an ordinary HTTP request that asks to be upgraded; the server proves it understood "
        "and switches protocols. With wss://, TLS wraps it and nginx terminates the "
        "certificate, forwarding the upgraded socket to Node on 127.0.0.1:8080.",
        "WebSocket は1本の TCP ソケット上の長寿命な双方向接続です。最初は「昇格」を求める通常の "
        "HTTP 要求として生まれ、サーバーが理解したことを示してプロトコルを切り替えます。wss:// では "
        "TLS が全体を包み、nginx が証明書を終端して、昇格済みソケットを 127.0.0.1:8080 の Node へ"
        "転送します。"))
    doc.code(
        "GET /ws HTTP/1.1\n"
        "Host: webdrop-wss-0618.japaneast.cloudapp.azure.com\n"
        "Upgrade: websocket\n"
        "Connection: Upgrade\n"
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\n"
        "Sec-WebSocket-Version: 13\n"
        "\n"
        "HTTP/1.1 101 Switching Protocols\n"
        "Upgrade: websocket\n"
        "Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=")
    doc.para(doc.t(
        "After the 101, the first frame the app sends must be client:hello; the server "
        "replies connected with a sessionId and an ephemeral turnAccessToken. The hub is "
        "strict: binary frames are rejected, ws is created with maxPayload = MAX_JSON_BYTES, "
        "every message is schema-validated, and there are per-IP and per-client rate limits. "
        "Why: WebSocket is perfect for tiny, frequent coordination messages - but it is not "
        "the file lane.",
        "101 の後、アプリが最初に送るフレームは client:hello でなければならず、サーバーは sessionId と"
        "一時的な turnAccessToken を付けて connected を返します。ハブは厳格です。バイナリフレームは拒否、"
        "ws は maxPayload = MAX_JSON_BYTES で生成、全メッセージをスキーマ検証し、IP 単位・クライアント"
        "単位のレート制限があります。理由: WebSocket は小さく頻繁な調整メッセージに最適ですが、ファイル"
        "レーンではありません。"))


def webrtc_section(doc: Doc) -> None:
    doc.section(
        doc.t("05 / WEBRTC", "05 / WebRTC"),
        doc.t("WebRTC, NAT, and finding a path", "WebRTC・NAT・経路探索"),
        doc.t(
            "WebRTC lets two browsers talk directly. WebDrop uses only the data part. "
            "Getting two NATed devices to connect is the hard problem that SDP, STUN, "
            "TURN, and ICE exist to solve.",
            "WebRTC は2つのブラウザを直接つなぎます。WebDrop はそのデータ部分だけを使います。"
            "NAT 配下の2端末を接続させることが難問で、SDP・STUN・TURN・ICE はそれを解くために"
            "あります。",
        ),
    )
    doc.h2(doc.t("WebRTC and the SDP offer/answer", "WebRTC と SDP のオファー/アンサー"))
    doc.lead_para(doc.t("What it is:", "これは何か:"), doc.t(
        "WebRTC is the browser's built-in way for two devices to talk directly to each "
        "other - audio, video, or (here) raw data - with no server in the middle. SDP is "
        "the short text 'business card' each side swaps first: here is what I support and "
        "how to reach me.",
        "WebRTC はブラウザ標準の仕組みで、2つの端末が間にサーバーを挟まず直接やり取りします - "
        "音声・映像、ここでは生データです。SDP は最初に交換する短いテキストの「名刺」で、"
        "「自分が対応する内容と到達方法」を伝えます。"))
    doc.para(doc.t(
        "An RTCPeerConnection manages the whole link: describing capabilities, gathering "
        "candidates, testing paths, and hosting data channels. SDP is a small text blob - "
        "\"here's what I support and how to reach me\". The caller createOffer() -> "
        "setLocalDescription -> sends it; the callee setRemoteDescription -> createAnswer() "
        "-> sends back. The server only relays these as rtc:signal. The a=fingerprint line "
        "in the SDP later authenticates the encrypted channel.",
        "RTCPeerConnection が接続全体を管理します。能力の記述、候補の収集、経路の試験、データ"
        "チャネルの保持です。SDP は小さなテキスト塊で「自分が対応する内容と到達方法」を表します。"
        "発信側は createOffer() -> setLocalDescription で送り、着信側は setRemoteDescription -> "
        "createAnswer() で返します。サーバーはこれらを rtc:signal として中継するだけです。SDP の "
        "a=fingerprint 行が後で暗号化チャネルを認証します。"))
    doc.h2(doc.t("NAT and why some calls need a relay", "NAT と、リレーが要る理由"))
    doc.lead_para(doc.t("What it is:", "これは何か:"), doc.t(
        "NAT (Network Address Translation) lets many home or office devices share one "
        "public internet address, hiding them behind it - like one company phone number "
        "with an internal switchboard. Good for privacy, but it means outsiders cannot "
        "simply dial a specific device directly.",
        "NAT(ネットワークアドレス変換)は、多数の家庭・オフィスの端末が1つのグローバルアドレスを"
        "共有し、その裏に隠れる仕組みです - 内線交換台を持つ1つの代表電話番号のようなものです。"
        "プライバシーには良い反面、外部から特定の端末へ直接「電話」できません。"))
    doc.para(doc.t(
        "NAT shares one public IP among many devices and blocks unsolicited inbound traffic, "
        "so two NATed peers cannot simply dial each other. Full/restricted-cone NATs reuse "
        "one public port and are direct-friendly. Symmetric NAT picks a different public port "
        "per destination, which defeats hole-punching - that is the classic reason a call "
        "falls back to a TURN relay.",
        "NAT は1つのグローバル IP を多数の端末で共有し、要求していない受信を遮断するため、NAT 配下の"
        "2者は単純には接続できません。フルコーン/制限コーン NAT は同じグローバルポートを再利用し直接"
        "接続向きです。対称 NAT は宛先ごとに別のポートを割り当てるため穴あけが失敗し、これが TURN "
        "リレーへ落ちる典型的な理由です。"))
    doc.h2(doc.t("STUN, TURN, and ICE", "STUN・TURN・ICE"))
    doc.lead_para(doc.t("What it is:", "これは何か:"), doc.t(
        "STUN is a quick way to ask 'what does my public address look like from outside?' "
        "- like asking a friend across the room to read your name tag. TURN is a relay "
        "that forwards your data when no direct path works - a post office that re-mails "
        "parcels for you. ICE is the process that tries every option and picks the best "
        "one that works.",
        "STUN は「外から自分のアドレスはどう見えるか?」を手早く尋ねる方法です - 部屋の向こうの"
        "友人に名札を読んでもらう感じです。TURN は直接経路が無いときデータを中継するリレーで、"
        "荷物を転送してくれる郵便局のようなものです。ICE は全選択肢を試し、最良の有効な経路を"
        "選ぶ手続きです。"))
    doc.para(doc.t(
        "STUN tells you your own public address (a srflx candidate) - cheap and stateless. "
        "TURN is a relay that forwards your data when no direct path works - it needs "
        "credentials and costs bandwidth, so it is a last resort. ICE ties them together in "
        "three phases: gather host/srflx/relay candidates, run connectivity checks (the "
        "outgoing probe punches the NAT hole the reply needs), then nominate the "
        "highest-priority working pair. WebDrop fetches ICE servers from GET /api/ice-servers; "
        "after connecting, classifyPathFromStats() labels the path direct or relay and the UI "
        "caps relay transfers at 500 MB.",
        "STUN は自分のグローバルアドレス(srflx 候補)を教えてくれます - 安価でステートレスです。"
        "TURN は直接経路が無いときにデータを中継するリレーで、認証情報が要り帯域を消費するため最終手段"
        "です。ICE はこれらを3段階でまとめます。host/srflx/relay 候補を収集し、接続性チェックを行い"
        "(送信プローブが応答に必要な NAT 穴を開けます)、最も優先度の高い有効なペアを採用します。"
        "WebDrop は GET /api/ice-servers から ICE サーバーを取得し、接続後 classifyPathFromStats() が"
        "経路を direct か relay と判定して、UI はリレー転送を 500 MB に制限します。"))
    doc.h2(doc.t("DTLS / SCTP - the encrypted data channel", "DTLS / SCTP - 暗号化データチャネル"))
    doc.lead_para(doc.t("What it is:", "これは何か:"), doc.t(
        "DTLS is TLS - the same padlock encryption as HTTPS - applied to the small packets "
        "WebRTC sends, so every byte is scrambled in transit. SCTP rides on top to deliver "
        "those packets in order and without loss. Together they are like a sealed, "
        "numbered courier pouch.",
        "DTLS は TLS(HTTPS と同じ鍵マークの暗号)を、WebRTC が送る小さなパケット向けにしたもので、"
        "転送中の全バイトを暗号化します。SCTP はその上で、パケットを順序どおり欠落なく届けます。"
        "両者を合わせると、封緘され番号の付いた宅配袋のようなものです。"))
    doc.para(doc.t(
        "Once ICE picks a path, the browsers run a DTLS handshake (TLS for datagrams), "
        "exchanging certificates and verifying the fingerprint that was pinned in the SDP - "
        "so a man-in-the-middle cannot slip in. SCTP then runs over that secure channel to "
        "give ordered, reliable, message-framed delivery. So every byte is encrypted "
        "automatically. WebDrop still adds manifests and per-file SHA-256, because encryption "
        "protects the pipe, not the file boundaries or integrity.",
        "ICE が経路を選ぶと、ブラウザは DTLS ハンドシェイク(データグラム向けの TLS)を行い、証明書を"
        "交換して SDP に固定されたフィンガープリントを検証します - 中間者は割り込めません。続いて SCTP "
        "がその安全なチャネル上で動き、順序保証・信頼性・メッセージ枠付きの配送を提供します。こうして"
        "全バイトが自動で暗号化されます。それでも WebDrop はマニフェストとファイル別 SHA-256 を加えます。"
        "暗号化は経路を守りますが、ファイルの境界や完全性は守らないからです。"))


def data_section(doc: Doc) -> None:
    doc.section(
        doc.t("06 / DATA CHANNEL", "06 / データチャネル"),
        doc.t("The data channel, chunks, and backpressure", "データチャネル・チャンク・バックプレッシャー"),
        doc.t(
            "Once a path exists, file bytes ride an RTCDataChannel - ordered and "
            "reliable like TCP. WebDrop keeps control metadata and file bytes on "
            "separate channels so neither blocks the other.",
            "経路が確立すると、ファイルのバイトは RTCDataChannel を流れます - TCP のように"
            "順序保証・信頼性があります。WebDrop は制御メタデータとファイルのバイトを別々の"
            "チャネルに分け、互いをブロックしないようにします。",
        ),
    )
    doc.h2(doc.t("Two ordered channels + 256 KiB chunks", "2本の順序付きチャネル + 256 KiB チャンク"))
    doc.lead_para(doc.t("What it is:", "これは何か:"), doc.t(
        "an RTCDataChannel is the WebRTC pipe that carries arbitrary data - not just "
        "audio/video - between the two browsers, ordered and reliable like a TCP "
        "connection. A 'chunk' is just one bite-sized piece of a big file: sending a book "
        "one page at a time rather than all at once.",
        "RTCDataChannel は WebRTC のパイプで、音声・映像だけでなく任意のデータを2つのブラウザ間で"
        "運びます - TCP のように順序保証・信頼性があります。「チャンク」は大きなファイルを一口大に"
        "切った1片で、本を一度にではなく1ページずつ送るようなものです。"))
    doc.para(doc.t(
        "WebDrop opens two ordered channels (webdrop-control-v1 and webdrop-file-v1). "
        "The sender slices each File into 256 KiB chunks (DEFAULT_CHUNK_SIZE), sends a "
        "manifest first (file ids, sizes, chunk counts, per-file SHA-256), then streams "
        "chunks while watching RTCDataChannel.bufferedAmount. Each session is capped at "
        "500 MB (DEFAULT_SESSION_CAP_BYTES). 256 KiB is small enough to keep retry "
        "bookkeeping cheap on mobile, large enough to avoid per-message overhead.",
        "WebDrop は2本の順序付きチャネル(webdrop-control-v1 と webdrop-file-v1)を開きます。"
        "送信側は各 File を 256 KiB のチャンク(DEFAULT_CHUNK_SIZE)に分割し、まずマニフェスト"
        "(ファイルID・サイズ・チャンク数・ファイル別 SHA-256)を送り、次に "
        "RTCDataChannel.bufferedAmount を監視しながらチャンクを流します。各セッションは "
        "500 MB(DEFAULT_SESSION_CAP_BYTES)に制限されます。256 KiB は、モバイルで再送管理を"
        "軽く保つには十分小さく、メッセージ毎のオーバーヘッドを避けるには十分大きいサイズです。"))
    doc.h2(doc.t("Backpressure, worked", "バックプレッシャーの実際"))
    doc.lead_para(doc.t("What it is:", "これは何か:"), doc.t(
        "backpressure means slowing the sender when the receiver or network buffer is "
        "filling up, so nothing overflows - like pausing while pouring water into a cup so "
        "it never spills over the rim.",
        "バックプレッシャーとは、受信側やネットワークのバッファが一杯になりかけたら送信を緩める"
        "仕組みで、あふれを防ぎます - コップに水を注ぐとき、縁からこぼれないよう一旦止めるのと"
        "同じです。"))
    doc.para(doc.t(
        "A 250 MB file at 256 KiB/chunk is ~1,000 chunks. Calling send() 1,000 times in a "
        "loop would queue all 250 MB in the browser send buffer and can crash the tab. "
        "Instead the sender pauses at a high-water mark and resumes on bufferedamountlow, so "
        "only a few chunks are ever in flight - RAM stays bounded regardless of file size.",
        "250 MB のファイルは 256 KiB チャンクで約1,000チャンクです。ループで send() を1,000回"
        "呼ぶと 250 MB 全部がブラウザの送信バッファに積まれ、タブが落ちかねません。代わりに送信側は"
        "ハイウォーターマークで一時停止し、bufferedamountlow で再開します。常に少数のチャンクだけが"
        "送信中となり、ファイルサイズに関わらず RAM は一定に保たれます。"))
    doc.code(
        "if (channel.bufferedAmount > HIGH_WATER) {\n"
        "  await once(channel, \"bufferedamountlow\"); // let the network drain\n"
        "}\n"
        "channel.send(chunk);")
    doc.h2(doc.t("The receive ladder", "受信ラダー"))
    doc.lead_para(doc.t("What it is:", "これは何か:"), doc.t(
        "IndexedDB is a small database built into the browser for storing data on the "
        "device; StreamSaver streams incoming bytes straight into the browser's normal "
        "download. Together they mean a huge file never has to sit in memory all at once.",
        "IndexedDB はブラウザ内蔵の小さなデータベースで、端末上にデータを保存します。StreamSaver は"
        "受信バイトをブラウザ通常のダウンロードへ直接流し込みます。両者により、巨大ファイルを一度に"
        "メモリへ載せずに済みます。"))
    doc.para(doc.t(
        "The receiver must avoid assembling a multi-hundred-MB file in RAM, and a web page "
        "cannot silently write to disk. storage-client.js climbs a ladder, in order of "
        "preference:",
        "受信側は数百MBのファイルを RAM 上で組み立てるのを避けねばならず、ウェブページは無断で"
        "ディスクへ書き込めません。storage-client.js は次の優先順でラダーを上ります。"))
    doc.numbered([
        doc.t("IndexedDB (capable non-iOS browsers): each ordered chunk is written while "
              "receiving, keyed by session/file/chunk. No download starts yet.",
              "IndexedDB(対応する非iOSブラウザ): 受信しながら各チャンクを session/file/chunk を"
              "キーに書き込みます。ダウンロードはまだ始まりません。"),
        doc.t("On Save, stored chunks stream through the self-hosted StreamSaver helper into "
              "the browser's download pipeline.",
              "「保存」時、保存済みチャンクを自己ホストの StreamSaver ヘルパー経由でブラウザの"
              "ダウンロードパイプラインへ流します。"),
        doc.t("iPhone/iPad Safari: a capped Blob fallback assembles chunks in memory and "
              "offers Open (preview) - capped because memory grows with the payload.",
              "iPhone/iPad Safari: 上限付き Blob フォールバックがメモリ上でチャンクを組み立て、"
              "Open(プレビュー)を提供します - メモリがペイロードに比例して増えるため上限付きです。"),
        doc.t("Compatibility fallback: direct receive-time StreamSaver writing when IndexedDB "
              "is unavailable; if no safe backend can hold the size, the file is rejected "
              "before any byte is accepted.",
              "互換フォールバック: IndexedDB が無いときは受信時に直接 StreamSaver へ書き込みます。"
              "安全に保持できるバックエンドが無ければ、バイトを受理する前にファイルを拒否します。"),
    ])
    doc.callout(
        doc.t("Transfer finished is not download started", "「転送完了」は「ダウンロード開始」ではない"),
        doc.t("Incoming chunks defer into storage and only export to a download when the user "
              "taps Save. A received file can never auto-start a download.",
              "受信チャンクはストレージに退避し、ユーザーが「保存」を押したときだけダウンロードへ"
              "書き出します。受信が勝手にダウンロードを始めることはありません。"),
        "note",
    )


def sensing_section(doc: Doc) -> None:
    doc.section(
        doc.t("07 / SENSING", "07 / センシング"),
        doc.t("Proximity sensing: sound and motion", "近接センシング: 音と動き"),
        doc.t(
            "The pairing ceremony gathers physical evidence that two phones are really "
            "next to each other: a near-ultrasonic chirp the mic can hear, and a bump "
            "plus tilt the accelerometer can feel.",
            "ペアリングセレモニーは、2台の端末が本当に隣り合っている物理的証拠を集めます。"
            "マイクが聞き取れる近接超音波チャープと、加速度センサーが感じるバンプと傾きです。",
        ),
    )
    doc.h2(doc.t("Ultrasonic chirps (Web Audio)", "超音波チャープ(Web Audio)"))
    doc.lead_para(doc.t("What it is:", "これは何か:"), doc.t(
        "the Web Audio API lets a web page generate and analyse sound through the speaker "
        "and microphone. A 'chirp' here is a short tone that sweeps a near-ultrasonic band "
        "- high enough that people barely hear it, but a nearby phone's mic can. Like two "
        "crickets recognising each other's call.",
        "Web Audio API は、ウェブページがスピーカーとマイクで音を生成・分析できる仕組みです。"
        "ここでの「チャープ」は近接超音波帯を掃引する短い音で、人にはほぼ聞こえませんが、近くの"
        "端末のマイクは拾えます - 2匹のコオロギが互いの鳴き声を認識するようなものです。"))
    doc.para(doc.t(
        "acoustic-proximity.js emits a coded chirp in a near-ultrasonic band (DEFAULT_CHIRP: "
        "18,600-19,400 Hz) and records the mic with echo cancellation, noise suppression, and "
        "auto-gain control turned off, so the browser does not erase the high-frequency "
        "energy. Sound is short-range and direction-ish, so hearing a peer's coded chirp is "
        "good evidence the two devices are physically near.",
        "acoustic-proximity.js は近接超音波帯(DEFAULT_CHIRP: 18,600-19,400 Hz)で符号化チャープ"
        "を発し、エコーキャンセル・ノイズ抑制・自動ゲインを切ってマイク録音します。ブラウザに高域"
        "エネルギーを消させないためです。音は近距離で指向性があるため、相手の符号化チャープが"
        "聞こえることは2台が物理的に近い良い証拠になります。"))
    doc.h2(doc.t("Bump and tilt (DeviceMotion)", "バンプと傾き(DeviceMotion)"))
    doc.lead_para(doc.t("What it is:", "これは何か:"), doc.t(
        "DeviceMotion is the browser API that reads a phone's accelerometer - the same "
        "sensor that knows which way is down and feels a shake. WebDrop uses it to feel "
        "two phones physically tapped together and tilted, a gesture that is deliberate "
        "and hard to fake.",
        "DeviceMotion は、端末の加速度センサー(どちらが下かを知り、揺れを感じる同じセンサー)を"
        "ブラウザから読む API です。WebDrop はこれで、2台を物理的に軽くぶつけて傾ける動きを感じ"
        "取ります - 意図的で偽装しにくいジェスチャーです。"))
    doc.para(doc.t(
        "motion-proximity.js detects a bump when linear acceleration >= "
        "BUMP_ACCELERATION_THRESHOLD (10) or the gravity-vector change >= 3.5, and a tilt "
        "when |beta| or |gamma| > 30 degrees. These feed the proximity score and are also "
        "mandatory server-side evidence. Bumping the phones together is a deliberate gesture "
        "that is hard to trigger by accident.",
        "motion-proximity.js は、線形加速度が BUMP_ACCELERATION_THRESHOLD(10)以上、または"
        "重力ベクトル変化が 3.5 以上のときバンプを、|beta| か |gamma| が 30 度を超えたとき傾きを"
        "検出します。これらは近接スコアに寄与し、サーバー側の必須証拠でもあります。端末を軽く"
        "ぶつける動作は意図的で、偶然には起こりにくいものです。"))
    doc.h2(doc.t("Detection, not loudness", "検出は音量ではない"))
    doc.lead_para(doc.t("What it is:", "これは何か:"), doc.t(
        "correlation is a math check that asks 'how closely does this recording match the "
        "exact pattern we sent?' (1.0 = perfect), rather than 'how loud was it?' - like "
        "recognising one specific melody in a noisy room, not just hearing noise.",
        "相関とは、「録音が、送った正確なパターンにどれだけ一致するか」を測る計算で(1.0=完全一致)、"
        "「どれだけ大きかったか」ではありません - 騒がしい部屋で、ただの雑音ではなく特定の"
        "メロディを聞き分けるのに似ています。"))
    doc.para(doc.t(
        "Detection is not \"was it loud?\" but \"did the recording contain this specific coded "
        "sweep, clearly above the background?\". Correlation slides the expected template over "
        "the recording (1.0 = perfect); the energy margin compares chirp-band energy against "
        "nearby background in dB. WebDrop accepts on a ladder (e.g. 0.30 / 0.20 / 0.16 "
        "correlation, backed by 4.5 dB / 8 dB margins). The server also keeps the shared band "
        "under ~sampleRate x 0.45 - 100 Hz with >= 420 Hz of bandwidth, so it never asks a "
        "phone to detect a tone above its Nyquist limit.",
        "検出は「大きかったか」ではなく「録音にこの特定の符号化スイープが、背景より明らかに"
        "強く含まれていたか」です。相関は期待テンプレートを録音に重ねて一致度を測り(1.0=完全)、"
        "エネルギーマージンはチャープ帯域のエネルギーを近傍背景と dB で比較します。WebDrop は段階的に"
        "受理します(例: 相関 0.30 / 0.20 / 0.16 を 4.5 dB / 8 dB のマージンで裏付け)。サーバーは"
        "共有帯域を ~サンプルレート x 0.45 - 100 Hz 未満かつ 420 Hz 以上の帯域幅に保ち、ナイキスト"
        "限界を超える音を端末に検出させません。"))
    doc.callout(
        doc.t("QR is the dependable fallback", "QR は確実なフォールバック"),
        doc.t("When mic/motion are denied or unsupported, one phone shows a one-time, "
              "server-issued QR token and the other scans it - camera and a screen are all it "
              "needs.",
              "マイク/モーションが拒否・非対応のときは、一方が一度きりのサーバー発行 QR トークンを"
              "表示し、他方が読み取ります - 必要なのはカメラと画面だけです。"),
        "info",
    )


def tdma_section(doc: Doc) -> None:
    doc.section(
        doc.t("08 / TDMA", "08 / TDMA"),
        doc.t("Reservation TDMA: one window, pre-assigned slots", "予約型TDMA: 1つの窓に事前割当スロット"),
        doc.t(
            "If several nearby phones chirp at once, their sounds collide and nobody "
            "decodes cleanly - the classic multiple-access problem. Because the server "
            "already knows the cohort, it hands out time slots before anyone transmits.",
            "近くの複数端末が同時にチャープすると音が衝突し、誰もきれいに復号できません - "
            "古典的な多元接続問題です。サーバーは既にコホートを把握しているので、誰かが送信"
            "する前に時間スロットを割り当てます。",
        ),
    )
    doc.diagram(diagrams.OUT_DIR / f"diagram-tdma-{doc.locale}.png",
                caption=doc.t("Figure 2 - Reservation TDMA schedule",
                              "図2 - 予約型TDMA スケジュール"),
                max_h=235)
    doc.lead_para(doc.t("What it is:", "これは何か:"), doc.t(
        "TDMA (Time Division Multiple Access) means several senders share one channel by "
        "each taking a turn in its own time slot - like people in a meeting agreeing to "
        "speak one at a time instead of all at once.",
        "TDMA(時分割多元接続)とは、複数の送信者が1つのチャネルを、それぞれ自分の時間スロットで"
        "順番に使って共有する方式です - 会議で全員が同時にではなく一人ずつ話すと決めるのに"
        "似ています。"))
    doc.para(doc.t(
        "This is reservation TDMA (Time Division Multiple Access): every phone records the "
        "whole 3,600 ms window but emits only in its own slot, then decodes all peers "
        "afterward. It is Aloha-family - Slotted Aloha lets devices gamble on a slot and back "
        "off on collision; WebDrop instead reserves slots centrally, which is strictly more "
        "reliable for a small, known, server-coordinated cohort.",
        "これは予約型TDMA(時分割多元接続)です。各端末は 3,600 ms の窓全体を録音しますが、"
        "送信は自分のスロットだけで行い、後で全員を復号します。Aloha 系です - スロット化 Aloha は"
        "端末がスロットに賭けて衝突時に後退しますが、WebDrop はスロットを中央で予約します。これは"
        "小規模で既知、かつサーバー協調のコホートでは確実に信頼性が高い方式です。"))
    doc.bullets([
        doc.t("Slot floor: a coded chirp needs ~520 ms + an ~80 ms guard, so ~600 ms per slot.",
              "スロット下限: 符号化チャープには ~520 ms + ~80 ms のガードが要り、1スロット ~600 ms。"),
        doc.t("floor(3,600 / 600) = 6 slots fit, which is exactly why the per-cohort cap is 6.",
              "floor(3,600 / 600) = 6 スロットが入るため、コホート上限がちょうど6です。"),
        doc.t("Bigger cohorts need a longer window (PROXIMITY_SESSION_DURATION_MS), not just a "
              "bigger number - the cap is clamped to the slot-floor ceiling.",
              "大きなコホートには長い窓(PROXIMITY_SESSION_DURATION_MS)が必要で、数字を増やすだけ"
              "では不可です - 上限はスロット下限の天井にクランプされます。"),
    ])


def scoring_section(doc: Doc) -> None:
    doc.section(
        doc.t("09 / SCORING", "09 / スコアリング"),
        doc.t("Scoring: reciprocal signatures and the winner margin", "スコアリング: 相互署名と勝者マージン"),
        doc.t(
            "Pairing identity is decided by who heard whose coded chirp - not by loudness "
            "or \"who is nearby\". This is what keeps A<->B and C<->D from cross-pairing.",
            "ペアの同定は「誰が誰の符号化チャープを聞いたか」で決まります - 音量や「誰が近いか」"
            "ではありません。これが A<->B と C<->D の誤ペアを防ぎます。",
        ),
    )
    doc.h2(doc.t("Reciprocal coded signatures (primary)", "相互符号化署名(主判定)"))
    doc.para(doc.t(
        "For A<->B, A must report its own assigned signature and report hearing B's, and B "
        "must do the same for A - each above a detection threshold (hasReciprocalAcousticEvidence). "
        "A+C never match because A heard B's signature, not C's. A secret handshake only counts "
        "if both people do their half and recognise the other's half.",
        "A<->B では、A は自分の割当署名を報告し、かつ B の署名を聞いたと報告し、B も A について同じ"
        "ことを行わねばなりません - いずれも検出しきい値以上(hasReciprocalAcousticEvidence)です。"
        "A は B の署名を聞いており C のではないので、A+C は決して一致しません。秘密の握手は、両者が"
        "自分の半分を行い、かつ相手の半分を認識したときだけ成立します。"))
    doc.h2(doc.t("The winner margin (fail-safe)", "勝者マージン(フェイルセーフ)"))
    doc.para(doc.t(
        "The winner margin requires the best-matching signature to be sufficiently clearer than "
        "the runner-up, so a third nearby phone cannot be mistaken for the partner. The guard "
        "fails safe: a missing or non-finite acousticConfidenceMargin fails the check rather "
        "than passing by default (ACOUSTIC_WINNER_MARGIN = 0.04).",
        "勝者マージンは、最良一致の署名が次点より十分に明確であることを要求し、近くの第三の端末を"
        "相手と取り違えないようにします。ガードはフェイルセーフです。acousticConfidenceMargin が"
        "欠落・非有限なら、既定で通過させず検査を失敗させます(ACOUSTIC_WINNER_MARGIN = 0.04)。"))
    doc.h2(doc.t("What verification requires", "検証に必要な条件"))
    doc.table(
        [doc.t("Requirement", "条件"), doc.t("Rule", "ルール")],
        [
            [doc.t("Score", "スコア"), doc.t(">= 55% proximity score", "近接スコア 55% 以上")],
            [doc.t("Evidence", "証拠"), doc.t("ultrasound + bump + tilt all mandatory",
                                              "超音波 + バンプ + 傾き すべて必須")],
            [doc.t("Reciprocity", "相互性"), doc.t("both heard each other's signature",
                                                  "互いの署名を聞いていること")],
            [doc.t("Timing", "タイミング"), doc.t("bump times within 4,000 ms; valid ceremony",
                                                 "バンプ時刻が 4,000 ms 以内・有効なセレモニー")],
            [doc.t("Winner", "勝者"), doc.t("unambiguous winner above the margin",
                                           "マージンを超える明確な勝者")],
        ],
        widths=[0.28, 0.72],
    )
    doc.para(doc.t(
        "Tilt is presence-only: it must be present, but it does not decide which device pairs "
        "with which. Exact bump timing is a gate plus a tie-break, never the identity matcher.",
        "傾きは存在確認のみです。存在は必須ですが、どの端末同士がペアになるかは決めません。"
        "正確なバンプ時刻はゲートかつ同点処理であり、同定そのものには使いません。"),
        size=9.4, color=MUTED)


def capacity_section(doc: Doc) -> None:
    doc.section(
        doc.t("10 / CAPACITY", "10 / 容量"),
        doc.t("The concurrent-cohort capacity model", "並行コホートの容量モデル"),
        doc.t(
            "Instead of one global pairing session, the hub runs many concurrent bounded "
            "cohorts: many small rooms of six at once, under a global headcount cap.",
            "1つのグローバルなペアリングセッションの代わりに、ハブは多数の並行する有界コホートを"
            "走らせます。6人の小部屋を同時に多数、グローバルな人数上限の下で運用します。",
        ),
    )
    doc.para(doc.t(
        "A new joiner slots into an open cohort with room, or opens a fresh one; when a cohort "
        "fills (6) it closes and starts its ceremony. MAX_TOTAL_PROXIMITY_PARTICIPANTS (default "
        "100) bounds everyone - beyond it, joins fail cleanly with reason: capacity_reached "
        "before any cohort is mutated. So 100 / 6 = ~17 cohorts = up to ~50 pairs. The "
        "per-cohort cap MAX_PROXIMITY_SESSION_CLIENTS (default 6) is clamped to the slot-floor "
        "ceiling, so the scheduler can never create sub-floor acoustic slots.",
        "新規参加者は空きのあるコホートに入るか、新しいコホートを開きます。コホートが満員(6)に"
        "なると閉じてセレモニーを開始します。MAX_TOTAL_PROXIMITY_PARTICIPANTS(既定100)が全体を"
        "縛り、それを超える参加は、どのコホートも変更する前に reason: capacity_reached できれいに"
        "失敗します。よって 100 / 6 = 約17コホート = 最大 約50ペアです。コホート上限 "
        "MAX_PROXIMITY_SESSION_CLIENTS(既定6)はスロット下限の天井にクランプされ、スケジューラは"
        "下限未満の音響スロットを作れません。"))
    doc.h2(doc.t("Tuning knobs (and what each one trades)", "調整ノブ(と各々のトレードオフ)"))
    doc.table(
        [doc.t("Knob", "ノブ"), doc.t("Default", "既定"), doc.t("Raising it...", "上げると...")],
        [
            ["MAX_TOTAL_PROXIMITY_PARTICIPANTS", "100",
             doc.t("more concurrent participants; needs Redis + multi-node to mean anything",
                   "並行参加者が増える。意味を持つには Redis + 複数ノードが必要")],
            ["MAX_PROXIMITY_SESSION_CLIENTS", "6",
             doc.t("no effect unless the window grows (clamped to the slot floor)",
                   "窓を広げない限り無効(スロット下限にクランプ)")],
            ["PROXIMITY_SESSION_DURATION_MS", "3,600 ms",
             doc.t("adds slots so bigger cohorts become legal; slower ceremony",
                   "スロットが増え大きなコホートが可能に。セレモニーは遅くなる")],
            ["ACOUSTIC_SESSION_STAGGER_MS", "600 ms",
             doc.t("spreads simultaneous cohort starts so they don't all chirp at once",
                   "同時開始のコホートをずらし、一斉チャープを避ける")],
            ["ACOUSTIC_MAX_CONCURRENT_SUBBANDS", "4",
             doc.t("splits cohorts across frequency lanes; a no-op until the band widens",
                   "コホートを周波数レーンに分割。帯域を広げるまでは無効")],
        ],
        widths=[0.42, 0.13, 0.45],
        size=8.2,
    )
    doc.callout(
        doc.t("Honest caveat", "正直な注意点"),
        doc.t("The software allows ~50 co-located pairs, but ~50 pairs sharing one ~800 Hz band "
              "in one room is acoustically contended - real reliability is a physical-device "
              "question. The path to 10,000 is config + Redis/shared presence + sticky "
              "multi-node WS + staged load testing.",
              "ソフトウェアは ~50 の近接ペアを許容しますが、1部屋で ~800 Hz 帯域を共有する ~50 ペアは"
              "音響的に混雑します - 実際の信頼性は端末依存の問題です。10,000 への道は、設定 + "
              "Redis/共有プレゼンス + スティッキーな複数ノード WS + 段階的負荷試験です。"),
        "warn",
    )


def qa_section(doc: Doc) -> None:
    doc.section(
        doc.t("11 / Q&A", "11 / Q&A"),
        doc.t("Multi-device pairing, answered", "複数端末ペアリング Q&A"),
        doc.t(
            "The questions testers ask most about pairing many phones at once - and what "
            "the current code actually does.",
            "多数の端末を同時にペアリングする際に最もよく聞かれる質問と、現行コードの実際の"
            "挙動です。",
        ),
    )
    doc.cards([
        (doc.t("A+B and C+D - how is A+C avoided?", "A+B と C+D - A+C はどう防ぐ?"),
         doc.t("The primary disambiguator is reciprocal signatures, not who is nearby. A heard "
               "B's coded chirp and B heard A's, so A+C never match. Bump-time (within 4,000 ms) "
               "is a gate and tie-break only.",
               "主判定は相互署名であり、誰が近いかではありません。A は B の符号化チャープを、B は "
               "A のものを聞いたので A+C は一致しません。バンプ時刻(4,000 ms 以内)はゲートと"
               "同点処理のみです。")),
        (doc.t("What if one device taps Connect later?", "片方が遅れて接続を押したら?"),
         doc.t("A cohort's join window is 1,800 ms with one 1,800 ms extension (~3.6 s total). "
               "Tap within it and you join the same cohort; tap after it starts and you land in "
               "a different concurrent cohort. A device left alone fails with no_nearby_partner.",
               "コホートの参加窓は 1,800 ms で、1回 1,800 ms 延長されます(合計 ~3.6 秒)。"
               "その間なら同じコホートに、開始後なら別の並行コホートに入ります。1台だけ残ると "
               "no_nearby_partner で失敗します。")),
        (doc.t("Do groups in different rooms interfere?", "別室のグループは干渉する?"),
         doc.t("No. Logical: pairing is gated by reciprocal coded signatures, so a stray chirp "
               "carries the wrong signature and fails the match. Physical: ultrasound is "
               "directional and attenuates fast, and cohorts are start-staggered and sub-banded.",
               "しません。論理面: ペアリングは相互符号化署名でゲートされ、迷い込んだチャープは誤った"
               "署名なので一致に失敗します。物理面: 超音波は指向性が高く減衰が速く、コホートは開始を"
               "ずらしサブバンド化されます。")),
        (doc.t("What is the maximum, and what shows at the cap?", "上限は? 上限到達時の表示は?"),
         doc.t("The hard ceiling today is 100 simultaneous in-ceremony participants (~50 pairs), "
               "a single-node in-memory bound. A device tapping Connect at the cap gets a clean "
               "capacity_reached and can retry or use QR - nothing pairs incorrectly.",
               "現在の硬い天井はセレモニー同時参加 100 人(~50 ペア)で、単一ノードのメモリ上限です。"
               "上限時に接続を押した端末は capacity_reached を受け取り、再試行か QR を使えます - "
               "誤ったペアリングは起きません。")),
    ])


def state_machine_section(doc: Doc) -> None:
    doc.section(
        doc.t("12 / STATE MACHINE", "12 / 状態機械"),
        doc.t("The UI state machine and the control gate", "UI状態機械と操作ゲート"),
        doc.t(
            "The interface is a small explicit state machine. The single most important "
            "rule is that the transfer dock only exists after a verified connection.",
            "インターフェースは小さな明示的状態機械です。最も重要な原則は、転送ドックが検証済みの"
            "接続が成立した後にだけ存在することです。",
        ),
    )
    doc.diagram(diagrams.OUT_DIR / f"diagram-state-machine-{doc.locale}.png",
                caption=doc.t("Figure 3 - UI state machine and the control gate",
                              "図3 - UI状態機械と操作ゲート"),
                max_h=255)
    doc.para(doc.t(
        "The runtime drives the root element's data-mode through lobby -> intent -> verifying "
        "-> connected -> disconnecting; transfer is tracked as a progress object rather than "
        "its own mode. The gate in AppView.renderTray() is the enforced version of \"trust "
        "before controls\":",
        "ランタイムはルート要素の data-mode を lobby -> intent -> verifying -> connected -> "
        "disconnecting と遷移させます。転送は独自のモードではなく進捗オブジェクトとして追跡します。"
        "AppView.renderTray() のゲートは「信頼が先、操作は後」を強制する実装です。"))
    doc.code(
        "const connected = state.mode === \"connected\" || state.mode === \"disconnecting\";\n"
        "this.nodes.tray.hidden = !connected;  // the dock exists only after a verified link")
    doc.callout(
        doc.t("Trust before controls", "信頼が先、操作は後"),
        doc.t("Send / receive / chat are never first-screen affordances - the dock appears only "
              "once a reciprocal, proximity-verified connection exists.",
              "送信・受信・チャットを初期画面に置くことはありません - ドックは相互かつ近接検証済みの"
              "接続が成立して初めて現れます。"),
        "good",
    )


def security_section(doc: Doc) -> None:
    doc.section(
        doc.t("13 / SECURITY", "13 / セキュリティ"),
        doc.t("The security model", "セキュリティモデル"),
        doc.t(
            "The client trusts only direct user gestures in the current tab and the file "
            "handles the user picked. It distrusts peer-declared names, MIME types, and any "
            "message/SDP/ICE outside the expected pairing session or schema.",
            "クライアントが信頼するのは、現在のタブでの直接のユーザー操作と、ユーザーが選んだ"
            "ファイルハンドルだけです。相手が申告した名前や MIME タイプ、想定されたペアリング"
            "セッションやスキーマ外のメッセージ/SDP/ICE は信頼しません。",
        ),
    )
    doc.h2(doc.t("Frontend hardening", "フロントエンドの堅牢化"))
    doc.bullets([
        doc.t("XSS-safe previews: peer-declared dangerous MIME (text/html, image/svg+xml, any "
              "text/*, XML) are download-only and never opened in-page. Only images, video, and "
              "PDF are previewable.",
              "XSS安全プレビュー: 相手申告の危険な MIME(text/html・image/svg+xml・各種 text/*・"
              "XML)はダウンロード専用で、ページ内では開きません。プレビュー可能なのは画像・動画・"
              "PDF のみです。"),
        doc.t("No object-URL leaks: received-file object URLs are revoked after use, and file "
              "names are escaped before rendering.",
              "オブジェクトURLのリークなし: 受信ファイルのオブジェクトURLは使用後に失効させ、"
              "ファイル名は表示前にエスケープします。"),
    ])
    doc.h2(doc.t("Backend hardening", "バックエンドの堅牢化"))
    doc.bullets([
        doc.t("Enforces allowed origins, rejects binary frames, caps payloads (ws maxPayload = "
              "MAX_JSON_BYTES), and schema-validates every message.",
              "許可オリジンを強制し、バイナリフレームを拒否、ペイロードを上限化(ws maxPayload = "
              "MAX_JSON_BYTES)し、全メッセージをスキーマ検証します。"),
        doc.t("Rate-limits per IP and per client, mints only ephemeral TURN credentials, and "
              "redacts secrets in logs (authorization, token, credential, iceServers, sdp).",
              "IP単位・クライアント単位でレート制限し、一時的な TURN 認証情報のみを発行、ログ内の"
              "機密(authorization・token・credential・iceServers・sdp)を秘匿します。"),
        doc.t("With proximity analysis live, the server blocks RTC/chat/path/transfer routing "
              "until both peers reach a verified decision (score >= 55% + mandatory evidence).",
              "近接解析が有効なとき、両者が verified に至るまで RTC/チャット/経路/転送のルーティングを"
              "遮断します(スコア 55% 以上 + 必須証拠)。"),
    ])
    doc.h2(doc.t("Diagnostics access", "診断アクセス"))
    doc.para(doc.t(
        "The operator dashboard reads one authenticated endpoint, GET /api/diagnostics-public, "
        "which requires the METRICS_API_TOKEN bearer. The payload is metadata-only - never TURN "
        "credentials, QR tokens, raw microphone audio, or file bytes.",
        "運用ダッシュボードは1つの認証付きエンドポイント GET /api/diagnostics-public だけを読みます。"
        "METRICS_API_TOKEN のベアラーが必要です。ペイロードはメタデータのみで、TURN 認証情報・QR "
        "トークン・生のマイク音声・ファイルのバイトは一切含みません。"))


def operations_section(doc: Doc) -> None:
    doc.section(
        doc.t("14 / OPERATIONS", "14 / 運用"),
        doc.t("The operations dashboard", "運用ダッシュボード"),
        doc.t(
            "admin/index.html (driven by readiness.js via diagnostics-api.js) gives operators "
            "a read-only view of fleet health and live pairing telemetry. It never opens its "
            "own microphone.",
            "admin/index.html(diagnostics-api.js 経由で readiness.js が駆動)は、運用者に対し"
            "システム健全性とライブのペアリング計測を読み取り専用で提供します。自分のマイクを"
            "開くことはありません。",
        ),
    )
    doc.cards([
        (doc.t("Readiness tab", "Readiness タブ"),
         doc.t("Environment and health summary from /readyz - which capabilities and "
               "credentials the live deployment actually has.",
               "/readyz からの環境・健全性サマリー - 稼働環境が実際に持つ機能と認証情報を示します。")),
        (doc.t("Live testing tab", "ライブテスト タブ"),
         doc.t("Bounded device/pair/cohort telemetry from /api/diagnostics-public, plus "
               "single-device acoustic diagnostics via admin:monitor:*.",
               "/api/diagnostics-public からの有界な端末/ペア/コホート計測と、admin:monitor:* に"
               "よる単一端末の音響診断です。")),
    ])
    doc.para(doc.t(
        "admin/diagnostics.html is now just a redirect to admin/index.html?tab=live. The "
        "dashboard surfaces only metadata, so an operator can watch readiness and live cohorts "
        "without ever touching a file byte or a credential.",
        "admin/diagnostics.html は現在 admin/index.html?tab=live へのリダイレクトです。"
        "ダッシュボードはメタデータのみを表示するため、運用者はファイルのバイトや認証情報に"
        "一切触れずに準備状況とライブコホートを監視できます。"))


def limitations_section(doc: Doc) -> None:
    doc.section(
        doc.t("15 / LIMITS", "15 / 制限"),
        doc.t("Limits and honest caveats", "制限と正直な注意点"),
        doc.t(
            "WebDrop is deliberately scoped. These are the current, real limits - stated "
            "plainly so expectations match the code.",
            "WebDrop は意図的に範囲を絞っています。以下は現在の実際の制限で、期待がコードと"
            "一致するよう率直に記します。",
        ),
    )
    doc.bullets([
        doc.t("Session cap: each send and receive session is capped at 500 MB "
              "(DEFAULT_SESSION_CAP_BYTES); relay (TURN) paths are held to the same ceiling.",
              "セッション上限: 各送受信セッションは 500 MB(DEFAULT_SESSION_CAP_BYTES)に制限され、"
              "リレー(TURN)経路も同じ天井に従います。"),
        doc.t("Concurrency: ~100 simultaneous in-ceremony participants (~50 pairs) on a single "
              "in-memory node; reaching 10,000 needs Redis + multi-node sticky WS + load testing.",
              "並行性: 単一メモリノードでセレモニー同時参加 ~100 人(~50 ペア)。10,000 到達には "
              "Redis + 複数ノードのスティッキー WS + 負荷試験が必要です。"),
        doc.t("Acoustic reliability is physical-device dependent: band, gain, slot length, and "
              "orientation effects must be re-measured on real phones after any acoustic change.",
              "音響の信頼性は端末依存です: 帯域・ゲイン・スロット長・向きの影響は、音響を変更する"
              "たびに実機で再測定する必要があります。"),
        doc.t("Platform limits: HTTPS/secure origin is mandatory for mic/motion/WebRTC; iOS "
              "Safari uses a capped in-memory Blob for large receives instead of IndexedDB.",
              "プラットフォーム制限: マイク/モーション/WebRTC には HTTPS(secure origin)が必須です。"
              "iOS Safari は大きな受信に IndexedDB ではなく上限付きのメモリ Blob を使います。"),
    ])
    doc.callout(
        doc.t("At the cap, nothing breaks", "上限でも壊れない"),
        doc.t("A device that taps Connect when the ceiling is full gets a clean capacity_reached "
              "before any cohort is mutated; it can retry a moment later or fall back to QR. 100 "
              "is a safe default, not a product limit.",
              "天井が満員のときに接続を押した端末は、どのコホートも変更される前に capacity_reached "
              "を受け取ります。少し待って再試行するか QR にフォールバックできます。100 は安全な既定値"
              "であって製品上の限界ではありません。"),
        "note",
    )


def main() -> None:
    fonts = register_fonts()
    for locale in ("en", "ja"):
        diagrams.render_all(locale)
        output = OUTPUT_DIR / f"webdrop-demo-{locale}.pdf"
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        c = canvas.Canvas(str(output), pagesize=A4, pageCompression=1)
        c.setTitle(
            "WebDrop In-Depth Guide" if locale == "en" else "WebDrop 詳細ガイド"
        )
        c.setAuthor("WebDrop")
        c.setSubject(f"WebDrop {APP_VERSION} architecture, technology, and proximity guide")
        doc = Doc(c, locale, fonts)
        build(doc)
        doc.finish()
        c.save()
        print(f"wrote {output} ({doc.page_number} pages)")


if __name__ == "__main__":
    main()
