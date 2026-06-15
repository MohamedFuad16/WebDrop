#!/usr/bin/env python3
"""Generate the English and Japanese WebDrop demo guides."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Iterable, Sequence

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont


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
MARGIN = 44
CONTENT_W = PAGE_W - (MARGIN * 2)

INK = HexColor("#16181D")
MUTED = HexColor("#626873")
FAINT = HexColor("#9298A3")
BLUE = HexColor("#377FF4")
BLUE_SOFT = HexColor("#EAF2FF")
MINT = HexColor("#4CC89A")
MINT_SOFT = HexColor("#E8F8F2")
LILAC = HexColor("#8B79E8")
LILAC_SOFT = HexColor("#F0EDFF")
ROSE = HexColor("#E76880")
ROSE_SOFT = HexColor("#FDEDF0")
PAPER = HexColor("#F7F8FA")
WHITE = HexColor("#FFFFFF")
LINE = HexColor("#E3E6EB")
DARK = HexColor("#111318")


COPY = {
    "en": {
        "lang": "English edition",
        "cover_kicker": "MOBILE-FIRST NEARBY TRANSFER PROTOTYPE",
        "cover_summary": (
            "A visual and technical guide to the WebDrop 1.0.7 prototype. "
            "This document explains the product in plain language, shows every "
            "approved interface state, and records the boundary between the "
            "working local demo and the future production services."
        ),
        "overview_title": "Overview",
        "overview_intro": (
            "WebDrop is designed to make sending a file to someone nearby feel "
            "as immediate as tapping their profile. The home screen turns nearby "
            "devices into calm orbital avatars. A user chooses one person, confirms "
            "the connection with a deliberate swipe, and then gets separate controls "
            "for sending, receiving, chatting, or disconnecting."
        ),
        "overview_cards": [
            (
                "What the user sees",
                "Four rings organize nearby candidates without turning the screen "
                "into a list. The current device stays at the center. Other profiles "
                "remain static while their positions move around the rings, keeping "
                "identity readable and motion restrained.",
            ),
            (
                "What happens in the background",
                "The prototype separates coordination from file movement. Signaling "
                "only exchanges small messages such as invitations, verification "
                "telemetry, WebRTC offers, answers, and ICE candidates. File bytes "
                "are reserved for an encrypted WebRTC DataChannel.",
            ),
            (
                "Why verification exists",
                "A nearby name alone is not enough proof that the intended person is "
                "holding that device. WebDrop therefore scaffolds a proximity ceremony "
                "using QR confirmation or optional sound, motion, bump, and tilt clues. "
                "Permissions and device support can always force the safer QR fallback.",
            ),
            (
                "What this build proves",
                "Version 1.0.7 proves the mobile-first interaction, responsive orbit "
                "layout, bilingual interface, local connection simulation, transfer "
                "states, storage strategy, and replaceable service boundaries. It does "
                "not yet claim production internet signaling or managed TURN capacity.",
            ),
        ],
        "flow_title": "How a transfer works",
        "flow_intro": (
            "The following sequence describes the intended production path in simple "
            "terms. The current build locally simulates the service-dependent steps "
            "while keeping the same interfaces the backend will later implement."
        ),
        "flow_steps": [
            (
                "1",
                "Discover",
                "A signaling service announces small presence records so nearby or "
                "eligible devices can appear on the orbit. No file payload is sent.",
            ),
            (
                "2",
                "Choose and verify",
                "The sender taps one candidate and swipes to confirm. QR or optional "
                "sensor evidence helps both sides prove they mean the same nearby peer.",
            ),
            (
                "3",
                "Negotiate WebRTC",
                "The signaling adapter carries offers, answers, and ICE candidates. "
                "WebRTC then tries a direct path and can later use TURN as a relay.",
            ),
            (
                "4",
                "Move file chunks",
                "The file is divided into modest chunks, around 64 KiB by default. "
                "Backpressure keeps the DataChannel buffer from growing without limit.",
            ),
            (
                "5",
                "Store safely",
                "A worker writes received chunks to OPFS when available, then IndexedDB. "
                "Memory is only appropriate for small fallback transfers.",
            ),
            (
                "6",
                "Open or export",
                "Private browser storage and a user-visible download are separate "
                "operations. The receive sheet exposes completed files only after the "
                "local write and integrity bookkeeping finish.",
            ),
        ],
        "architecture_title": "Technology and architecture",
        "architecture_intro": (
            "The static application is intentionally split into small, replaceable "
            "parts. The browser experience can ship independently while production "
            "signaling, TURN credentials, and server policy are developed next."
        ),
        "architecture_cards": [
            (
                "index.html",
                "Semantic shell",
                "Contains accessible landmarks and component mounting points only. "
                "Business behavior stays out of the document structure.",
            ),
            (
                "CSS modules",
                "Visual system",
                "Tokens, orbit geometry, controls, sheets, transfer states, print rules, "
                "and responsive behavior are separated by responsibility.",
            ),
            (
                "Vanilla JS modules",
                "Application logic",
                "Bootstrap, state transitions, UI rendering, capabilities, proximity, "
                "signaling, WebRTC, transfer, storage, and utilities remain independent.",
            ),
            (
                "Signaling adapters",
                "Replaceable coordination",
                "The mock adapter powers this demo. A WebSocket adapter will later carry "
                "presence and RTC metadata without carrying file payloads.",
            ),
            (
                "WebRTC DataChannel",
                "Encrypted peer transport",
                "Files travel as buffered chunks between peers. Candidate statistics can "
                "classify a successful route as direct or TURN-relayed.",
            ),
            (
                "Workers and storage",
                "Large-file safety",
                "Workers keep hashing, chunk bookkeeping, and local writes away from the "
                "main UI thread. OPFS leads the capability ladder.",
            ),
        ],
        "limits_title": "Current scope and limitations",
        "limits_intro": (
            "The interface is functional as a local demonstration, but several network "
            "and browser realities still determine production success."
        ),
        "limits_cards": [
            (
                "Mock signaling",
                "Invites and RTC metadata are simulated locally. The production WSS "
                "service, authentication, presence policy, and abuse controls remain pending.",
            ),
            (
                "TURN is not provisioned",
                "Some networks cannot establish a direct path. Managed TURN credentials, "
                "relay quotas, and a conservative relayed-file size cap are future work.",
            ),
            (
                "Permissions vary",
                "Microphone and motion APIs require secure contexts, user gestures, and "
                "permission. QR remains the dependable verification fallback.",
            ),
            (
                "Storage is capability-based",
                "OPFS is preferred, IndexedDB is the fallback, and memory is limited to "
                "small files. Export can still fail independently of private storage.",
            ),
        ],
        "catalog_title": "Interface guide",
        "catalog_subtitle": "Approved WebDrop 1.0.7 UI inventory",
        "roadmap_title": "Roadmap",
        "roadmap_statement": (
            "The remaining requirements are planned to be completed by the end of this "
            "week. From next week, the project focus moves to backend and server work."
        ),
        "roadmap_cards": [
            (
                "Complete this week",
                "Finish the remaining interface requirements, responsive verification, "
                "animation polish, accessibility checks, and documentation sign-off.",
            ),
            (
                "Backend focus next week",
                "Begin production WebSocket signaling, presence and invitation policy, "
                "session authentication, managed TURN integration, and operational limits.",
            ),
            (
                "Production validation",
                "Measure direct versus relay success, test cross-network transfers, verify "
                "storage recovery, and document realistic browser and file-size support.",
            ),
        ],
        "footer": "WebDrop Demo Guide",
        "page": "Page",
    },
    "ja": {
        "lang": "日本語版",
        "cover_kicker": "モバイルファーストの近距離ファイル転送プロトタイプ",
        "cover_summary": (
            "WebDrop 1.0.7の画面と技術をまとめたデモガイドです。"
            "製品の仕組みを分かりやすく説明し、承認済みの全UI状態を紹介します。"
            "また、現在動作するローカルデモと、今後実装する本番サービスの境界も明確にします。"
        ),
        "overview_title": "概要",
        "overview_intro": (
            "WebDropは、近くにいる相手へプロフィールをタップする感覚でファイルを送るためのアプリです。"
            "ホーム画面では近くの端末を落ち着いた軌道上のアバターとして表示します。"
            "相手を選び、意図的なスワイプで接続を確認すると、送信、受信、チャット、切断の操作が個別に表示されます。"
        ),
        "overview_cards": [
            (
                "画面で見えること",
                "4本のリングで近くの候補を整理し、単純な一覧よりも位置関係を直感的に示します。"
                "自分の端末は中央に固定されます。他のプロフィール画像は静止したまま位置だけが軌道上を動くため、"
                "人物を見分けやすく、動きも控えめです。",
            ),
            (
                "裏側で行われること",
                "接続の調整とファイル本体の移動を分離しています。シグナリングでは招待、確認情報、"
                "WebRTCのオファー、アンサー、ICE候補などの小さな情報だけを交換します。"
                "ファイル本体は暗号化されたWebRTC DataChannelで送る設計です。",
            ),
            (
                "近接確認が必要な理由",
                "近くに表示された端末名だけでは、その端末を意図した相手が持っていると証明できません。"
                "そこでQR確認、または任意の音、動き、バンプ、傾きの情報を組み合わせる仕組みを用意します。"
                "権限や端末機能が使えない場合は、より確実なQR方式へ切り替えます。",
            ),
            (
                "このビルドで確認できること",
                "バージョン1.0.7では、モバイル中心の操作、レスポンシブな軌道UI、日英切替、"
                "ローカル接続シミュレーション、転送状態、保存方針、交換可能なサービス境界を確認できます。"
                "本番インターネット用シグナリングや管理TURNの完成を示すものではありません。",
            ),
        ],
        "flow_title": "ファイル転送の流れ",
        "flow_intro": (
            "以下は本番環境で想定している流れを、専門知識がなくても分かる形で説明したものです。"
            "現在のビルドでは、サーバーが必要な部分をローカルで再現し、将来のバックエンドと同じ接続口を保っています。"
        ),
        "flow_steps": [
            (
                "1",
                "端末を見つける",
                "シグナリングサービスが小さな在席情報を共有し、近くにいる候補端末を軌道上に表示します。"
                "この段階ではファイル本体を送りません。",
            ),
            (
                "2",
                "相手を選び確認する",
                "送信者が候補をタップし、スワイプで意思を確認します。QRや任意のセンサー情報を使い、"
                "双方が同じ近くの相手を選んだことを確認します。",
            ),
            (
                "3",
                "WebRTC接続を準備する",
                "シグナリングアダプターがオファー、アンサー、ICE候補を運びます。"
                "WebRTCは直接接続を試し、必要な場合は将来TURN中継を利用します。",
            ),
            (
                "4",
                "ファイルを小分けに送る",
                "ファイルを標準で約64 KiBの小さなチャンクに分割します。"
                "バックプレッシャーを管理し、DataChannelの送信待ちデータが無制限に増えないようにします。",
            ),
            (
                "5",
                "安全に保存する",
                "受信したチャンクはワーカーがOPFSへ書き込みます。利用できない場合はIndexedDBを使い、"
                "メモリ保存は小さなファイルだけの最終手段とします。",
            ),
            (
                "6",
                "開く、または書き出す",
                "ブラウザーの非公開領域への保存と、ユーザーが見える場所へのダウンロードは別の処理です。"
                "ローカル保存と整合性の記録が完了してから受信シートに表示します。",
            ),
        ],
        "architecture_title": "技術とアーキテクチャ",
        "architecture_intro": (
            "静的アプリを小さく交換可能な部品へ分割しています。"
            "ブラウザー側の体験を先に完成させ、その後で本番シグナリング、TURN認証情報、"
            "サーバーポリシーを追加できる構成です。"
        ),
        "architecture_cards": [
            (
                "index.html",
                "セマンティックな外枠",
                "アクセシブルなランドマークと各コンポーネントの配置場所だけを持ちます。"
                "業務ロジックはHTML構造へ入れません。",
            ),
            (
                "CSSモジュール",
                "視覚システム",
                "トークン、軌道、操作、シート、転送状態、印刷、レスポンシブ対応を役割別に分離します。",
            ),
            (
                "Vanilla JSモジュール",
                "アプリの処理",
                "起動、状態遷移、UI、機能判定、近接確認、シグナリング、WebRTC、転送、保存を独立させます。",
            ),
            (
                "シグナリングアダプター",
                "交換可能な調整層",
                "現在はモックがデモを動かします。将来のWebSocket版は在席情報とRTCメタデータだけを運び、"
                "ファイル本体は運びません。",
            ),
            (
                "WebRTC DataChannel",
                "暗号化された端末間転送",
                "ファイルをバッファ管理されたチャンクとして送ります。候補統計から直接接続かTURN中継かを判定できます。",
            ),
            (
                "ワーカーと保存",
                "大容量ファイルへの配慮",
                "ハッシュ、チャンク管理、ローカル書き込みをUIスレッドの外で行います。保存方式はOPFSを最優先します。",
            ),
        ],
        "limits_title": "現在の範囲と制限",
        "limits_intro": (
            "現在の画面はローカルデモとして動作しますが、本番での成功率はネットワークとブラウザーの条件に左右されます。"
        ),
        "limits_cards": [
            (
                "モックシグナリング",
                "招待とRTC情報はローカルで再現しています。本番WSS、認証、在席ポリシー、不正利用対策は今後実装します。",
            ),
            (
                "TURNは未提供",
                "直接接続できないネットワークがあります。管理TURN認証、転送量制限、"
                "中継時の保守的なファイル上限は今後の作業です。",
            ),
            (
                "権限は端末ごとに異なる",
                "マイクとモーションAPIにはHTTPS、ユーザー操作、権限が必要です。"
                "QRを確実な確認方法として常に残します。",
            ),
            (
                "保存方式は機能に応じて選ぶ",
                "OPFSを優先し、IndexedDBへ切り替えます。メモリは小容量限定です。"
                "非公開保存に成功しても書き出しだけ失敗する場合があります。",
            ),
        ],
        "catalog_title": "UIガイド",
        "catalog_subtitle": "承認済みWebDrop 1.0.7画面一覧",
        "roadmap_title": "今後の予定",
        "roadmap_statement": (
            "残りの要件は今週末までに完了する予定です。"
            "来週からはバックエンドとサーバー開発を中心に進めます。"
        ),
        "roadmap_cards": [
            (
                "今週中に完了",
                "残りのUI要件、レスポンシブ確認、アニメーション調整、アクセシビリティ確認、"
                "ドキュメントの最終承認を完了します。",
            ),
            (
                "来週からバックエンド",
                "本番WebSocketシグナリング、在席と招待のポリシー、セッション認証、"
                "管理TURN連携、運用上限の実装を開始します。",
            ),
            (
                "本番検証",
                "直接接続と中継の成功率、異なるネットワーク間の転送、保存復旧、"
                "現実的なブラウザー対応とファイル上限を検証します。",
            ),
        ],
        "footer": "WebDrop デモガイド",
        "page": "ページ",
    },
}


JP_ITEMS = {
    "app-light": ("ライトモードのホーム画面", "タイトル、端末名、4本の軌道、緩やかに表情が変わる自分のアイコン、静止した近隣候補を表示するメイン画面です。"),
    "topbar-brand": ("WebDropステータス", "転送操作を早く見せすぎず、WebDrop名と近隣検索中または接続中の状態を表示します。"),
    "topbar-device-name": ("端末名", "軌道の形状と干渉しないよう、現在の端末名をヘッダー中央に配置します。"),
    "settings-icon": ("設定アイコン", "プロフィール、リング色、言語、アプリ情報、バージョンを設定するシートを開きます。"),
    "theme-icon": ("テーマ切替", "メイン画面からライトモードとダークモードを切り替えます。"),
    "topbar-actions": ("ヘッダー操作", "設定とテーマ切替をヘッダー右上にまとめています。"),
    "orbit-empty": ("候補なしの軌道", "近くの端末を表示する前の、App Clipを参考にした4本の軌道パターンです。"),
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
    "receive-sheet": ("受信シート", "受信したデモPDFを開く操作とともに表示し、ドックのバッジへ件数を反映します。"),
    "chat-sheet": ("チャットシート", "ファイル操作とは別の専用シートで短いメッセージを送ります。"),
    "settings-sheet": ("設定シート", "プロフィール、リング、端末名、言語、アプリ情報をまとめています。"),
    "settings-profile-icons": ("プロフィールアイコン選択", "写真をアップロードする代わりに、用意されたキャラクターを横スワイプして選びます。"),
    "settings-profile-ring": ("プロフィールリング選択", "標準の白に加え、青、緑、紫、ローズのリング色を選択できます。"),
    "settings-device-name": ("端末名入力", "最後の1文字まで消しても勝手に初期値へ戻らず、自由に編集できます。"),
    "settings-language": ("言語選択", "アプリ内の全ラベルを英語と日本語で切り替えます。"),
    "settings-app-info-link": ("アプリ情報リンク", "デザイン、技術構成、軌道アニメーションの詳細を別シートへ移動します。"),
    "settings-app-version": ("アプリバージョン", "設定画面の下部に現在のプロトタイプバージョン1.0.7を表示します。"),
    "app-information-sheet": ("アプリ情報シート", "設定画面を整理したまま、プロトタイプの説明と軌道アニメーション設定を表示します。"),
    "app-dark": ("ダークモードのホーム画面", "同じ近隣端末UIを落ち着いたダークテーマで表示します。"),
}


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
    regular_candidates = [
        Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
        Path("/Library/Fonts/Arial Unicode.ttf"),
        Path("/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc"),
        Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
    ]
    bold_candidates = [
        Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
        Path("/Library/Fonts/Arial Unicode.ttf"),
        Path("/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"),
        Path("/System/Library/Fonts/ヒラギノ角ゴシック W7.ttc"),
    ]

    def register_first(name: str, candidates: Sequence[Path]) -> str | None:
        for path in candidates:
            if not path.exists():
                continue
            try:
                pdfmetrics.registerFont(TTFont(name, str(path), subfontIndex=0))
                return name
            except Exception:
                continue
        return None

    if SOURCE_HAN_SANS_JP_NORMAL.exists():
        pdfmetrics.registerFont(TTFont("SourceHanSansJP-Normal", str(SOURCE_HAN_SANS_JP_NORMAL)))
        fonts["jp_regular"] = "SourceHanSansJP-Normal"
        fonts["jp_bold"] = "SourceHanSansJP-Normal"
        return fonts

    jp_regular = register_first("WebDropJP", regular_candidates)
    jp_bold = register_first("WebDropJPBold", bold_candidates)
    if jp_regular:
        fonts["jp_regular"] = jp_regular
    if jp_bold:
        fonts["jp_bold"] = jp_bold
    elif jp_regular:
        fonts["jp_bold"] = jp_regular
    if not jp_regular:
        raise RuntimeError(
            "No embeddable Japanese font was found. Expected "
            "assets/fonts/SourceHanSansJP-Normal.otf or a Unicode system font."
        )
    return fonts


def load_inventory(locale: str) -> list[dict[str, str]]:
    inventory_path = INVENTORY_PATHS.get(locale, LEGACY_INVENTORY_PATH)
    if not inventory_path.exists() and locale == "en" and LEGACY_INVENTORY_PATH.exists():
        inventory_path = LEGACY_INVENTORY_PATH
    data = json.loads(inventory_path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("inventory", [])
    if not isinstance(data, list) or not data:
        raise ValueError(f"No screenshot inventory found in {INVENTORY_PATH}")

    items: list[dict[str, str]] = []
    for raw in data:
        if not isinstance(raw, dict):
            raise ValueError("Each screenshot inventory entry must be an object")
        name = str(raw.get("name") or Path(str(raw.get("file", ""))).stem)
        file_value = str(raw.get("file", ""))
        image_path = Path(file_value)
        if not image_path.is_absolute():
            direct = inventory_path.parent / image_path
            rooted = ROOT / image_path
            image_path = direct if direct.exists() else rooted
        if not image_path.exists():
            raise FileNotFoundError(f"Missing screenshot for {name}: {image_path}")
        items.append(
            {
                "name": name,
                "file": str(image_path),
                "label": str(raw.get("label") or name.replace("-", " ").title()),
                "description": str(raw.get("description") or ""),
            }
        )
    return items


def font_names(locale: str, fonts: dict[str, str]) -> tuple[str, str]:
    if locale == "ja":
        return fonts["jp_regular"], fonts["jp_bold"]
    return fonts["regular"], fonts["bold"]


def set_fill(c: canvas.Canvas, color: Color) -> None:
    c.setFillColor(color)


def rounded_rect(
    c: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    radius: float,
    fill: Color,
    stroke: Color | None = None,
) -> None:
    c.setFillColor(fill)
    if stroke:
        c.setStrokeColor(stroke)
        c.setLineWidth(0.8)
        c.roundRect(x, y, width, height, radius, fill=1, stroke=1)
    else:
        c.roundRect(x, y, width, height, radius, fill=1, stroke=0)


def wrap_text(text: str, font: str, size: float, max_width: float) -> list[str]:
    text = " ".join(text.split()) if " " in text else text.strip()
    if not text:
        return []

    mostly_ascii = sum(ord(ch) < 128 for ch in text) / max(len(text), 1) > 0.72
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


def draw_text_block(
    c: canvas.Canvas,
    text: str,
    x: float,
    top: float,
    width: float,
    font: str,
    size: float,
    color: Color = INK,
    leading: float | None = None,
    max_lines: int | None = None,
) -> float:
    leading = leading or size * 1.45
    lines = wrap_text(text, font, size, width)
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        while last and pdfmetrics.stringWidth(f"{last}...", font, size) > width:
            last = last[:-1]
        lines[-1] = f"{last}..."
    c.setFillColor(color)
    c.setFont(font, size)
    y = top
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return len(lines) * leading


def draw_centered_text(
    c: canvas.Canvas,
    text: str,
    center_x: float,
    top: float,
    width: float,
    font: str,
    size: float,
    color: Color = INK,
    leading: float | None = None,
) -> float:
    leading = leading or size * 1.45
    lines = wrap_text(text, font, size, width)
    c.setFillColor(color)
    c.setFont(font, size)
    y = top
    for line in lines:
        c.drawCentredString(center_x, y, line)
        y -= leading
    return len(lines) * leading


def draw_page_chrome(
    c: canvas.Canvas,
    locale: str,
    page_number: int,
    regular: str,
    bold: str,
    dark: bool = False,
) -> None:
    copy = COPY[locale]
    color = HexColor("#AEB5C0") if dark else FAINT
    line = HexColor("#2A2E37") if dark else LINE
    c.setStrokeColor(line)
    c.setLineWidth(0.7)
    c.line(MARGIN, 28, PAGE_W - MARGIN, 28)
    c.setFillColor(color)
    c.setFont(regular, 8.5)
    c.drawString(MARGIN, 15, copy["footer"])
    c.drawRightString(PAGE_W - MARGIN, 15, f"{copy['page']} {page_number}")


def page_title(
    c: canvas.Canvas,
    title: str,
    subtitle: str,
    regular: str,
    bold: str,
    number: str | None = None,
) -> float:
    y = PAGE_H - 62
    if number:
        c.setFillColor(BLUE)
        c.setFont(bold, 10)
        c.drawString(MARGIN, y, number)
        y -= 28
    c.setFillColor(INK)
    c.setFont(bold, 25)
    c.drawString(MARGIN, y, title)
    y -= 31
    subtitle_height = draw_text_block(
        c,
        subtitle,
        MARGIN,
        y,
        CONTENT_W,
        regular,
        10.5,
        MUTED,
        15,
    )
    return y - subtitle_height - 24


def draw_cover(
    c: canvas.Canvas,
    locale: str,
    page_number: int,
    regular: str,
    bold: str,
) -> None:
    copy = COPY[locale]
    c.setFillColor(DARK)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    c.setFillColor(HexColor("#1B2330"))
    c.circle(PAGE_W - 65, PAGE_H - 90, 148, fill=1, stroke=0)
    c.setStrokeColor(HexColor("#34445E"))
    c.setLineWidth(10)
    for radius in (56, 88, 120):
        c.circle(PAGE_W - 65, PAGE_H - 90, radius, fill=0, stroke=1)

    c.setFillColor(MINT)
    c.circle(MARGIN + 7, PAGE_H - 71, 7, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont(bold, 12)
    c.drawString(MARGIN + 22, PAGE_H - 75, "WebDrop")

    c.setFillColor(HexColor("#8DA0B9"))
    c.setFont(bold, 9)
    c.drawString(MARGIN, PAGE_H - 205, copy["cover_kicker"])

    c.setFillColor(WHITE)
    c.setFont(bold, 42)
    c.drawString(MARGIN, PAGE_H - 270, "WebDrop")
    c.setFont(bold, 29)
    c.drawString(MARGIN, PAGE_H - 312, "Demo Guide")

    c.setFillColor(BLUE)
    c.roundRect(MARGIN, PAGE_H - 360, 91, 28, 14, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont(bold, 9)
    c.drawCentredString(MARGIN + 45.5, PAGE_H - 350, "VERSION 1.0.7")

    rounded_rect(
        c,
        MARGIN,
        170,
        CONTENT_W,
        200,
        18,
        HexColor("#1C2028"),
        HexColor("#303642"),
    )
    c.setFillColor(HexColor("#CAD2DE"))
    draw_text_block(
        c,
        copy["cover_summary"],
        MARGIN + 24,
        332,
        CONTENT_W - 48,
        regular,
        13 if locale == "en" else 12.5,
        HexColor("#CAD2DE"),
        22,
    )
    c.setFillColor(HexColor("#768396"))
    c.setFont(regular, 10)
    c.drawString(MARGIN + 24, 195, copy["lang"])
    draw_page_chrome(c, locale, page_number, regular, bold, dark=True)
    c.showPage()


def draw_overview(
    c: canvas.Canvas,
    locale: str,
    page_number: int,
    regular: str,
    bold: str,
) -> None:
    copy = COPY[locale]
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    y = page_title(
        c,
        copy["overview_title"],
        copy["overview_intro"],
        regular,
        bold,
        "01 / PRODUCT",
    )
    if locale == "en":
        y -= 18

    card_gap = 12
    card_w = (CONTENT_W - card_gap) / 2
    card_h = 210
    colors = [(BLUE_SOFT, BLUE), (MINT_SOFT, MINT), (LILAC_SOFT, LILAC), (ROSE_SOFT, ROSE)]
    for index, (title, body) in enumerate(copy["overview_cards"]):
        col = index % 2
        row = index // 2
        x = MARGIN + col * (card_w + card_gap)
        card_y = y - card_h - row * (card_h + card_gap)
        fill, accent = colors[index]
        rounded_rect(c, x, card_y, card_w, card_h, 14, WHITE, LINE)
        c.setFillColor(fill)
        c.circle(x + 26, card_y + card_h - 28, 11, fill=1, stroke=0)
        c.setFillColor(accent)
        c.circle(x + 26, card_y + card_h - 28, 4, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont(bold, 12)
        c.drawString(x + 44, card_y + card_h - 33, title)
        draw_text_block(
            c,
            body,
            x + 18,
            card_y + card_h - 62,
            card_w - 36,
            regular,
            9.3 if locale == "en" else 9,
            MUTED,
            14.4,
        )

    draw_page_chrome(c, locale, page_number, regular, bold)
    c.showPage()


def draw_flow(
    c: canvas.Canvas,
    locale: str,
    page_number: int,
    regular: str,
    bold: str,
) -> None:
    copy = COPY[locale]
    c.setFillColor(WHITE)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    y = page_title(
        c,
        copy["flow_title"],
        copy["flow_intro"],
        regular,
        bold,
        "02 / EXPERIENCE",
    )
    row_h = 86
    line_x = MARGIN + 22
    c.setStrokeColor(HexColor("#C8D9F8"))
    c.setLineWidth(3)
    c.line(line_x, y - 18, line_x, y - (row_h * 5) - 35)

    for index, (number, title, body) in enumerate(copy["flow_steps"]):
        top = y - index * row_h
        c.setFillColor(BLUE if index < 3 else MINT)
        c.circle(line_x, top - 18, 15, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont(bold, 9)
        c.drawCentredString(line_x, top - 21.5, number)
        c.setFillColor(INK)
        c.setFont(bold, 12)
        c.drawString(MARGIN + 52, top - 11, title)
        draw_text_block(
            c,
            body,
            MARGIN + 52,
            top - 31,
            CONTENT_W - 52,
            regular,
            9.4 if locale == "en" else 9,
            MUTED,
            14,
            3,
        )

    draw_page_chrome(c, locale, page_number, regular, bold)
    c.showPage()


def draw_architecture(
    c: canvas.Canvas,
    locale: str,
    page_number: int,
    regular: str,
    bold: str,
) -> None:
    copy = COPY[locale]
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    y = page_title(
        c,
        copy["architecture_title"],
        copy["architecture_intro"],
        regular,
        bold,
        "03 / SYSTEM",
    )
    gap = 12
    card_w = (CONTENT_W - gap) / 2
    card_h = 164
    for index, (eyebrow, title, body) in enumerate(copy["architecture_cards"]):
        col = index % 2
        row = index // 2
        x = MARGIN + col * (card_w + gap)
        card_y = y - card_h - row * (card_h + gap)
        rounded_rect(c, x, card_y, card_w, card_h, 13, WHITE, LINE)
        c.setFillColor(BLUE if index % 2 == 0 else LILAC)
        c.setFont(bold, 8)
        c.drawString(x + 17, card_y + card_h - 24, eyebrow.upper())
        c.setFillColor(INK)
        c.setFont(bold, 12)
        c.drawString(x + 17, card_y + card_h - 45, title)
        draw_text_block(
            c,
            body,
            x + 17,
            card_y + card_h - 70,
            card_w - 34,
            regular,
            8.9 if locale == "en" else 8.6,
            MUTED,
            13.2,
        )

    draw_page_chrome(c, locale, page_number, regular, bold)
    c.showPage()


def draw_limitations(
    c: canvas.Canvas,
    locale: str,
    page_number: int,
    regular: str,
    bold: str,
) -> None:
    copy = COPY[locale]
    c.setFillColor(WHITE)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    y = page_title(
        c,
        copy["limits_title"],
        copy["limits_intro"],
        regular,
        bold,
        "04 / BOUNDARY",
    )

    card_h = 125
    for index, (title, body) in enumerate(copy["limits_cards"]):
        card_y = y - card_h - index * (card_h + 13)
        rounded_rect(c, MARGIN, card_y, CONTENT_W, card_h, 13, PAPER, LINE)
        c.setFillColor([BLUE, MINT, LILAC, ROSE][index])
        c.roundRect(MARGIN + 16, card_y + 17, 6, card_h - 34, 3, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont(bold, 12)
        c.drawString(MARGIN + 40, card_y + card_h - 32, title)
        draw_text_block(
            c,
            body,
            MARGIN + 40,
            card_y + card_h - 58,
            CONTENT_W - 62,
            regular,
            9.5 if locale == "en" else 9,
            MUTED,
            14.2,
        )

    draw_page_chrome(c, locale, page_number, regular, bold)
    c.showPage()


def image_dimensions(path: Path) -> tuple[float, float]:
    reader = ImageReader(str(path))
    width, height = reader.getSize()
    return float(width), float(height)


def fit_image(
    path: Path,
    max_width: float,
    max_height: float,
    upscale_limit: float = 1.85,
) -> tuple[float, float]:
    width, height = image_dimensions(path)
    scale = min(max_width / width, max_height / height, upscale_limit)
    return width * scale, height * scale


def translated_item(item: dict[str, str], locale: str) -> tuple[str, str]:
    if locale == "ja":
        return JP_ITEMS.get(
            item["name"],
            (item["label"], item["description"]),
        )
    return item["label"], item["description"]


TRIMMED_CONTROL_SCREENSHOTS = {
    "settings-icon",
    "theme-icon",
}

DOCK_ICON_PRESENTATIONS = {
    "dock-send-icon",
    "dock-receive-icon",
    "dock-chat-icon",
    "dock-disconnect-icon",
}


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
        cropped = source.crop(
            (inset, inset, source.width - inset, source.height - inset)
        )
        cropped.save(output, optimize=True)
    return output


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


def group_inventory(items: Sequence[dict[str, str]]) -> list[list[dict[str, str]]]:
    solo = {"app-light", "settings-sheet", "app-dark"}
    groups: list[list[dict[str, str]]] = []
    pending: list[dict[str, str]] = []
    for item in items:
        if item["name"] in solo:
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


def draw_solo_ui_item(
    c: canvas.Canvas,
    item: dict[str, str],
    locale: str,
    regular: str,
    bold: str,
) -> None:
    label, description = translated_item(item, locale)
    path = presentation_image(item)
    image_w, image_h = fit_image(path, CONTENT_W - 36, 500, 1.35)
    image_x = (PAGE_W - image_w) / 2
    image_y = 183 + max(0, (480 - image_h) / 2)
    c.drawImage(
        str(path),
        image_x,
        image_y,
        image_w,
        image_h,
        preserveAspectRatio=True,
        mask="auto",
    )

    c.setFillColor(INK)
    c.setFont(bold, 16)
    c.drawCentredString(PAGE_W / 2, 145, label)
    draw_centered_text(
        c,
        description,
        PAGE_W / 2,
        119,
        CONTENT_W - 42,
        regular,
        9.8 if locale == "en" else 9.3,
        MUTED,
        14,
    )


def draw_paired_ui_item(
    c: canvas.Canvas,
    item: dict[str, str],
    locale: str,
    regular: str,
    bold: str,
    top: float,
    index_label: str,
) -> None:
    row_h = 296
    row_y = top - row_h
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.line(MARGIN, row_y, PAGE_W - MARGIN, row_y)

    label, description = translated_item(item, locale)
    path = presentation_image(item)
    image_area_w = 245
    image_w, image_h = fit_image(path, image_area_w, 244, 1.85)
    image_x = MARGIN + (image_area_w - image_w) / 2
    image_y = row_y + (row_h - image_h) / 2
    c.drawImage(
        str(path),
        image_x,
        image_y,
        image_w,
        image_h,
        preserveAspectRatio=True,
        mask="auto",
    )

    text_x = MARGIN + image_area_w + 25
    text_w = CONTENT_W - image_area_w - 25
    title_lines = wrap_text(label, bold, 15, text_w)
    body_lines = wrap_text(description, regular, 9.5 if locale == "en" else 9, text_w)
    title_h = len(title_lines) * 20
    body_h = len(body_lines) * 14
    total_h = 13 + title_h + 9 + body_h
    text_top = row_y + (row_h + total_h) / 2

    c.setFillColor(BLUE)
    c.setFont(bold, 8.5)
    c.drawString(text_x, text_top, index_label)
    text_top -= 23
    c.setFillColor(INK)
    c.setFont(bold, 15)
    for line in title_lines:
        c.drawString(text_x, text_top, line)
        text_top -= 20
    text_top -= 3
    c.setFillColor(MUTED)
    c.setFont(regular, 9.5 if locale == "en" else 9)
    for line in body_lines:
        c.drawString(text_x, text_top, line)
        text_top -= 14


def draw_ui_catalog(
    c: canvas.Canvas,
    locale: str,
    page_number: int,
    regular: str,
    bold: str,
    items: Sequence[dict[str, str]],
) -> int:
    copy = COPY[locale]
    groups = group_inventory(items)
    item_index = 0
    for group_index, group in enumerate(groups, 1):
        c.setFillColor(PAPER)
        c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        c.setFillColor(BLUE)
        c.setFont(bold, 9)
        c.drawString(MARGIN, PAGE_H - 56, f"05 / UI CATALOG  {group_index:02d}")
        c.setFillColor(INK)
        c.setFont(bold, 23)
        c.drawString(MARGIN, PAGE_H - 87, copy["catalog_title"])
        c.setFillColor(MUTED)
        c.setFont(regular, 9.5)
        c.drawString(MARGIN, PAGE_H - 107, copy["catalog_subtitle"])

        if len(group) == 1:
            item_index += 1
            draw_solo_ui_item(c, group[0], locale, regular, bold)
        else:
            first_top = PAGE_H - 130
            for row_index, item in enumerate(group):
                item_index += 1
                draw_paired_ui_item(
                    c,
                    item,
                    locale,
                    regular,
                    bold,
                    first_top - row_index * 296,
                    f"{item_index:02d}",
                )

        draw_page_chrome(c, locale, page_number, regular, bold)
        c.showPage()
        page_number += 1
    return page_number


def draw_roadmap(
    c: canvas.Canvas,
    locale: str,
    page_number: int,
    regular: str,
    bold: str,
) -> None:
    copy = COPY[locale]
    c.setFillColor(DARK)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(BLUE)
    c.setFont(bold, 10)
    c.drawString(MARGIN, PAGE_H - 62, "06 / NEXT")
    c.setFillColor(WHITE)
    c.setFont(bold, 31)
    c.drawString(MARGIN, PAGE_H - 105, copy["roadmap_title"])
    draw_text_block(
        c,
        copy["roadmap_statement"],
        MARGIN,
        PAGE_H - 150,
        CONTENT_W,
        bold,
        16 if locale == "en" else 15,
        HexColor("#DCE5F2"),
        25,
    )

    card_y = PAGE_H - 335
    for index, (title, body) in enumerate(copy["roadmap_cards"]):
        y = card_y - index * 143
        rounded_rect(
            c,
            MARGIN,
            y - 112,
            CONTENT_W,
            120,
            14,
            HexColor("#1C2028"),
            HexColor("#303642"),
        )
        c.setFillColor([BLUE, MINT, LILAC][index])
        c.circle(MARGIN + 27, y - 23, 8, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont(bold, 12)
        c.drawString(MARGIN + 48, y - 28, title)
        draw_text_block(
            c,
            body,
            MARGIN + 48,
            y - 52,
            CONTENT_W - 70,
            regular,
            9.5 if locale == "en" else 9,
            HexColor("#B8C0CC"),
            14,
        )

    draw_page_chrome(c, locale, page_number, regular, bold, dark=True)
    c.showPage()


def build_pdf(locale: str, items: Sequence[dict[str, str]], fonts: dict[str, str]) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output = OUTPUT_DIR / f"webdrop-demo-{locale}.pdf"
    regular, bold = font_names(locale, fonts)
    c = canvas.Canvas(str(output), pagesize=A4, pageCompression=1)
    c.setTitle("WebDrop Demo Guide" if locale == "en" else "WebDrop デモガイド")
    c.setAuthor("WebDrop")
    c.setSubject("WebDrop 1.0.7 interface and architecture guide")

    page_number = 1
    draw_cover(c, locale, page_number, regular, bold)
    page_number += 1
    draw_overview(c, locale, page_number, regular, bold)
    page_number += 1
    draw_flow(c, locale, page_number, regular, bold)
    page_number += 1
    draw_architecture(c, locale, page_number, regular, bold)
    page_number += 1
    draw_limitations(c, locale, page_number, regular, bold)
    page_number += 1
    page_number = draw_ui_catalog(c, locale, page_number, regular, bold, items)
    draw_roadmap(c, locale, page_number, regular, bold)

    c.save()
    return output


def main() -> None:
    fonts = register_fonts()
    items_by_locale = {locale: load_inventory(locale) for locale in ("en", "ja")}
    outputs = [build_pdf(locale, items_by_locale[locale], fonts) for locale in ("en", "ja")]
    for locale, items in items_by_locale.items():
        print(f"Loaded {len(items)} {locale} screenshots from {INVENTORY_PATHS[locale]}")
    for output in outputs:
        print(output)


if __name__ == "__main__":
    main()
