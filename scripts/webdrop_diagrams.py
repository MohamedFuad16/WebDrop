#!/usr/bin/env python3
"""High-resolution diagram renderers for the WebDrop in-depth guide PDFs.

Each renderer draws a clean vector-style figure with PIL at a high scale factor
and writes a PNG. Labels are locale-aware (English / Japanese) and all text uses
the bundled Source Han Sans JP face, which carries both Latin and CJK glyphs, so
the same renderer produces correct EN and JA figures (no tofu boxes).
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT_PATH = ROOT / "assets/fonts/SourceHanSansJP-Normal-static.ttf"
OUT_DIR = ROOT / "tmp/pdf-assets"

SCALE = 3

# Palette (matches the PDF design system).
INK = (22, 24, 29)
MUTED = (98, 104, 115)
WHITE = (255, 255, 255)
PAPER = (247, 248, 250)
LINE = (210, 214, 221)
BLUE = (55, 127, 244)
BLUE_SOFT = (234, 242, 255)
MINT = (40, 168, 122)
MINT_SOFT = (231, 248, 242)
LILAC = (139, 121, 232)
LILAC_SOFT = (240, 237, 255)
ROSE = (224, 92, 116)
ROSE_SOFT = (253, 237, 240)
AMBER = (201, 120, 24)
AMBER_SOFT = (255, 242, 223)


_FONT_CACHE: dict[int, ImageFont.FreeTypeFont] = {}


def font(size: int) -> ImageFont.FreeTypeFont:
    key = size * SCALE
    if key not in _FONT_CACHE:
        _FONT_CACHE[key] = ImageFont.truetype(str(FONT_PATH), key)
    return _FONT_CACHE[key]


def S(v: float) -> int:
    return int(round(v * SCALE))


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    max_w = max_w * SCALE if max_w < 4000 else max_w
    ascii_like = sum(ord(c) < 128 for c in text) / max(len(text), 1) > 0.6
    lines: list[str] = []
    if ascii_like:
        words = text.split(" ")
        cur = ""
        for w in words:
            cand = w if not cur else f"{cur} {w}"
            if draw.textlength(cand, font=fnt) <= max_w:
                cur = cand
            else:
                if cur:
                    lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
    else:
        cur = ""
        for ch in text:
            cand = f"{cur}{ch}"
            if draw.textlength(cand, font=fnt) <= max_w or not cur:
                cur = cand
            else:
                lines.append(cur)
                cur = ch
        if cur:
            lines.append(cur)
    return lines


def box(draw, x, y, w, h, fill, outline=None, radius=10, width=2):
    draw.rounded_rectangle(
        [S(x), S(y), S(x + w), S(y + h)],
        radius=S(radius),
        fill=fill,
        outline=outline,
        width=S(width) if outline else 0,
    )


def text_block(draw, cx, cy, lines, fnt, fill, leading, center=True, line_x=None):
    total = len(lines) * leading
    yy = cy - total / 2
    for line in lines:
        if center:
            w = draw.textlength(line, font=fnt) / SCALE
            draw.text((S(cx - w / 2), S(yy)), line, font=fnt, fill=fill)
        else:
            draw.text((S(line_x), S(yy)), line, font=fnt, fill=fill)
        yy += leading


def titled_box(draw, x, y, w, h, title, body, fill, outline, accent, title_size=11, body_size=8.4):
    box(draw, x, y, w, h, fill, outline, radius=10, width=2)
    tf = font(title_size)
    bf = font(body_size)
    pad = 9
    title_lines = wrap(draw, title, tf, w - 2 * pad)
    body_lines = wrap(draw, body, bf, w - 2 * pad) if body else []
    t_lead = title_size * 1.2
    b_lead = body_size * 1.32
    block_h = len(title_lines) * t_lead + (4 if body_lines else 0) + len(body_lines) * b_lead
    yy = y + (h - block_h) / 2 + t_lead * 0.78
    for line in title_lines:
        lw = draw.textlength(line, font=tf) / SCALE
        draw.text((S(x + (w - lw) / 2), S(yy - t_lead * 0.78)), line, font=tf, fill=accent)
        yy += t_lead
    if body_lines:
        yy += 4
        for line in body_lines:
            lw = draw.textlength(line, font=bf) / SCALE
            draw.text((S(x + (w - lw) / 2), S(yy - b_lead * 0.78)), line, font=bf, fill=MUTED)
            yy += b_lead


def arrow(draw, p1, p2, color, width=2.0, head=8.0, dashed=False, double=False):
    x1, y1 = p1
    x2, y2 = p2
    ang = math.atan2(y2 - y1, x2 - x1)
    # shorten so the head sits at the endpoint
    end = (x2 - math.cos(ang) * head * 0.5, y2 - math.sin(ang) * head * 0.5)
    start = p1
    if double:
        start = (x1 + math.cos(ang) * head * 0.5, y1 + math.sin(ang) * head * 0.5)
    if dashed:
        _dashed_line(draw, start, end, color, width)
    else:
        draw.line([S(start[0]), S(start[1]), S(end[0]), S(end[1])], fill=color, width=S(width))
    _head(draw, p2, ang, color, head)
    if double:
        _head(draw, p1, ang + math.pi, color, head)


def _head(draw, tip, ang, color, head):
    x, y = tip
    left = (x - math.cos(ang - 0.5) * head, y - math.sin(ang - 0.5) * head)
    right = (x - math.cos(ang + 0.5) * head, y - math.sin(ang + 0.5) * head)
    draw.polygon(
        [(S(x), S(y)), (S(left[0]), S(left[1])), (S(right[0]), S(right[1]))],
        fill=color,
    )


def _dashed_line(draw, p1, p2, color, width, dash=7, gap=5):
    x1, y1 = p1
    x2, y2 = p2
    total = math.hypot(x2 - x1, y2 - y1)
    if total == 0:
        return
    dx = (x2 - x1) / total
    dy = (y2 - y1) / total
    d = 0.0
    while d < total:
        a = (x1 + dx * d, y1 + dy * d)
        b = (x1 + dx * min(d + dash, total), y1 + dy * min(d + dash, total))
        draw.line([S(a[0]), S(a[1]), S(b[0]), S(b[1])], fill=color, width=S(width))
        d += dash + gap


def label(draw, cx, cy, text, fnt, fill, bg=None, pad=4, center=True):
    w = draw.textlength(text, font=fnt) / SCALE
    asc = fnt.size / SCALE
    if bg is not None:
        draw.rounded_rectangle(
            [S(cx - w / 2 - pad), S(cy - pad), S(cx + w / 2 + pad), S(cy + asc + pad)],
            radius=S(4),
            fill=bg,
        )
    x = cx - w / 2 if center else cx
    draw.text((S(x), S(cy)), text, font=fnt, fill=fill)


def _canvas(w, h):
    img = Image.new("RGB", (S(w), S(h)), WHITE)
    return img, ImageDraw.Draw(img)


def _save(img, name):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / name
    img.save(out, optimize=True)
    return out


# --------------------------------------------------------------------------- #
# Diagram 1: three-lane architecture
# --------------------------------------------------------------------------- #
def architecture(locale: str) -> Path:
    ja = locale == "ja"
    W, H = 600, 462
    img, d = _canvas(W, H)

    tl = {
        "peerA": ("Peer A browser", "ブラウザ A"),
        "peerB": ("Peer B browser", "ブラウザ B"),
        "lane3a": ("Lane 3 - WebRTC P2P", "レーン3 - WebRTC P2P"),
        "lane3b": ("encrypted DTLS/SCTP - 256 KiB chunks", "暗号化 DTLS/SCTP - 256 KiB チャンク"),
        "lane1": ("Lane 1 - Static delivery (HTTPS)", "レーン1 - 静的配信 (HTTPS)"),
        "host": ("Static host / CDN", "静的ホスト / CDN"),
        "hostb": ("index.html, admin/, js/ modules, css/, service-worker.js", "index.html, admin/, js/, css/, service-worker.js"),
        "loads": ("loads app (HTTPS)", "アプリを読み込む (HTTPS)"),
        "lane2": ("Lane 2 - Signaling (WSS - metadata only)", "レーン2 - シグナリング (WSS・メタデータのみ)"),
        "nginx": ("nginx", "nginx"),
        "nginxb": ("TLS termination - ws to wss - /ws", "TLS終端・ws→wss・/ws"),
        "node": ("Node signaling hub (127.0.0.1:8080)", "Node シグナリングハブ (127.0.0.1:8080)"),
        "nodeb": ("presence, invites, SDP/ICE, QR tokens, concurrent cohorts, TURN proxy", "在席・招待・SDP/ICE・QRトークン・並行コホート・TURN代理"),
        "wss": ("WSS: client:hello, invite, proximity, SDP, ICE", "WSS: client:hello・招待・近接・SDP・ICE"),
        "turn": ("Cloudflare TURN", "Cloudflare TURN"),
        "turnb": ("STUN (free) + relay (metered)", "STUN(無料) + リレー(従量)"),
        "mint": ("mint ephemeral ICE creds", "一時 ICE 認証情報を発行"),
        "relay": ("relay fallback when direct ICE fails", "直接ICE失敗時はリレーへ"),
        "adm": ("Operator dashboard (admin/)", "運用ダッシュボード (admin/)"),
        "diag": ("GET /api/diagnostics-public - Bearer METRICS", "GET /api/diagnostics-public - Bearer METRICS"),
        "title": ("WebDrop three-lane architecture", "WebDrop の3レーン構成"),
    }
    t = (lambda k: tl[k][1 if ja else 0])

    f_title = font(13)
    f_lbl = font(7.6)

    label(d, W / 2, 14, t("title"), f_title, INK)

    # Peers
    titled_box(d, 26, 42, 150, 46, t("peerA"), "", WHITE, BLUE, BLUE, 11, 8)
    titled_box(d, 424, 42, 150, 46, t("peerB"), "", WHITE, BLUE, BLUE, 11, 8)

    # Lane 3 P2P arrow between peers
    arrow(d, (176, 65), (424, 65), MINT, width=3.2, head=11, double=True)
    label(d, 300, 40, t("lane3a"), f_lbl, MINT)
    label(d, 300, 70, t("lane3b"), font(7), MUTED)

    # Lane 1 band
    box(d, 26, 116, 548, 60, BLUE_SOFT, BLUE, radius=12, width=1.4)
    label(d, 38, 121, t("lane1"), font(8), BLUE, center=False)
    titled_box(d, 150, 134, 300, 36, t("host"), t("hostb"), WHITE, LINE, INK, 9.5, 7.2)
    arrow(d, (300, 88), (300, 134), BLUE, width=2.0, head=8)
    label(d, 366, 100, t("loads"), font(7), MUTED)

    # Lane 2 band
    box(d, 26, 196, 548, 92, MINT_SOFT, MINT, radius=12, width=1.4)
    label(d, 38, 201, t("lane2"), font(8), MINT, center=False)
    titled_box(d, 44, 220, 196, 58, t("nginx"), t("nginxb"), WHITE, LINE, INK, 10, 7.4)
    titled_box(d, 300, 216, 250, 66, t("node"), t("nodeb"), WHITE, LINE, INK, 9.6, 7.0)
    arrow(d, (240, 249), (300, 249), MUTED, width=2.0, head=8, double=True)
    # WSS from browser stack to nginx (label sits in the gap between lane 1 and lane 2)
    arrow(d, (300, 170), (142, 220), BLUE, width=2.0, head=8)
    label(d, 345, 181, t("wss"), font(7.2), BLUE)

    # Cloudflare TURN
    titled_box(d, 300, 312, 250, 44, t("turn"), t("turnb"), AMBER_SOFT, AMBER, AMBER, 10, 7.4)
    arrow(d, (425, 282), (425, 312), AMBER, width=2.0, head=8)
    label(d, 425, 294, t("mint"), font(6.8), AMBER)

    # Operator dashboard
    titled_box(d, 26, 312, 210, 44, t("adm"), "", WHITE, LILAC, LILAC, 9.6, 7)
    arrow(d, (131, 312), (150, 278), LILAC, width=2.0, head=8)
    label(d, 60, 300, t("diag"), font(6.6), LILAC, center=False)

    # Relay fallback (dotted) up the clear right margin to Peer B; label below TURN
    arrow(d, (566, 312), (566, 92), AMBER, width=1.8, head=8, dashed=True)
    label(d, 425, 364, t("relay"), font(7), AMBER)

    return _save(img, f"diagram-architecture-{locale}.png")


# --------------------------------------------------------------------------- #
# Diagram 2: UI state machine
# --------------------------------------------------------------------------- #
def state_machine(locale: str) -> Path:
    ja = locale == "ja"
    W, H = 600, 360
    img, d = _canvas(W, H)

    tl = {
        "title": ("UI state machine and the control gate", "UI状態機械と操作ゲート"),
        "lobby": ("lobby", "lobby"),
        "lobbyb": ("orbits visible", "軌道を表示"),
        "intent": ("intent", "intent"),
        "intentb": ("peer sheet open", "相手シート表示"),
        "verifying": ("verifying", "verifying"),
        "verifyingb": ("proximity ceremony", "近接セレモニー"),
        "connected": ("connected", "connected"),
        "connectedb": ("dock + sheets enabled", "ドック/シート有効"),
        "transfer": ("transferring", "transferring"),
        "transferb": ("progress + ACKs", "進捗 + ACK"),
        "disc": ("disconnecting", "disconnecting"),
        "discb": ("release animation", "解除アニメーション"),
        "e_select": ("peer select", "相手選択"),
        "e_swipe": ("swipe to connect", "スワイプで接続"),
        "e_match": ("reciprocal match + preflight", "相互一致 + 事前接続"),
        "e_send": ("send / receive", "送信 / 受信"),
        "e_fail": ("ceremony fails -> QR / retry", "セレモニー失敗 -> QR / 再試行"),
        "e_disc": ("disconnect or peer lost", "切断 / 相手喪失"),
        "gate": ("Gate: the transfer dock exists only when mode is connected or disconnecting -", "ゲート: 転送ドックは connected か disconnecting の時だけ存在し、"),
        "gate2": ("send / receive / chat are never first-screen controls (trust before controls).", "送信・受信・チャットは初期画面に出さない(信頼が先、操作は後)。"),
    }
    t = (lambda k: tl[k][1 if ja else 0])

    label(d, W / 2, 16, t("title"), font(13), INK)

    # node rows: top row main flow
    y0 = 64
    nodes = [
        (26, y0, 120, 56, t("lobby"), t("lobbyb"), WHITE, INK),
        (170, y0, 120, 56, t("intent"), t("intentb"), WHITE, INK),
        (314, y0, 124, 56, t("verifying"), t("verifyingb"), BLUE_SOFT, BLUE),
        (462, y0, 124, 56, t("connected"), t("connectedb"), MINT_SOFT, MINT),
    ]
    for (x, y, w, h, ti, bo, fill, accent) in nodes:
        titled_box(d, x, y, w, h, ti, bo, fill, accent, accent, 12, 7.6)

    # transferring (below connected)
    titled_box(d, 462, 180, 124, 52, t("transfer"), t("transferb"), AMBER_SOFT, AMBER, AMBER, 11, 7.4)
    # disconnecting (below verifying/connected center)
    titled_box(d, 300, 180, 138, 52, t("disc"), t("discb"), ROSE_SOFT, ROSE, ROSE, 11, 7.4)

    # transitions across top row (arrows in the gaps, labels above the boxes)
    arrow(d, (146, y0 + 28), (170, y0 + 28), INK, width=2, head=8)
    label(d, 158, 48, t("e_select"), font(6.8), MUTED)
    arrow(d, (290, y0 + 28), (314, y0 + 28), INK, width=2, head=8)
    label(d, 302, 48, t("e_swipe"), font(6.8), MUTED)
    arrow(d, (438, y0 + 28), (462, y0 + 28), INK, width=2, head=8)
    label(d, 450, 48, t("e_match"), font(6.6), MUTED)

    # connected -> transferring -> connected (vertical loop on the right)
    arrow(d, (524, y0 + 56), (524, 180), AMBER, width=2, head=8, double=True)
    label(d, 556, 150, t("e_send"), font(6.8), AMBER)

    # connected -> disconnecting
    arrow(d, (490, y0 + 56), (430, 180), ROSE, width=2, head=8)
    label(d, 442, 150, t("e_disc"), font(6.6), ROSE)

    # disconnecting -> lobby (dashed return, lower-left)
    arrow(d, (300, 188), (86, 120), ROSE, width=2, head=8, dashed=True)

    # verifying -> lobby (fail, routed below the top row)
    arrow(d, (360, 132), (120, 132), MUTED, width=1.8, head=8, dashed=True)
    label(d, 240, 138, t("e_fail"), font(6.6), MUTED)

    # gate note
    box(d, 26, 268, 560, 70, PAPER, LINE, radius=12, width=1.4)
    d.rounded_rectangle([S(40), S(282), S(48), S(324)], radius=S(4), fill=BLUE)
    gx = 62
    d.text((S(gx), S(284)), t("gate"), font=font(8.2), fill=INK)
    d.text((S(gx), S(304)), t("gate2"), font=font(8.2), fill=MUTED)

    return _save(img, f"diagram-state-machine-{locale}.png")


# --------------------------------------------------------------------------- #
# Diagram 3: reservation TDMA schedule
# --------------------------------------------------------------------------- #
def tdma(locale: str) -> Path:
    ja = locale == "ja"
    W, H = 600, 300
    img, d = _canvas(W, H)

    tl = {
        "title": ("Reservation TDMA: one window, pre-assigned slots", "予約型TDMA: 1つの窓に事前割当スロット"),
        "window": ("Ceremony window - PROXIMITY_SESSION_DURATION_MS = 3,600 ms", "セレモニー窓 - PROXIMITY_SESSION_DURATION_MS = 3,600 ms"),
        "record": ("Every phone records the whole window; it emits only in its own slot, then decodes all peers.", "各端末は窓全体を録音し、自分のスロットだけで送信、後で全員を復号。"),
        "slot": ("slot", "スロット"),
        "emit": ("emits", "送信"),
        "listen": ("others listen", "他は受聴"),
        "floor": ("~600 ms slot floor (520 ms chirp + 80 ms guard) -> floor(3600/600) = 6 slots = per-cohort cap 6", "~600 ms スロット下限(520 ms チャープ + 80 ms ガード)→ floor(3600/600)=6 = コホート上限6"),
    }
    t = (lambda k: tl[k][1 if ja else 0])

    label(d, W / 2, 14, t("title"), font(12.5), INK)
    label(d, W / 2, 38, t("window"), font(8), MUTED)

    # timeline frame
    x0, x1 = 40, 560
    yb = 70
    bh = 132
    n = 4
    slot_w = (x1 - x0) / 6  # show 4 of the 6 available slots, scaled to width
    slot_w = (x1 - x0) / n
    colors = [(BLUE, BLUE_SOFT), (MINT, MINT_SOFT), (LILAC, LILAC_SOFT), (ROSE, ROSE_SOFT)]
    names = ["A", "B", "C", "D"]
    box(d, x0 - 6, yb - 6, (x1 - x0) + 12, bh + 12, PAPER, LINE, radius=10, width=1.4)
    rh = bh / n
    for row in range(n):
        ry = yb + row * rh
        # row label (phone)
        accent, soft = colors[row]
        label(d, x0 - 22, ry + rh / 2 - 6, names[row], font(11), accent)
        for col in range(n):
            cx = x0 + col * slot_w
            active = col == row
            box(d, cx + 3, ry + 3, slot_w - 6, rh - 6,
                soft if active else WHITE, accent if active else LINE,
                radius=6, width=1.6 if active else 1.0)
            if active:
                lab = f"{names[row]} {t('emit')}"
                label(d, cx + slot_w / 2, ry + rh / 2 - 6, lab, font(8.2), accent)
        # slot index header on first row
    for col in range(n):
        cx = x0 + col * slot_w + slot_w / 2
        label(d, cx, yb - 4, f"{t('slot')} {col + 1}", font(7), MUTED)

    label(d, W / 2, 214, t("record"), font(7.8), MUTED)
    box(d, 40, 236, 520, 44, AMBER_SOFT, AMBER, radius=10, width=1.4)
    lines = wrap(d, t("floor"), font(8), 500)
    text_block(d, W / 2, 258, lines, font(8), AMBER, 13, center=True)

    return _save(img, f"diagram-tdma-{locale}.png")


def render_all(locale: str) -> dict[str, Path]:
    return {
        "architecture": architecture(locale),
        "state_machine": state_machine(locale),
        "tdma": tdma(locale),
    }


if __name__ == "__main__":
    import sys

    loc = sys.argv[1] if len(sys.argv) > 1 else "en"
    for name, path in render_all(loc).items():
        print(name, path)
