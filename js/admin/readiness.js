import { createOperationsI18n } from "./operations-i18n.js?v=1.0.96";
import { DiagnosticsApi } from "./diagnostics-api.js?v=1.0.96";
import { apiBaseFrom, escapeHtml, formatAge, formatFrequency, formatNumber } from "./shared.js?v=1.0.96";
import {
  TEST_CASES,
  createTestRun,
  ingestTestRun,
  stopTestRun,
  summarizeTestRun,
  validateAssignments
} from "./test-runs.js?v=1.0.96";

const APP_VERSION = "1.0.96";
const DEFAULT_HTTP_BASE = "https://webdrop-wss-0618.japaneast.cloudapp.azure.com";
const DEFAULT_WS_URL = "wss://webdrop-wss-0618.japaneast.cloudapp.azure.com/ws";
const POLL_INTERVAL_MS = 1000;
const MONITOR_INTERVAL_MS = 1000;
const MONITOR_START_HZ = 18_600;
const MONITOR_END_HZ = 19_400;
// The diagnostics feed requires the metrics bearer token. On the operator's own
// machine it is auto-loaded from the gitignored js/config/local-admin-token.js;
// remote operators paste it once (kept only in sessionStorage, never committed).
const ADMIN_TOKEN_STORAGE_KEY = "webdrop.adminToken";
const TEST_RUN_STORAGE_KEY = "webdrop.adminTestRuns.v1";
const LOCAL_ADMIN_TOKEN_URL = new URL("../config/local-admin-token.js?v=1.0.96", import.meta.url);

const ADMIN_MESSAGES = {
  en: {
    documentTitle: "WebDrop Admin",
    adminSections: "Admin sections",
    language: "Language",
    readiness: "Readiness",
    liveTesting: "Live testing",
    testCases: "Test cases",
    settings: "Settings",
    checkingServer: "Checking server",
    server: "Server",
    devicesOnline: "Devices online",
    activePairs: "Active pairs",
    verifiedConnections: "Verified connections",
    verifiedReadiness: "Verified readiness",
    launchChecks: "{verified} of {total} launch checks",
    readinessExplainer: "{verified} of {total} launch-critical checks are signed off. Physical-device proof remains unverified.",
    appVersion: "App version",
    productionFrontend: "Production frontend",
    readinessTitle: "What is actually ready",
    readinessCopy: "Live infrastructure is separated from work that still needs physical device proof.",
    lastUpdated: "Last updated",
    physicalProofNote: "Items under Needs physical proof require two real devices and cannot be signed off by browser tests alone.",
    liveTitle: "Live testing",
    liveCopy: "Watch connected phones, inspect one device continuously, and understand each signal without reading raw logs.",
    serverAndDevices: "Server & devices",
    connectedDevices: "Connected devices",
    signalingConnected: "Signaling connected",
    signalingDisconnected: "Signaling disconnected",
    device: "Device",
    platform: "Platform",
    lastSeen: "Last seen",
    noDevices: "No physical devices are connected.",
    selectDeviceHelp: "Select a device to inspect it",
    continuousMonitor: "Continuous ultrasonic monitor",
    liveFrequencyMap: "Live frequency map",
    liveFrequencyMapCopy: "Actual microphone energy reported by the selected phone",
    targetBand: "Target {band}",
    quietBand: "Quiet",
    signalBand: "Signal",
    idle: "Idle",
    active: "Active",
    stopping: "Stopping",
    blocked: "Blocked",
    error: "Error",
    selectConnectedDevice: "Select a connected device",
    chooseDevice: "Choose a device",
    startMonitoring: "Start monitoring",
    startAllMonitoring: "Start all",
    stop: "Stop",
    stopAllMonitoring: "Stop all",
    monitorExplainer: "The selected phone must have opened WebDrop audio from a user tap. Monitoring continues until Stop is pressed.",
    goodRange: "Good: within expected range",
    marginalRange: "Marginal: check conditions",
    poorRange: "Poor: investigate",
    recentActivity: "Recent activity",
    eventTimeline: "Event timeline",
    clear: "Clear",
    noEvents: "No events yet.",
    showMoreEvents: "Show {count} more",
    showLess: "Show less",
    activeSessions: "Active proximity sessions",
    recentSessions: "Recent slot attempts",
    recentSessionCopy: "Finished sessions stay here briefly so you can inspect slots, evidence, and failure reasons.",
    singleDeviceTesting: "Single-device test",
    multiDeviceTesting: "Two-device test",
    singleDeviceHint: "Confirms what one phone can prove on its own: it emits the coded chirp in-band, its mic samples fast enough, and its bump/tilt sensors fire. A lone phone can't judge “did it hear a partner” (it only hears its own signal) — those reciprocal checks live in the two-device test below.",
    twoDeviceTitle: "Two-device pairing",
    twoDeviceHint: "Pick two connected phones. Each one's live frequency map and full signal readout show side-by-side, plus the reciprocal pairing outcome (did each hear the other, bump-time gap, pass/fail).",
    deviceA: "Device A",
    deviceB: "Device B",
    startBoth: "Start both",
    stopBoth: "Stop both",
    pickDeviceSlot: "Choose device {slot}.",
    pairingState: "Pairing",
    pairIdle: "Idle",
    pairInCeremony: "In ceremony",
    pairVerified: "Verified",
    pairedWith: "Paired · {name}",
    pairingWith: "Pairing · {name}",
    pairingOutcome: "Pairing outcome",
    pairingOutcomeIdle: "Pick Device A and Device B to see their live pairing result.",
    pairingOutcomeWaiting: "Waiting for a proximity ceremony between the two phones.",
    reciprocalHeard: "Reciprocal heard",
    bumpDelta: "Bump gap",
    noSessions: "No active proximity sessions.",
    sessionColumn: "Session",
    phaseColumn: "Phase",
    devicesColumn: "Devices",
    scoreColumn: "Score & band",
    timingColumn: "Timing",
    scoreLabel: "score",
    slot: "slot",
    emitted: "emitted",
    silent: "silent",
    heard: "heard",
    missed: "missed",
    insufficient: "insufficient",
    micReady: "mic",
    evidenceLabel: "evidence",
    soundShort: "snd",
    bumpShort: "bump",
    tiltShort: "tilt",
    startedAgo: "started {age}",
    endsIn: "ends in {seconds}s",
    completing: "completing",
    joinedAgo: "joined {age}",
    serverTime: "Server time",
    readyColumn: "Ready",
    proofColumn: "Needs physical proof",
    blockedColumn: "Blocked",
    laterColumn: "Later",
    noBlockers: "No production infrastructure blocker is visible right now.",
    azureSignaling: "Azure signaling",
    connected: "Connected",
    offline: "Offline",
    turnReady: "TURN ready",
    statusLive: "Live",
    statusReady: "Ready",
    statusPartial: "1-on-1 verified",
    statusProof: "Needs proof",
    statusLater: "Later",
    adminTokenNeeded: "Server is online. Paste the admin token to load live monitoring and diagnostics.",
    serverUnreachable: "Production server",
    serverUnreachableCopy: "The diagnostics endpoint is not reachable from this browser.",
    diagnosticsProtected: "Diagnostics need the operations token. Paste a valid token to continue.",
    diagnosticsMissing: "The signaling server does not have the diagnostics route deployed yet.",
    tokenPrompt: "Enter the WebDrop operations token to read live diagnostics:",
    diagnosticsUnreachable: "The signaling server could not be reached. Check connectivity and allowed origins.",
    phonesCount: "{count} phones",
    physicalDevices: "{count} physical devices",
    devicesCount: "{count} devices",
    activeCount: "{count} active",
    startedMonitor: "Monitoring {device}. Keep the phone on WebDrop and tap Connect if audio is not ready.",
    startedAllMonitors: "Monitoring {count} devices. Keep each phone on WebDrop and tap Connect once if audio is not ready.",
    stoppedMonitor: "Monitor stopped.",
    stoppedAllMonitors: "All monitors stopped.",
    stoppingMonitor: "Stopping monitor on {device}...",
    noDeviceSelected: "Select a connected phone first.",
    targetOffline: "Selected device is offline.",
    audioNotReady: "Audio is not unlocked on that phone. Open WebDrop there and tap Connect once.",
    ceremonyActive: "That phone is already inside a proximity ceremony. Try again after it finishes.",
    monitorBlocked: "The phone replied but cannot sample audio yet.",
    monitorRunning: "The phone is emitting and listening in the selected ultrasonic band once per second.",
    monitorWaitingForTap: "The phone is armed. Tap Connect once on that phone to unlock microphone, speaker, and motion. Monitoring starts automatically afterward.",
    monitorWaitingForCeremony: "Waiting for the phone's current proximity ceremony to finish. Monitoring starts automatically afterward.",
    monitorError: "The phone reported a monitor error.",
    openPhoneHint: "Open WebDrop on a phone, leave this admin tab open, then start monitoring that phone.",
    metric: "Metric",
    meaning: "Meaning",
    expected: "Expected",
    current: "Current",
    status: "Status",
    heardSignal: "Heard signal",
    heardSignalMeaning: "Can the phone hear the chirp packet in the ultrasonic band?",
    heardSignalExpected: "Good above 35 percent confidence. Marginal above 15 percent.",
    correlation: "Correlation",
    correlationMeaning: "How closely the sound matches the coded WebDrop chirp shape.",
    correlationExpected: "Good above 0.30. Marginal above 0.20.",
    energyMargin: "Energy margin",
    energyMarginMeaning: "How much louder the chirp band is than nearby noise.",
    energyMarginExpected: "Good above 8 dB. Marginal above 4.5 dB.",
    sampleRate: "Sample rate",
    sampleRateMeaning: "Audio resolution available to the phone microphone.",
    sampleRateExpected: "44.1-48 kHz is ideal. Lower rates may miss ultrasound.",
    emittedPacket: "Emitted packet",
    emittedPacketMeaning: "Whether the phone actually played the test chirp.",
    emittedPacketExpected: "Should be yes during active monitoring.",
    bumpEvidence: "Bump evidence",
    bumpEvidenceMeaning: "Latest physical bump signal from a proximity attempt.",
    bumpEvidenceExpected: "Raw bump value 10 or more awards 20 score points.",
    tiltEvidence: "Tilt evidence",
    tiltEvidenceMeaning: "Latest tilt angle from the selected phone.",
    tiltEvidenceExpected: "Must be strictly above 30 degrees.",
    yes: "Yes",
    no: "No",
    unknown: "Unknown",
    waiting: "Waiting",
    good: "Good",
    marginal: "Marginal",
    poor: "Poor",
    none: "None",
    joining: "Joining",
    running: "Running",
    failed: "Failed",
    verified: "Verified",
    notReady: "Not ready",
    readyItems: [
      ["Production signaling", "Azure WebSocket presence, routing, and diagnostics are online.", "live"],
      ["TURN credentials", "The server-side ICE credential path is implemented and ready for relay tests.", "ready"],
      ["QR fallback", "Peerless QR pairing works as the explicit fallback/manual path.", "live"],
      ["Admin operations shell", "This page now uses the production diagnostics feed and live WebSocket monitor.", "live"]
    ],
    proofItems: [
      ["Proximity ceremony", "1-on-1 pairing has worked in live runs. Multi-device and two-pair proof still pending.", "partial"],
      ["iPhone acoustic calibration", "Need repeated live tests to confirm emitted slots are heard on the other phone.", "proof"],
      ["Android acoustic calibration", "Android is no longer labeled unknown, but acoustic capture still needs real-device proof.", "proof"],
      ["WebRTC file transfer", "Needs same-room direct and TURN relay proof after proximity pairing is stable.", "proof"],
      ["View/download behavior", "Needs Android receive proof; iPhone behavior has been separately checked before.", "proof"]
    ],
    laterItems: [
      ["10,000-client load testing", "Run after the physical handshake is stable.", "later"],
      ["Multi-node signaling", "Requires shared state or sticky sessions before horizontal scale.", "later"],
      ["Long-run acoustic calibration", "Collect multiple device models and noisy-room samples.", "later"]
    ],
    proximityPolicy: "Live server policy",
    proximityTuning: "Proximity tuning",
    policyRevision: "Policy revision",
    scoreWeights: "Score weights",
    scoreWeightsCopy: "Adjust evidence points. The five weights must total exactly 100.",
    sound: "Sound",
    motion: "Motion",
    bump: "Bump",
    tilt: "Tilt",
    qr: "QR",
    minimumScore: "Minimum score",
    weightTotalLabel: "Total",
    recommendedTag: "Recommended",
    saveToServer: "Save & apply",
    timingWindows: "Timing windows",
    timingWindowsCopy: "New sessions snapshot these values; a running test is never changed halfway through.",
    pointsUnit: "points",
    lateTapGrace: "Late-tap grace",
    lateTapGraceHelp: "How long the first person's tap waits for their partner to tap before the cohort starts. Bigger = more forgiving of human timing gaps.",
    lateTapGraceRange: "5000–8000 ms · allowed 2000–15000",
    acousticWindow: "Acoustic exchange window",
    acousticWindowHelp: "How long the phones emit their coded ultrasonic chirp and keep listening. Bigger = more chances to hear each other, but a longer ceremony.",
    acousticWindowRange: "5000–8000 ms · allowed 2400–12000",
    matchSlop: "Bump match slop",
    matchSlopHelp: "After both phones prove they heard each other, how far apart their two bumps may be in time and still count as one bump. Bigger = easier to match, but looser.",
    matchSlopRange: "2500–5000 ms · allowed 500–10000",
    applyToServer: "Apply to server",
    testCasesTitle: "Test cases",
    testCasesCopy: "Assign the live phones, record a repeatable run, and keep every result tied to its exact server policy.",
    savedLocally: "Saved on this admin device",
    pairAssignments: "Pair assignments",
    recommendedMatrix: "Recommended matrix",
    chooseTestCase: "Choose a test case",
    assignPairsTwo: "Assign two phones to Pair A and two to Pair B.",
    assignPairsOne: "Assign exactly two phones to Pair A.",
    keepConditionsNote: "Keep device cases, room position, and operator roles in the run notes.",
    onePairBadge: "1 pair · 2 phones",
    twoPairsBadge: "2 pairs · 4 phones",
    attemptsBadge: "{count} attempts",
    holdTopEdge: "Hold the two phones' top edges together (near the camera).",
    holdSpeakerMic: "Put phone 1's bottom (speaker) edge against phone 2's top (mic) edge.",
    holdCrossAngle: "Cross the side edges at about 45°, alternating which phone is on top.",
    holdTwoPairs: "Run two pairs at once — keep each pair together and the pairs apart.",
    recording: "Recording",
    activeRun: "Active run",
    targetAttempts: "Target attempts",
    conditionsNotes: "Conditions / notes",
    startRecording: "Start recording",
    stopRecording: "Stop recording",
    currentEvidence: "Current evidence",
    liveResults: "Live results",
    comparison: "Comparison",
    savedRunHistory: "Saved run history",
    clearHistory: "Clear history",
    settingsTitle: "Settings",
    settingsCopy: "Tune the next proximity sessions without disturbing the live monitor or a recording already in progress.",
    serverBackedSettings: "Server-backed settings"
  },
  ja: {
    documentTitle: "WebDrop 管理",
    adminSections: "管理セクション",
    language: "言語",
    readiness: "準備状況",
    liveTesting: "ライブテスト",
    checkingServer: "サーバー確認中",
    server: "サーバー",
    devicesOnline: "オンライン端末",
    activePairs: "接続ペア",
    verifiedConnections: "確認済み接続",
    verifiedReadiness: "確認済み準備度",
    launchChecks: "リリース確認 {verified}/{total}",
    readinessExplainer: "リリース必須項目 {total} 件中 {verified} 件を確認済みです。実機証明はまだ未完了です。",
    appVersion: "アプリ版",
    productionFrontend: "本番フロント",
    readinessTitle: "実際に準備できているもの",
    readinessCopy: "稼働中のインフラと、実機で証明が必要な作業を分けて表示します。",
    lastUpdated: "更新",
    physicalProofNote: "実機証明が必要な項目は、2 台の実端末で確認するまで完了扱いにしません。",
    liveTitle: "ライブテスト",
    liveCopy: "接続中の端末を見て、1 台を継続監視し、専門用語なしで音響信号を確認します。",
    serverAndDevices: "サーバーと端末",
    connectedDevices: "接続中の端末",
    signalingConnected: "シグナリング接続済み",
    signalingDisconnected: "シグナリング未接続",
    device: "端末",
    platform: "種別",
    lastSeen: "最終確認",
    noDevices: "物理端末は接続されていません。",
    selectDeviceHelp: "端末を選ぶと監視できます",
    continuousMonitor: "超音波の継続モニター",
    liveFrequencyMap: "ライブ周波数マップ",
    liveFrequencyMapCopy: "選択端末のマイクが報告した実際の音響エネルギー",
    targetBand: "対象 {band}",
    quietBand: "静音",
    signalBand: "信号",
    idle: "待機中",
    active: "稼働中",
    stopping: "停止中",
    blocked: "ブロック",
    error: "エラー",
    selectConnectedDevice: "接続中の端末を選択",
    chooseDevice: "端末を選択",
    startMonitoring: "監視開始",
    startAllMonitoring: "全端末を監視",
    stop: "停止",
    stopAllMonitoring: "全停止",
    monitorExplainer: "選択した端末で WebDrop の音声がタップ操作から有効になっている必要があります。停止するまで監視します。",
    goodRange: "良好: 期待範囲内",
    marginalRange: "注意: 条件を確認",
    poorRange: "不良: 調査が必要",
    recentActivity: "最近の動き",
    eventTimeline: "イベントタイムライン",
    clear: "クリア",
    noEvents: "イベントはまだありません。",
    showMoreEvents: "他 {count} 件を表示",
    showLess: "表示を減らす",
    activeSessions: "近接セッション",
    recentSessions: "直近のスロット試行",
    recentSessionCopy: "終了したセッションも短時間ここに残し、スロット、証拠、失敗理由を確認できます。",
    singleDeviceTesting: "単体端末テスト",
    multiDeviceTesting: "2端末テスト",
    singleDeviceHint: "1台だけで確認できることを検証します。帯域内で符号化チャープを送信できるか、マイクの標本化が十分速いか、バンプ/傾きセンサーが反応するか。1台では「相手を聞けたか」は判断できません（自分の信号しか聞こえないため）。相互確認は下の2端末テストで行います。",
    twoDeviceTitle: "2端末ペアリング",
    twoDeviceHint: "接続中の2台を選ぶと、それぞれのライブ周波数マップと全信号の読み取りが並んで表示され、相互ペアリング結果（互いに聞こえたか、バンプ時刻差、合否）も確認できます。",
    deviceA: "端末A",
    deviceB: "端末B",
    startBoth: "両方開始",
    stopBoth: "両方停止",
    pickDeviceSlot: "端末{slot}を選択してください。",
    pairingState: "ペアリング",
    pairIdle: "待機中",
    pairInCeremony: "セレモニー中",
    pairVerified: "確認済み",
    pairedWith: "ペア · {name}",
    pairingWith: "ペアリング中 · {name}",
    pairingOutcome: "ペアリング結果",
    pairingOutcomeIdle: "端末Aと端末Bを選ぶと、ライブのペアリング結果が表示されます。",
    pairingOutcomeWaiting: "2台間の近接セレモニーを待っています。",
    reciprocalHeard: "相互受信",
    bumpDelta: "バンプ差",
    noSessions: "アクティブな近接セッションはありません。",
    sessionColumn: "セッション",
    phaseColumn: "フェーズ",
    devicesColumn: "端末",
    scoreColumn: "スコアと帯域",
    timingColumn: "タイミング",
    scoreLabel: "スコア",
    slot: "スロット",
    emitted: "送信",
    silent: "無音",
    heard: "受信",
    missed: "未受信",
    insufficient: "不十分",
    micReady: "マイク",
    evidenceLabel: "証拠",
    soundShort: "音",
    bumpShort: "バンプ",
    tiltShort: "傾き",
    startedAgo: "{age}開始",
    endsIn: "残り{seconds}秒",
    completing: "完了処理中",
    joinedAgo: "{age}参加",
    serverTime: "サーバー時刻",
    readyColumn: "準備済み",
    proofColumn: "実機証明が必要",
    blockedColumn: "ブロック",
    laterColumn: "後で対応",
    noBlockers: "現在、本番インフラのブロッカーは見えていません。",
    azureSignaling: "Azure シグナリング",
    connected: "接続済み",
    offline: "オフライン",
    turnReady: "TURN 準備済み",
    statusLive: "稼働中",
    statusReady: "準備済み",
    statusPartial: "1対1で確認済み",
    statusProof: "要実機",
    statusLater: "後で",
    adminTokenNeeded: "サーバーは稼働中です。ライブ監視と診断を読み込むには管理トークンを貼り付けてください。",
    serverUnreachable: "本番サーバー",
    serverUnreachableCopy: "このブラウザから診断エンドポイントに到達できません。",
    diagnosticsProtected: "診断には運用トークンが必要です。有効なトークンを貼り付けてください。",
    diagnosticsMissing: "シグナリングサーバーに診断ルートがまだありません。",
    tokenPrompt: "ライブ診断を表示するには WebDrop の運用トークンを入力してください:",
    diagnosticsUnreachable: "シグナリングサーバーに到達できません。接続と許可オリジンを確認してください。",
    phonesCount: "{count} 台",
    physicalDevices: "物理端末 {count} 台",
    devicesCount: "{count} 台",
    activeCount: "{count} 件",
    startedMonitor: "{device} を監視中。音声が未準備なら端末側で Connect をタップしてください。",
    startedAllMonitors: "{count} 台を監視中。各端末で WebDrop を開き、音声が未準備なら Connect を一度タップしてください。",
    stoppedMonitor: "監視を停止しました。",
    stoppedAllMonitors: "すべての監視を停止しました。",
    stoppingMonitor: "{device} の監視を停止しています...",
    noDeviceSelected: "先に接続中の端末を選んでください。",
    targetOffline: "選択した端末はオフラインです。",
    audioNotReady: "その端末の音声がまだ有効化されていません。WebDrop を開き、Connect を一度タップしてください。",
    ceremonyActive: "その端末は近接セレモニー中です。終了後に再試行してください。",
    monitorBlocked: "端末は応答しましたが、まだ音声をサンプリングできません。",
    monitorRunning: "端末は 1 秒ごとに指定した超音波帯で送信と受信を行っています。",
    monitorWaitingForTap: "端末の準備ができました。その端末で一度 Connect をタップしてマイク、スピーカー、モーションを有効にしてください。その後、監視が自動的に開始されます。",
    monitorWaitingForCeremony: "端末の現在の近接セレモニーが終了するのを待っています。終了後、監視が自動的に開始されます。",
    monitorError: "端末が監視エラーを返しました。",
    openPhoneHint: "スマホで WebDrop を開き、この管理タブを開いたまま、その端末の監視を開始してください。",
    metric: "指標",
    meaning: "意味",
    expected: "期待値",
    current: "現在",
    status: "状態",
    heardSignal: "聞こえた信号",
    heardSignalMeaning: "端末が超音波帯のチャープを聞けたか。",
    heardSignalExpected: "35%以上で良好。15%以上で注意。",
    correlation: "一致度",
    correlationMeaning: "WebDrop の音パケット形状とどれくらい一致したか。",
    correlationExpected: "0.30 以上で良好。0.20 以上で注意。",
    energyMargin: "音量差",
    energyMarginMeaning: "チャープ帯が周辺ノイズよりどれくらい強いか。",
    energyMarginExpected: "8 dB 以上で良好。4.5 dB 以上で注意。",
    sampleRate: "サンプルレート",
    sampleRateMeaning: "端末マイクの音声解像度。",
    sampleRateExpected: "44.1-48 kHz が理想。低いと超音波を取り逃がす可能性があります。",
    emittedPacket: "送信パケット",
    emittedPacketMeaning: "端末がテストチャープを実際に再生したか。",
    emittedPacketExpected: "監視中は Yes が期待値です。",
    bumpEvidence: "バンプ証拠",
    bumpEvidenceMeaning: "直近の近接試行から得たバンプ信号。",
    bumpEvidenceExpected: "生のバンプ値が10以上の場合、スコアに20点加算。",
    tiltEvidence: "傾き証拠",
    tiltEvidenceMeaning: "選択端末の直近の傾き角度。",
    tiltEvidenceExpected: "30 度を厳密に超える必要があります。",
    yes: "はい",
    no: "いいえ",
    unknown: "不明",
    waiting: "待機中",
    good: "良好",
    marginal: "注意",
    poor: "不良",
    none: "なし",
    joining: "参加中",
    running: "実行中",
    failed: "失敗",
    verified: "確認済み",
    notReady: "未準備",
    testCases: "テストケース",
    settings: "設定",
    proximityPolicy: "稼働中のサーバーポリシー",
    proximityTuning: "近接チューニング",
    proximityTuningCopy: "スコア配分と、次の近接セッションで使う時間枠を調整します。",
    policyRevision: "ポリシー改訂",
    scoreWeights: "スコア配分",
    scoreWeightsCopy: "証拠ポイントを調整します。5項目の合計は必ず100にしてください。",
    sound: "音響",
    motion: "モーション",
    bump: "バンプ",
    tilt: "傾き",
    qr: "QR",
    minimumScore: "最低スコア",
    weightTotalLabel: "合計",
    recommendedTag: "推奨",
    saveToServer: "保存して適用",
    timingWindows: "時間枠",
    timingWindowsCopy: "実行中のテストは途中で変更せず、新しいセッションから値を固定して使用します。",
    pointsUnit: "点",
    lateTapGrace: "遅延タップ猶予",
    lateTapGraceHelp: "最初の人のタップが、相手がタップするまで待つ時間です。長いほど人の操作ずれに寛容になります。",
    lateTapGraceRange: "5000〜8000 ms・許容 2000〜15000",
    acousticWindow: "音響交換時間",
    acousticWindowHelp: "各端末が符号化超音波チャープを送信し、聞き取りを続ける時間です。長いほど互いに聞こえる機会が増えますが、セレモニーも長くなります。",
    acousticWindowRange: "5000〜8000 ms・許容 2400〜12000",
    matchSlop: "バンプ時刻の許容差",
    matchSlopHelp: "両端末が相互に聞こえたと証明した後、2回のバンプの時刻差がどこまで離れても1回のバンプと見なすかです。大きいほど一致しやすいが緩くなります。",
    matchSlopRange: "2500〜5000 ms・許容 500〜10000",
    applyToServer: "サーバーへ適用",
    testCasesTitle: "テストケース",
    testCasesCopy: "接続中の端末を割り当て、再現可能な実験を記録し、結果をサーバーポリシーと一緒に保存します。",
    savedLocally: "この管理端末に保存",
    pairAssignments: "ペア割り当て",
    recommendedMatrix: "推奨テスト一覧",
    chooseTestCase: "テストケースを選択",
    assignPairsTwo: "2台をペアA、2台をペアBに割り当てます。",
    assignPairsOne: "ちょうど2台をペアAに割り当てます。",
    keepConditionsNote: "端末ケース・室内の位置・操作者の役割を実行メモに記録してください。",
    onePairBadge: "1ペア · 2台",
    twoPairsBadge: "2ペア · 4台",
    attemptsBadge: "{count} 回",
    holdTopEdge: "2台の上端（カメラ側）どうしを合わせて持ちます。",
    holdSpeakerMic: "端末1の下端（スピーカー）を端末2の上端（マイク）に当てます。",
    holdCrossAngle: "側面を約45°で交差させ、上になる端末を交互に入れ替えます。",
    holdTwoPairs: "2ペアを同時に実行し、各ペアはまとめ、ペア間は離します。",
    recording: "記録中",
    activeRun: "実行中のテスト",
    targetAttempts: "目標回数",
    conditionsNotes: "条件・メモ",
    startRecording: "記録開始",
    stopRecording: "記録停止",
    currentEvidence: "現在の証拠",
    liveResults: "ライブ結果",
    comparison: "比較",
    savedRunHistory: "保存済み履歴",
    clearHistory: "履歴を消去",
    settingsTitle: "設定",
    settingsCopy: "ライブ監視や記録中のテストに影響を与えず、次の近接セッションを調整します。",
    serverBackedSettings: "サーバー保存設定",
    readyItems: [
      ["本番シグナリング", "Azure WebSocket の在席、ルーティング、診断が稼働中です。", "live"],
      ["TURN 認証情報", "サーバー側 ICE 認証経路は実装済みで、リレーテスト可能です。", "ready"],
      ["QR フォールバック", "相手未選択 QR ペアリングは明示的なフォールバックとして動きます。", "live"],
      ["管理オペレーション画面", "このページは本番診断フィードとライブ WebSocket 監視を使います。", "live"]
    ],
    proofItems: [
      ["近接セレモニー", "1対1のペアリングは実機で成功しています。複数端末・2ペアの証明は保留中です。", "partial"],
      ["iPhone 音響調整", "送信スロットが相手端末で聞こえるか、繰り返しライブ確認が必要です。", "proof"],
      ["Android 音響調整", "Android は Unknown 表示にしませんが、音響キャプチャは実機証明が必要です。", "proof"],
      ["WebRTC ファイル転送", "近接ペアリング安定後に直接/TURN リレー転送の証明が必要です。", "proof"],
      ["表示/ダウンロード挙動", "Android 受信の証明が必要です。iPhone 側は以前に確認済みです。", "proof"]
    ],
    laterItems: [
      ["1 万クライアント負荷試験", "物理ハンドシェイクが安定してから実施します。", "later"],
      ["複数ノード化", "水平スケール前に共有状態またはスティッキーセッションが必要です。", "later"],
      ["長時間の音響調整", "複数機種と騒音環境のサンプルを集めます。", "later"]
    ]
  }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const runtime = globalThis.WEBDROP_RUNTIME_CONFIG || {};
const httpBase = apiBaseFrom(runtime.turnConfigUrl || runtime.signalingUrl) || DEFAULT_HTTP_BASE;
const wsUrl = runtime.signalingUrl || DEFAULT_WS_URL;
const diagnostics = new DiagnosticsApi({ baseUrl: httpBase });
const storedTestState = loadStoredTestState();

const state = {
  socket: null,
  socketState: "checking",
  adminId: `admin-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`,
  snapshot: null,
  readyz: null,
  serverReachable: null,
  pollTimer: 0,
  errorTimer: 0,
  polling: true,
  selectedDeviceId: "",
  multiDeviceA: "",
  multiDeviceB: "",
  activeMonitor: null,
  activeMonitors: new Map(),
  monitorTelemetry: null,
  monitorTelemetryByDevice: new Map(),
  ignoredMonitorIds: new Set(),
  localEvents: [],
  clearEventsBefore: 0,
  timelineExpanded: false,
  readinessCollapsed: new Set(["ready", "later"]),
  tokenPromptDismissed: false,
  policy: null,
  policyDraft: null,
  policyDirty: false,
  policySaving: false,
  selectedTestCaseId: storedTestState.selectedTestCaseId || TEST_CASES[0].id,
  testAssignments: storedTestState.assignments || {},
  activeTestRun: storedTestState.activeRun || null,
  testRunHistory: storedTestState.history || []
};

const i18n = createOperationsI18n(ADMIN_MESSAGES, {
  onChange: () => renderAll()
});

init();

async function init() {
  $("[data-admin-version]").textContent = APP_VERSION;
  bindEvents();
  const requestedTab = new URLSearchParams(location.search).get("tab");
  activateTab(["readiness", "live", "tests", "settings"].includes(requestedTab) ? requestedTab : "readiness");
  renderAll();
  connectAdminSocket();
  diagnostics.configure({ token: await resolveAdminToken() });
  refreshDiagnostics();
  schedulePoll();
}

async function resolveAdminToken() {
  const fromGlobal = typeof globalThis.WEBDROP_ADMIN_TOKEN === "string" ? globalThis.WEBDROP_ADMIN_TOKEN.trim() : "";
  if (fromGlobal) return fromGlobal;
  const fromSession = storedAdminToken();
  if (fromSession) return fromSession;
  return fetchLocalAdminToken();
}

function storedAdminToken() {
  try {
    return (globalThis.sessionStorage?.getItem(ADMIN_TOKEN_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

async function fetchLocalAdminToken() {
  // Silent best-effort read of the gitignored local token file. A 404 (the file
  // is absent on shared/remote machines) resolves to an empty string without a
  // console error, so remote operators simply fall through to the paste prompt.
  try {
    const response = await fetch(LOCAL_ADMIN_TOKEN_URL, { cache: "no-store" });
    if (!response.ok) return "";
    const text = await response.text();
    const match = text.match(/WEBDROP_ADMIN_TOKEN\s*=\s*["'`]([^"'`]+)["'`]/);
    return match ? match[1].trim() : "";
  } catch {
    return "";
  }
}

function promptForAdminToken() {
  if (state.tokenPromptDismissed || typeof globalThis.prompt !== "function") return "";
  const entered = globalThis.prompt(i18n.t("tokenPrompt"));
  const token = typeof entered === "string" ? entered.trim() : "";
  if (!token) {
    state.tokenPromptDismissed = true;
    return "";
  }
  try {
    globalThis.sessionStorage?.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
  } catch {
    /* sessionStorage may be unavailable; keep the token in memory via configure */
  }
  return token;
}

function bindEvents() {
  $$("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.adminTab));
  });
  $$("[data-policy-weight], [data-policy-minimum], [data-policy-timing]").forEach((input) => {
    input.addEventListener("input", () => {
      state.policyDraft = readPolicyForm();
      state.policyDirty = true;
      state.policyMessage = "";
      renderTuning();
    });
  });
  $$("[data-policy-slider]").forEach((slider) => {
    slider.addEventListener("input", () => {
      const paired = $(`[data-policy-timing="${slider.dataset.policySlider}"]`);
      if (paired) paired.value = slider.value;
      state.policyDraft = readPolicyForm();
      state.policyDirty = true;
      state.policyMessage = "";
      renderTuning();
    });
  });
  $("[data-tuning-form]")?.addEventListener("submit", applyPolicyUpdate);
  $("[data-tuning-form] button[type='submit']")?.addEventListener("click", applyPolicyUpdate);
  $("[data-monitor-device]")?.addEventListener("change", (event) => {
    selectDevice(event.target.value);
  });
  $("[data-action='monitor-start']")?.addEventListener("click", startMonitor);
  $("[data-action='monitor-stop']")?.addEventListener("click", stopMonitor);
  $("[data-action='monitor-start-all']")?.addEventListener("click", startAllMonitors);
  $("[data-action='monitor-stop-all']")?.addEventListener("click", stopAllMonitors);
  $("[data-multi-a]")?.addEventListener("change", (event) => { state.multiDeviceA = event.target.value; renderMultiDevice(); });
  $("[data-multi-b]")?.addEventListener("change", (event) => { state.multiDeviceB = event.target.value; renderMultiDevice(); });
  $("[data-action='multi-start']")?.addEventListener("click", startMultiDevice);
  $("[data-action='multi-stop']")?.addEventListener("click", stopMultiDevice);
  $("[data-action='timeline-clear']")?.addEventListener("click", () => {
    state.clearEventsBefore = Date.now();
    renderTimeline();
  });
  $("[data-action='test-start']")?.addEventListener("click", startTestRecording);
  $("[data-action='test-stop']")?.addEventListener("click", stopTestRecording);
  $("[data-action='test-clear-assignments']")?.addEventListener("click", () => {
    if (state.activeTestRun) return;
    state.testAssignments = {};
    persistTestState();
    renderTestCases();
  });
  $("[data-action='test-clear-history']")?.addEventListener("click", () => {
    if (!state.testRunHistory.length || !globalThis.confirm("Clear the saved WebDrop test run history on this admin device?")) return;
    state.testRunHistory = [];
    persistTestState();
    renderTestCases();
  });
  globalThis.addEventListener("beforeunload", () => {
    if (state.activeMonitor) sendSocket({
      type: "admin:monitor:stop",
      targetId: state.activeMonitor.targetId,
      payload: { monitorId: state.activeMonitor.monitorId }
    });
  });
}

function activateTab(name) {
  $$("[data-admin-tab]").forEach((button) => {
    const isActive = button.dataset.adminTab === name;
    button.classList.toggle("is-active", isActive);
    if (isActive) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
  $$("[data-admin-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.adminPanel === name));
  const url = new URL(location.href);
  url.searchParams.set("tab", name);
  history.replaceState(null, "", url);
}

function connectAdminSocket() {
  if (state.socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(state.socket.readyState)) return;
  setSocketState("checking");
  try {
    const socket = new WebSocket(wsUrl);
    state.socket = socket;
    socket.addEventListener("open", () => {
      setSocketState("connected");
      sendSocket({
        type: "client:hello",
        payload: {
          self: {
            id: state.adminId,
            deviceId: state.adminId,
            deviceName: "WebDrop Admin",
            deviceFamily: "admin",
            deviceLabel: "Admin dashboard"
          },
          capabilities: {
            admin: true,
            webRtc: false,
            camera: false,
            qrScanner: false,
            platform: { family: "admin", label: "Admin dashboard" }
          }
        }
      });
    });
    socket.addEventListener("message", (event) => handleSocketMessage(event.data));
    socket.addEventListener("close", () => {
      setSocketState("offline");
      if (state.activeMonitor) {
        state.activeMonitor.status = "stopped";
        state.activeMonitor = null;
        state.monitorTelemetry = null;
      }
      state.activeMonitors.clear();
      renderMonitor();
      globalThis.setTimeout(connectAdminSocket, 1500);
    });
    socket.addEventListener("error", () => setSocketState("offline"));
  } catch (error) {
    setSocketState("offline");
    showError(friendlyError(error));
  }
}

function handleSocketMessage(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return;
  }
  const envelope = unwrapSocketEnvelope(message);
  if (envelope.type === "admin:monitor:started") {
    const targetId = envelope.targetId || state.activeMonitor?.targetId || "";
    const existing = targetId ? state.activeMonitors.get(targetId) : state.activeMonitor;
    if (existing?.status === "stopping" && existing.monitorId === envelope.monitorId) {
      addLocalEvent("admin:monitor:started", {
        deviceName: envelope.deviceName,
        targetId: envelope.targetId
      });
      renderMonitor();
      return;
    }
    state.ignoredMonitorIds.delete(envelope.monitorId);
    const nextMonitor = {
      ...(existing || state.activeMonitor || {}),
      monitorId: envelope.monitorId,
      targetId,
      deviceName: envelope.deviceName,
      status: "active",
      startedAt: Date.now()
    };
    if (targetId) state.activeMonitors.set(targetId, nextMonitor);
    if (!state.selectedDeviceId || state.selectedDeviceId === targetId) state.activeMonitor = nextMonitor;
    if (state.selectedDeviceId === targetId) state.monitorTelemetry = null;
    addLocalEvent("admin:monitor:started", {
      deviceName: envelope.deviceName,
      targetId
    });
    setMonitorExplainer(i18n.t("startedMonitor", { device: friendlyDeviceName(envelope) }));
    renderMonitor();
  }
  if (envelope.type === "admin:monitor:stopped") {
    const targetId = envelope.targetId || state.activeMonitor?.targetId || "";
    addLocalEvent("admin:monitor:stopped", { targetId });
    if (targetId) state.activeMonitors.delete(targetId);
    state.monitorTelemetryByDevice.delete(targetId);
    if (!state.activeMonitor || state.activeMonitor.monitorId === envelope.monitorId || state.activeMonitor.targetId === targetId) {
      state.activeMonitor = null;
      state.monitorTelemetry = null;
    }
    if (envelope.monitorId) state.ignoredMonitorIds.add(envelope.monitorId);
    setMonitorExplainer(i18n.t("stoppedMonitor"));
    renderMonitor();
  }
  if (envelope.type === "admin:monitor:telemetry") {
    if (envelope.monitorId && state.ignoredMonitorIds.has(envelope.monitorId)) return;
    const targetId = envelope.deviceId || envelope.targetId || state.activeMonitor?.targetId || "";
    const activeForDevice = targetId ? state.activeMonitors.get(targetId) : null;
    if (activeForDevice && envelope.monitorId && envelope.monitorId !== activeForDevice.monitorId) return;
    if (targetId) state.monitorTelemetryByDevice.set(targetId, envelope);
    if (!state.selectedDeviceId || state.selectedDeviceId === targetId) state.monitorTelemetry = envelope;
    if (activeForDevice) {
      activeForDevice.status = envelope.status || "active";
      state.activeMonitors.set(targetId, activeForDevice);
      if (state.selectedDeviceId === targetId) state.activeMonitor = activeForDevice;
    }
    addLocalEvent("admin:monitor:telemetry", {
      monitorId: envelope.monitorId,
      clientId: targetId,
      deviceName: envelope.deviceName,
      status: envelope.status,
      reason: envelope.reason,
      detected: envelope.detected,
      emitted: envelope.emitted,
      startFrequencyHz: envelope.startFrequencyHz,
      endFrequencyHz: envelope.endFrequencyHz,
      sampleRate: envelope.sampleRate,
      bands: envelope.bands,
      marginDb: envelope.marginDb,
      confidence: envelope.confidence,
      bumpPoints: envelope.bumpPoints,
      tiltDegrees: envelope.tiltDegrees,
      motionSamples: envelope.motionSamples
    });
    if (!state.selectedDeviceId || state.selectedDeviceId === targetId) updateMonitorExplainerFromTelemetry(envelope);
    renderMonitor();
  }
  if (envelope.type === "route:error") {
    addLocalEvent("route:error", envelope);
    if (envelope.code === "target_offline") setMonitorExplainer(i18n.t("targetOffline"));
    else if (envelope.code === "monitor_not_available" && state.activeMonitor?.status === "stopping") {
      if (state.activeMonitor.monitorId) state.ignoredMonitorIds.add(state.activeMonitor.monitorId);
      state.activeMonitor = null;
      state.monitorTelemetry = null;
      setMonitorExplainer(i18n.t("stoppedMonitor"));
    }
    else setMonitorExplainer(envelope.code || i18n.t("error"));
    renderMonitor();
    renderTimeline();
  }
}

function unwrapSocketEnvelope(message) {
  const payload = isPlainObject(message?.payload) ? message.payload : {};
  return {
    ...message,
    ...payload,
    type: message?.type || payload.type || "",
    payload
  };
}

function sendSocket(payload) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return false;
  state.socket.send(JSON.stringify(payload));
  return true;
}

async function refreshDiagnostics() {
  // /readyz and the proximity policy are public reads: they define whether the
  // server is reachable at all. The diagnostics snapshot is token-gated, so a
  // missing/invalid admin token must NOT make a healthy server look offline —
  // it only means the authenticated live data is unavailable until a token is
  // pasted. Fetch the public reads independently of the snapshot.
  const [readyz, policyResponse] = await Promise.all([
    diagnostics.readiness().catch((error) => ({ ok: false, error: error.message })),
    diagnostics.proximityPolicy().catch(() => null)
  ]);
  state.readyz = readyz;
  const serverReachable = Boolean(readyz?.ok) || Boolean(policyResponse);

  let snapshot = null;
  let snapshotError = null;
  try {
    snapshot = await diagnostics.snapshot();
  } catch (error) {
    snapshotError = error;
    if (error.message === "unauthorized") {
      const token = promptForAdminToken();
      if (token) {
        diagnostics.configure({ token });
        return refreshDiagnostics();
      }
    }
  }

  if (snapshot) state.snapshot = snapshot;
  state.policy = normalizePolicySnapshot(policyResponse?.tuning, (snapshot || state.snapshot)?.signaling?.protocol);
  if (!state.policyDirty) state.policyDraft = structuredClone(state.policy);
  if (snapshot && state.activeTestRun) {
    state.activeTestRun = ingestTestRun(state.activeTestRun, snapshot?.metrics?.recentEvents || []);
    persistTestState();
  }

  state.serverReachable = serverReachable;
  if (!serverReachable) {
    setSocketState("offline");
    if (snapshotError) showError(friendlyError(snapshotError));
  } else if (snapshotError && snapshotError.message === "unauthorized") {
    // Server is up; we just have no admin token in this browser session.
    showError(i18n.t("adminTokenNeeded"));
  }
  renderAll();
}

function schedulePoll() {
  globalThis.clearTimeout(state.pollTimer);
  if (!state.polling) return;
  state.pollTimer = globalThis.setTimeout(async () => {
    await refreshDiagnostics();
    schedulePoll();
  }, POLL_INTERVAL_MS);
}

function renderAll() {
  renderSummary();
  renderReadinessBoard();
  renderDevices();
  renderMonitor();
  renderMultiDevice();
  renderTimeline();
  renderSessions();
  renderTuning();
  renderTestCases();
  const generatedClock = formatClock(state.snapshot?.generatedAt || Date.now());
  $("[data-snapshot-time]").textContent = generatedClock;
  $("[data-server-time]").textContent = generatedClock;
}

function renderSummary() {
  const devices = physicalDevices();
  const pairs = state.snapshot?.signaling?.pairs || [];
  const connected = isServerHealthy();
  const unreachable = state.serverReachable === false && !isSocketLive();
  const connection = $("[data-server-connection]");
  if (connection) {
    connection.dataset.state = connected ? "connected" : unreachable ? "offline" : "checking";
    connection.querySelector("span").textContent = connected
      ? i18n.t("connected")
      : unreachable ? i18n.t("offline") : i18n.t("checkingServer");
  }
  $("[data-summary-server]").textContent = connected
    ? i18n.t("connected")
    : unreachable ? i18n.t("offline") : i18n.t("checkingServer");
  $("[data-summary-server-detail]").textContent = connected ? `${i18n.t("azureSignaling")} · ${i18n.t("turnReady")}` : httpBase;
  const serverIcon = $("[data-summary-server]").closest("article")?.querySelector(".summary-icon");
  if (serverIcon) {
    serverIcon.dataset.tone = connected ? "green" : unreachable ? "red" : "amber";
    serverIcon.textContent = connected ? "✓" : unreachable ? "!" : "·";
  }
  $("[data-summary-devices]").textContent = String(devices.length);
  $("[data-summary-devices-detail]").textContent = i18n.t("physicalDevices", { count: devices.length });
  $("[data-summary-pairs]").textContent = String(pairs.length);
  const readiness = readinessSummary();
  $("[data-summary-readiness]").textContent = `${readiness.percent}%`;
  $("[data-summary-readiness-detail]").textContent = i18n.t("launchChecks", readiness);
}

function renderReadinessBoard() {
  const connected = isServerHealthy();
  const blockedItems = connected
    ? [[i18n.t("noBlockers"), i18n.t("openPhoneHint"), "none"]]
    : [[i18n.t("serverUnreachable"), i18n.t("serverUnreachableCopy"), "blocked"]];
  const columns = [
    { key: "ready", title: i18n.t("readyColumn"), icon: "✓", items: i18n.t("readyItems") },
    { key: "proof", title: i18n.t("proofColumn"), icon: "!", items: i18n.t("proofItems") },
    { key: "blocked", title: i18n.t("blockedColumn"), icon: connected ? "0" : "!", items: blockedItems },
    { key: "later", title: i18n.t("laterColumn"), icon: "→", items: i18n.t("laterItems") }
  ];
  const readiness = readinessSummary();
  $("[data-readiness-score]").textContent = `${readiness.percent}%`;
  $("[data-readiness-progress]").style.width = `${readiness.percent}%`;
  $("[data-readiness-explainer]").textContent = i18n.t("readinessExplainer", readiness);
  $("[data-readiness-board]").innerHTML = columns.map((column) => {
    const open = !state.readinessCollapsed.has(column.key);
    return `
    <section class="readiness-column" data-state="${escapeHtml(column.key)}" data-open="${open}">
      <button type="button" class="readiness-column-toggle" data-readiness-toggle="${escapeHtml(column.key)}" aria-expanded="${open}">
        <span class="state-icon">${escapeHtml(column.icon)}</span>
        <span class="readiness-column-title">${escapeHtml(column.title)}</span>
        <b>${column.items.length}</b>
        <span class="readiness-chevron" aria-hidden="true">${open ? "▾" : "▸"}</span>
      </button>
      <div class="readiness-column-body" ${open ? "" : "hidden"}>
        ${column.items.map((item) => renderReadinessRow(item)).join("")}
      </div>
    </section>`;
  }).join("");
  $$("[data-readiness-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.readinessToggle;
      if (state.readinessCollapsed.has(key)) state.readinessCollapsed.delete(key);
      else state.readinessCollapsed.add(key);
      renderReadinessBoard();
    });
  });
}

function renderReadinessRow([title, copy, status]) {
  const icon = status === "live" || status === "ready" ? "✓" : status === "partial" ? "◑" : status === "blocked" ? "!" : "○";
  return `
    <article class="readiness-row" data-row-status="${escapeHtml(status)}">
      <i aria-hidden="true">${icon}</i>
      <div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></div>
      <span>${escapeHtml(readinessStatusLabel(status))}</span>
    </article>
  `;
}

function readinessStatusLabel(status) {
  const labels = {
    live: i18n.t("statusLive"),
    ready: i18n.t("statusReady"),
    partial: i18n.t("statusPartial"),
    proof: i18n.t("statusProof"),
    later: i18n.t("statusLater"),
    blocked: i18n.t("blocked"),
    none: i18n.t("none")
  };
  return labels[status] || status;
}

function renderDevices() {
  const devices = physicalDevices();
  pruneDisconnectedDevices(devices);
  if (!state.selectedDeviceId && devices[0]) state.selectedDeviceId = devices[0].id;
  if (state.selectedDeviceId && !devices.some((device) => device.id === state.selectedDeviceId)) {
    state.selectedDeviceId = devices[0]?.id || "";
  }

  const list = $("[data-device-list]");
  if (!devices.length) {
    list.innerHTML = `<p class="empty-row">${escapeHtml(i18n.t("noDevices"))}</p>`;
  } else {
    list.innerHTML = devices.map((device) => {
      const monitor = state.activeMonitors.get(device.id);
      const telemetry = state.monitorTelemetryByDevice.get(device.id);
      const status = monitor?.status || telemetry?.status || "idle";
      const age = telemetry?.sampledAt
        ? formatAge(Date.now() - Number(telemetry.sampledAt), i18n.locale)
        : formatAge(device.lastSeenMsAgo, i18n.locale);
      const pairing = deviceSessionState(device.id);
      return `
      <button class="device-row${device.id === state.selectedDeviceId ? " is-selected" : ""}" type="button" data-device-id="${escapeHtml(device.id)}">
        <span class="device-name">
          <span class="device-avatar">${escapeHtml(deviceInitials(device))}</span>
          <span><strong>${escapeHtml(friendlyDeviceName(device))}</strong><small>${escapeHtml(friendlyPlatform(device))} · ${escapeHtml(statusLabel(status))}</small></span>
        </span>
        <span class="device-pairing" data-pairing-tone="${escapeHtml(pairing.tone)}">${escapeHtml(pairing.label)}</span>
        <span>${escapeHtml(age)}</span>
      </button>
    `;
    }).join("");
  }
  list.querySelectorAll("[data-device-id]").forEach((button) => {
    button.addEventListener("click", () => selectDevice(button.dataset.deviceId));
  });

  const select = $("[data-monitor-device]");
  select.innerHTML = `<option value="">${escapeHtml(i18n.t("chooseDevice"))}</option>${devices.map((device) => `
    <option value="${escapeHtml(device.id)}"${device.id === state.selectedDeviceId ? " selected" : ""}>${escapeHtml(friendlyDeviceName(device))} · ${escapeHtml(friendlyPlatform(device))}</option>
  `).join("")}`;
  $("[data-device-count-copy]").textContent = i18n.t("devicesCount", { count: devices.length });
}

function selectDevice(deviceId) {
  state.selectedDeviceId = deviceId || "";
  state.activeMonitor = state.activeMonitors.get(state.selectedDeviceId) || null;
  state.monitorTelemetry = state.monitorTelemetryByDevice.get(state.selectedDeviceId) || null;
  renderDevices();
  renderMonitor();
}

function startMonitor() {
  const device = selectedDevice();
  if (!device) {
    setMonitorExplainer(i18n.t("noDeviceSelected"));
    return;
  }
  startMonitorForDevice(device);
}

function startAllMonitors() {
  const devices = physicalDevices();
  if (!devices.length) {
    setMonitorExplainer(i18n.t("openPhoneHint"));
    return;
  }
  for (const device of devices) startMonitorForDevice(device);
  setMonitorExplainer(i18n.t("startedAllMonitors", { count: devices.length }));
  renderMonitor();
}

function startMonitorForDevice(device) {
  connectAdminSocket();
  if (state.activeMonitors.has(device.id)) return;
  const monitorId = `monitor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const monitor = {
    monitorId,
    targetId: device.id,
    deviceName: friendlyDeviceName(device),
    status: "starting",
    startedAt: Date.now()
  };
  state.activeMonitors.set(device.id, monitor);
  if (device.id === state.selectedDeviceId) state.activeMonitor = monitor;
  state.ignoredMonitorIds.delete(monitorId);
  const sent = sendSocket({
    type: "admin:monitor:start",
    targetId: device.id,
    payload: {
      monitorId,
      intervalMs: MONITOR_INTERVAL_MS,
      startFrequencyHz: MONITOR_START_HZ,
      endFrequencyHz: MONITOR_END_HZ,
      emit: true
    }
  });
  if (!sent) {
    state.activeMonitors.delete(device.id);
    if (device.id === state.selectedDeviceId) state.activeMonitor = null;
    setMonitorExplainer(i18n.t("signalingDisconnected"));
  } else {
    setMonitorExplainer(i18n.t("startedMonitor", { device: friendlyDeviceName(device) }));
  }
  renderMonitor();
}

function stopMonitor() {
  const monitor = state.activeMonitors.get(state.selectedDeviceId) || state.activeMonitor;
  if (!monitor) return;
  stopMonitorFor(monitor);
}

function stopAllMonitors() {
  const monitors = [...state.activeMonitors.values()];
  for (const monitor of monitors) stopMonitorFor(monitor, { quiet: true });
  setMonitorExplainer(i18n.t("stoppedAllMonitors"));
  renderMonitor();
}

function stopMonitorFor(monitor, { quiet = false } = {}) {
  state.ignoredMonitorIds.add(monitor.monitorId);
  const sent = sendSocket({
    type: "admin:monitor:stop",
    targetId: monitor.targetId,
    payload: { monitorId: monitor.monitorId }
  });
  if (!sent) {
    state.activeMonitors.delete(monitor.targetId);
    state.monitorTelemetryByDevice.delete(monitor.targetId);
    if (state.activeMonitor?.monitorId === monitor.monitorId) state.activeMonitor = null;
    if (state.selectedDeviceId === monitor.targetId) state.monitorTelemetry = null;
    setMonitorExplainer(i18n.t("signalingDisconnected"));
    renderMonitor();
    return;
  }
  const nextMonitor = {
    ...monitor,
    status: "stopping"
  };
  state.activeMonitors.set(monitor.targetId, nextMonitor);
  if (state.selectedDeviceId === monitor.targetId) state.activeMonitor = nextMonitor;
  if (!quiet) setMonitorExplainer(i18n.t("stoppingMonitor", { device: monitor.deviceName || i18n.t("chooseDevice") }));
  renderMonitor();
}

function renderMonitor() {
  const selectedMonitor = state.activeMonitors.get(state.selectedDeviceId) || state.activeMonitor;
  const active = selectedMonitor;
  const telemetry = state.monitorTelemetryByDevice.get(state.selectedDeviceId)
    || state.monitorTelemetry
    || latestMonitorTelemetry();
  const status = active?.status || "idle";
  const normalizedStatus = ["active", "waiting", "stopping", "blocked", "error"].includes(status)
    ? status
    : status === "starting" ? "active" : "idle";
  const statusNode = $("[data-monitor-status]");
  statusNode.dataset.monitorStatus = normalizedStatus;
  $("[data-monitor-status-copy]").textContent = i18n.t(normalizedStatus);
  const devices = physicalDevices();
  $("[data-action='monitor-start']").disabled = Boolean(active) || !state.selectedDeviceId;
  $("[data-action='monitor-stop']").disabled = !active || active.status === "stopping";
  $("[data-action='monitor-start-all']").disabled = !devices.length || devices.every((device) => state.activeMonitors.has(device.id));
  $("[data-action='monitor-stop-all']").disabled = !state.activeMonitors.size;
  renderFrequencySpectrum(telemetry);
  renderMetricRows(telemetry);
}

function renderFrequencySpectrum(telemetry) {
  const built = frequencyChannelsHtml(telemetry);
  $("[data-frequency-target]").textContent = built.targetText;
  $("[data-frequency-channels]").innerHTML = built.gridHtml;
}

// Pure builder: returns the target-band caption + the channel-grid HTML for a
// given telemetry sample. Reused by the single-device monitor and by each column
// of the two-device test so both show a real live frequency map.
function frequencyChannelsHtml(telemetry) {
  const start = Number(telemetry?.startFrequencyHz || MONITOR_START_HZ);
  const end = Number(telemetry?.endFrequencyHz || MONITOR_END_HZ);
  const bands = monitorFrequencyBands().map((definition, index) => ({
    ...definition,
    ...matchingFrequencyBand(definition, telemetry?.bands, index)
  }));
  const targetText = i18n.t("targetBand", { band: formatFrequency(start, end) });
  const gridHtml = bands.map((band, index) => {
    const peakDb = Number(band.peakDb);
    const confidence = Number(band.confidence);
    const level = Number.isFinite(peakDb)
      ? Math.max(4, Math.min(100, ((peakDb + 140) / 90) * 100))
      : 4;
    const tone = !telemetry
      ? "idle"
      : band.detected || confidence >= 0.35
        ? "good"
        : confidence >= 0.15
          ? "warn"
          : "quiet";
    const overlapsTarget = band.startFrequencyHz < end && band.endFrequencyHz > start;
    const status = tone === "good" || tone === "warn" ? i18n.t("signalBand") : i18n.t("quietBand");
    const targetLabel = i18n.t("targetBand", { band: "" }).trim();
    return `
      <article class="frequency-channel" data-channel="${index}" data-tone="${tone}" tabindex="0"
        title="${escapeHtml(`${formatFrequency(band.startFrequencyHz, band.endFrequencyHz)} · ${Number.isFinite(peakDb) ? `${formatNumber(peakDb, 1)} dB` : i18n.t("waiting")}`)}">
        <header>
          <strong>${escapeHtml(band.label)}</strong>
          ${overlapsTarget ? `<span>${escapeHtml(targetLabel)}</span>` : ""}
        </header>
        <div class="frequency-channel-meter" aria-hidden="true"><i style="--level:${level}%"></i></div>
        <footer>
          <b>${Number.isFinite(peakDb) ? `${escapeHtml(formatNumber(peakDb, 1))} dB` : "-- dB"}</b>
          <span>${escapeHtml(status)}</span>
        </footer>
      </article>
    `;
  }).join("");
  return { targetText, gridHtml };
}

// Full frequency-map block (heading + grid) for embedding inside a two-device
// column.
function frequencySpectrumBlockHtml(telemetry) {
  const built = frequencyChannelsHtml(telemetry);
  return `
    <div class="frequency-spectrum">
      <div class="frequency-spectrum-heading">
        <div>
          <strong>${escapeHtml(i18n.t("liveFrequencyMap"))}</strong>
        </div>
        <span class="frequency-target">${escapeHtml(built.targetText)}</span>
      </div>
      <div class="frequency-channel-grid">${built.gridHtml}</div>
    </div>`;
}

function matchingFrequencyBand(definition, telemetryBands, index) {
  const bands = Array.isArray(telemetryBands) ? telemetryBands : [];
  const overlapping = bands
    .map((band) => ({
      band,
      overlap: frequencyOverlap(definition, band)
    }))
    .filter((item) => item.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);
  return overlapping[0]?.band || bands[index] || {};
}

function frequencyOverlap(a, b) {
  const start = Math.max(Number(a?.startFrequencyHz), Number(b?.startFrequencyHz));
  const end = Math.min(Number(a?.endFrequencyHz), Number(b?.endFrequencyHz));
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
}

function monitorFrequencyBands() {
  return [
    { label: "18 kHz", startFrequencyHz: 18_000, endFrequencyHz: 18_500 },
    { label: "19 kHz", startFrequencyHz: 18_500, endFrequencyHz: 19_500 },
    { label: "20 kHz", startFrequencyHz: 19_500, endFrequencyHz: 20_500 },
    { label: "21 kHz", startFrequencyHz: 20_500, endFrequencyHz: 21_000 }
  ];
}

function readinessSummary() {
  const readyItems = i18n.t("readyItems");
  const proofItems = i18n.t("proofItems");
  const total = readyItems.length + proofItems.length;
  const liveInfrastructureChecks = isServerHealthy() ? 2 : 0;
  const locallyVerifiedChecks = Math.max(0, readyItems.length - 2);
  // Capabilities proven for a single 1-on-1 pair (but not yet for multi-device /
  // two-pair runs) are flagged "partial" and count toward verified readiness.
  const partialProofChecks = proofItems.filter((item) => item[2] === "partial").length;
  const verified = Math.min(total, liveInfrastructureChecks + locallyVerifiedChecks + partialProofChecks);
  return {
    verified,
    total,
    percent: total ? Math.round((verified / total) * 100) : 0
  };
}

function renderMetricRows(telemetry = state.monitorTelemetry || latestMonitorTelemetry()) {
  // The single-device monitor drops the reciprocal-audio rows (heard signal,
  // correlation, energy margin): a lone phone hears only its own emitted chirp,
  // so those readings are self-noise, not a real result. It keeps what one phone
  // can genuinely prove — that it emits in-band, its mic samples fast enough,
  // and its bump/tilt sensors fire.
  $("[data-monitor-metrics]").innerHTML = metricTableHtml(telemetry, "single", { deviceId: state.selectedDeviceId });
}

// pairOnly rows require a *partner* chirp to mean anything, so they are shown
// only in the two-device test.
function metricDefinitions(telemetry, deviceId) {
  const sessionEvidence = latestSessionEvidence(deviceId);
  const eventEvidence = latestEventEvidence(deviceId);
  const correlation = firstNumber(telemetry?.confidence, sessionEvidence?.acoustic?.correlation, eventEvidence?.acousticCorrelation);
  const marginDb = firstNumber(telemetry?.marginDb, sessionEvidence?.acoustic?.marginDb, eventEvidence?.acousticMarginDb);
  const tilt = firstNumber(telemetry?.tiltDegrees, eventEvidence?.tiltDegrees, sessionEvidence?.physicalEvidence?.tiltDegrees, eventEvidence?.tiltMatch);
  return [
    {
      pairOnly: true,
      name: i18n.t("heardSignal"),
      meaning: i18n.t("heardSignalMeaning"),
      expected: i18n.t("heardSignalExpected"),
      value: telemetry?.status === "active"
        ? `${Math.round(Number(telemetry.confidence || 0) * 100)}% · ${telemetry.detected ? i18n.t("yes") : i18n.t("no")}`
        : i18n.t("waiting"),
      tone: telemetry?.status === "active" ? telemetryTone(telemetry) : "idle"
    },
    {
      pairOnly: true,
      name: i18n.t("correlation"),
      meaning: i18n.t("correlationMeaning"),
      expected: i18n.t("correlationExpected"),
      value: Number.isFinite(correlation) ? formatNumber(correlation, 2) : i18n.t("unknown"),
      tone: scoreTone(correlation, 0.30, 0.20)
    },
    {
      pairOnly: true,
      name: i18n.t("energyMargin"),
      meaning: i18n.t("energyMarginMeaning"),
      expected: i18n.t("energyMarginExpected"),
      value: Number.isFinite(marginDb) ? `${formatNumber(marginDb, 1)} dB` : i18n.t("unknown"),
      tone: scoreTone(marginDb, 8, 4.5)
    },
    {
      name: i18n.t("emittedPacket"),
      meaning: i18n.t("emittedPacketMeaning"),
      expected: i18n.t("emittedPacketExpected"),
      value: telemetry?.status === "active" ? (telemetry.emitted ? i18n.t("yes") : i18n.t("no")) : i18n.t("waiting"),
      tone: telemetry?.status === "active" ? (telemetry.emitted ? "good" : "bad") : "idle"
    },
    {
      name: i18n.t("sampleRate"),
      meaning: i18n.t("sampleRateMeaning"),
      expected: i18n.t("sampleRateExpected"),
      value: telemetry?.sampleRate ? `${Math.round(telemetry.sampleRate / 1000)} kHz` : i18n.t("unknown"),
      tone: sampleRateTone(telemetry?.sampleRate)
    },
    {
      name: i18n.t("bumpEvidence"),
      meaning: i18n.t("bumpEvidenceMeaning"),
      expected: i18n.t("bumpEvidenceExpected"),
      value: telemetry?.bumpDetected
        ? `+${Math.round(Number(telemetry.bumpPoints || 20))} (raw ${formatNumber(telemetry.maxAcceleration, 1)})`
        : Number.isFinite(telemetry?.maxAcceleration)
          ? `raw ${formatNumber(telemetry.maxAcceleration, 1)}`
          : i18n.t("unknown"),
      tone: telemetry?.bumpDetected || Number(telemetry?.maxAcceleration) >= 6 ? "good" : telemetry ? "bad" : "idle"
    },
    {
      name: i18n.t("tiltEvidence"),
      meaning: i18n.t("tiltEvidenceMeaning"),
      expected: i18n.t("tiltEvidenceExpected"),
      value: Number.isFinite(tilt) ? `${formatNumber(tilt > 1 ? tilt : tilt * 90, 0)}°` : i18n.t("unknown"),
      tone: Number.isFinite(tilt) ? ((tilt > 1 ? tilt : tilt * 90) > 30 ? "good" : "bad") : "idle"
    }
  ];
}

function metricTableHtml(telemetry, mode = "pair", { deviceId } = {}) {
  const rows = metricDefinitions(telemetry, deviceId).filter((row) => mode === "pair" || !row.pairOnly);
  return `
    <div class="metric-row" data-header="true">
      <span>${escapeHtml(i18n.t("metric"))}</span><span>${escapeHtml(i18n.t("meaning"))}</span><span>${escapeHtml(i18n.t("expected"))}</span><span>${escapeHtml(i18n.t("current"))}</span><span>${escapeHtml(i18n.t("status"))}</span>
    </div>
    ${rows.map((row) => `
      <div class="metric-row">
        <strong>${escapeHtml(row.name)}</strong>
        <span>${escapeHtml(row.meaning)}</span>
        <span>${escapeHtml(row.expected)}</span>
        <b>${escapeHtml(row.value)}</b>
        <span class="metric-state" data-tone="${escapeHtml(row.tone)}"><i></i>${escapeHtml(toneLabel(row.tone))}</span>
      </div>
    `).join("")}
  `;
}

function renderTimeline() {
  const local = state.localEvents.map((event) => ({ ...event, local: true }));
  const remote = (state.snapshot?.metrics?.recentEvents || []).map((event) => ({
    ...event,
    timestamp: new Date(event.at).getTime()
  })).filter((event) => !isEmptyTelemetryEvent(event));
  const events = [...local, ...remote]
    .filter((event) => Number(event.timestamp || 0) >= state.clearEventsBefore)
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
    .slice(0, 60);
  const timeline = $("[data-event-timeline]");
  if (!events.length) {
    timeline.innerHTML = `<p class="empty-row">${escapeHtml(i18n.t("noEvents"))}</p>`;
    return;
  }
  const COLLAPSED_COUNT = 4;
  const visible = state.timelineExpanded ? events : events.slice(0, COLLAPSED_COUNT);
  const renderItem = (event) => {
    const detail = event.detail || {};
    return `
      <article class="timeline-item" data-tone="${escapeHtml(eventTone(event))}">
        <strong>${escapeHtml(friendlyEventType(event.type))}</strong>
        <time>${escapeHtml(new Date(event.timestamp || event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }))}</time>
        <small>${escapeHtml(friendlyEventDetail(event.type, detail))}</small>
      </article>
    `;
  };
  let html = visible.map(renderItem).join("");
  if (events.length > COLLAPSED_COUNT) {
    const remaining = events.length - COLLAPSED_COUNT;
    html += `<button type="button" class="timeline-toggle" data-timeline-toggle>
      <span>${escapeHtml(state.timelineExpanded ? i18n.t("showLess") : i18n.t("showMoreEvents", { count: remaining }))}</span>
      <span aria-hidden="true">${state.timelineExpanded ? "▴" : "▾"}</span>
    </button>`;
  }
  timeline.innerHTML = html;
  timeline.querySelector("[data-timeline-toggle]")?.addEventListener("click", () => {
    state.timelineExpanded = !state.timelineExpanded;
    renderTimeline();
  });
}

function renderSessions() {
  // Active proximity sessions are now surfaced inline on the Connected devices
  // list (pairing badge) and in the Two-device test outcome, so this only keeps
  // the live "N active" counter in the devices heading up to date.
  const sessions = state.snapshot?.signaling?.proximitySessions || [];
  const countNode = $("[data-session-count]");
  if (countNode) countNode.textContent = i18n.t("activeCount", { count: sessions.length });
}

// Live pairing/session state for one device, folded into the Connected devices
// list so there is a single device-state surface (no separate sessions panel).
function deviceSessionState(deviceId) {
  const sessions = state.snapshot?.signaling?.proximitySessions || [];
  const session = sessions.find((entry) => (entry.participants || []).some((p) => p.clientId === deviceId));
  if (!session) return { tone: "idle", label: i18n.t("pairIdle") };
  const participants = session.participants || [];
  const me = participants.find((p) => p.clientId === deviceId);
  const partner = participants.find((p) => p.clientId !== deviceId);
  const partnerName = partner ? (partner.deviceName || friendlyShortId(partner.clientId)) : "";
  if (me?.telemetry?.decision === "verified") {
    return { tone: "good", label: partnerName ? i18n.t("pairedWith", { name: partnerName }) : i18n.t("pairVerified") };
  }
  return { tone: "active", label: partnerName ? i18n.t("pairingWith", { name: partnerName }) : i18n.t("pairInCeremony") };
}

function friendlyShortId(id) {
  const raw = String(id || "");
  return raw.length > 8 ? `${raw.slice(0, 6)}…` : raw;
}

function renderMultiDevice() {
  const aSelect = $("[data-multi-a]");
  const bSelect = $("[data-multi-b]");
  if (!aSelect || !bSelect) return;
  const devices = physicalDevices();
  const options = (selected) => `<option value="">${escapeHtml(i18n.t("chooseDevice"))}</option>` + devices.map((device) =>
    `<option value="${escapeHtml(device.id)}"${device.id === selected ? " selected" : ""}>${escapeHtml(friendlyDeviceName(device))} · ${escapeHtml(friendlyPlatform(device))}</option>`
  ).join("");
  // Drop selections for devices that disconnected.
  if (state.multiDeviceA && !devices.some((d) => d.id === state.multiDeviceA)) state.multiDeviceA = "";
  if (state.multiDeviceB && !devices.some((d) => d.id === state.multiDeviceB)) state.multiDeviceB = "";
  aSelect.innerHTML = options(state.multiDeviceA);
  bSelect.innerHTML = options(state.multiDeviceB);

  const bothChosen = state.multiDeviceA && state.multiDeviceB && state.multiDeviceA !== state.multiDeviceB;
  const bothMonitored = bothChosen
    && state.activeMonitors.has(state.multiDeviceA)
    && state.activeMonitors.has(state.multiDeviceB);
  $("[data-action='multi-start']").disabled = !bothChosen || bothMonitored;
  $("[data-action='multi-stop']").disabled = !(state.activeMonitors.has(state.multiDeviceA) || state.activeMonitors.has(state.multiDeviceB)) || !bothChosen;
  const statusNode = $("[data-multi-status]");
  const statusKey = !bothChosen ? "idle" : bothMonitored ? "active" : "waiting";
  statusNode.dataset.multiStatus = statusKey;
  $("[data-multi-status-copy]").textContent = i18n.t(statusKey);

  $("[data-multi-column-a]").innerHTML = renderMultiColumn(state.multiDeviceA, "A");
  $("[data-multi-column-b]").innerHTML = renderMultiColumn(state.multiDeviceB, "B");
  $("[data-multi-outcome]").innerHTML = renderPairingOutcome(state.multiDeviceA, state.multiDeviceB);
}

function renderMultiColumn(deviceId, slot) {
  if (!deviceId) {
    return `<p class="empty-row">${escapeHtml(i18n.t("pickDeviceSlot", { slot }))}</p>`;
  }
  const device = physicalDevices().find((d) => d.id === deviceId);
  const telemetry = state.monitorTelemetryByDevice.get(deviceId);
  const monitor = state.activeMonitors.get(deviceId);
  const statusKey = monitor?.status === "active" || monitor?.status === "starting" ? "active"
    : monitor ? "waiting" : "idle";
  // Full per-device panel: live frequency map + every metric (in the two-device
  // test each phone genuinely hears the OTHER, so all reciprocal rows apply).
  return `
    <div class="multi-column-head">
      <span class="multi-slot">${escapeHtml(slot)}</span>
      <strong>${escapeHtml(device ? friendlyDeviceName(device) : deviceId)}</strong>
      <span class="monitor-status" data-monitor-status="${statusKey}"><i></i><span>${escapeHtml(i18n.t(statusKey))}</span></span>
    </div>
    ${frequencySpectrumBlockHtml(telemetry)}
    <div class="metric-table">${metricTableHtml(telemetry, "pair", { deviceId })}</div>
  `;
}

function renderPairingOutcome(aId, bId) {
  if (!aId || !bId || aId === bId) {
    return `<div class="pairing-outcome" data-outcome="idle"><strong>${escapeHtml(i18n.t("pairingOutcome"))}</strong><span>${escapeHtml(i18n.t("pairingOutcomeIdle"))}</span></div>`;
  }
  const sessions = state.snapshot?.signaling?.proximitySessions || [];
  const session = sessions.find((entry) => {
    const ids = (entry.participants || []).map((p) => p.clientId);
    return ids.includes(aId) && ids.includes(bId);
  });
  if (!session) {
    return `<div class="pairing-outcome" data-outcome="waiting"><strong>${escapeHtml(i18n.t("pairingOutcome"))}</strong><span>${escapeHtml(i18n.t("pairingOutcomeWaiting"))}</span></div>`;
  }
  const parts = session.participants || [];
  const a = parts.find((p) => p.clientId === aId);
  const b = parts.find((p) => p.clientId === bId);
  const heardA = Boolean(a?.telemetry?.acoustic?.detected);
  const heardB = Boolean(b?.telemetry?.acoustic?.detected);
  const reciprocal = heardA && heardB;
  const verified = a?.telemetry?.decision === "verified" && b?.telemetry?.decision === "verified";
  const bumpA = firstNumber(a?.telemetry?.physicalEvidence?.bumpAt, a?.telemetry?.bumpAt);
  const bumpB = firstNumber(b?.telemetry?.physicalEvidence?.bumpAt, b?.telemetry?.bumpAt);
  const bumpDelta = Number.isFinite(bumpA) && Number.isFinite(bumpB) ? Math.abs(bumpA - bumpB) : NaN;
  const outcome = verified ? "pass" : reciprocal ? "waiting" : "fail";
  const chips = [
    `${i18n.t("reciprocalHeard")}: ${reciprocal ? i18n.t("yes") : i18n.t("no")}`,
    `A→${heardA ? i18n.t("heard") : i18n.t("missed")}`,
    `B→${heardB ? i18n.t("heard") : i18n.t("missed")}`,
    Number.isFinite(bumpDelta) ? `${i18n.t("bumpDelta")}: ${Math.round(bumpDelta)}ms` : `${i18n.t("bumpDelta")}: ${i18n.t("unknown")}`,
    verified ? i18n.t("verified") : i18n.t("insufficient")
  ];
  return `<div class="pairing-outcome" data-outcome="${outcome}">
    <strong>${escapeHtml(i18n.t("pairingOutcome"))}</strong>
    <div class="pairing-chips">${chips.map((c) => `<span>${escapeHtml(c)}</span>`).join("")}</div>
  </div>`;
}

function startMultiDevice() {
  const devices = physicalDevices();
  const a = devices.find((d) => d.id === state.multiDeviceA);
  const b = devices.find((d) => d.id === state.multiDeviceB);
  if (a) startMonitorForDevice(a);
  if (b) startMonitorForDevice(b);
  renderMultiDevice();
}

function stopMultiDevice() {
  for (const id of [state.multiDeviceA, state.multiDeviceB]) {
    const monitor = state.activeMonitors.get(id);
    if (monitor) stopMonitorFor(monitor, { quiet: true });
  }
  renderMultiDevice();
}

function formatClock(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";
}

function normalizePolicySnapshot(tuning, protocol = {}) {
  const source = tuning || {};
  const weights = source.scoring?.weights || protocol.scoreWeights || {
    sound: 34,
    motion: 26,
    bump: 20,
    tilt: 12,
    qr: 8
  };
  return {
    revision: Math.max(1, Math.floor(Number(source.revision || protocol.policyRevision || 1))),
    updatedAt: source.updatedAt || protocol.policyUpdatedAt || null,
    scoring: {
      minimum: Number(source.scoring?.minimum || Number(protocol.scoreMinimum || 0.55) * 100),
      weights: Object.fromEntries(["sound", "motion", "bump", "tilt", "qr"].map((key) => [key, Number(weights[key] || 0)]))
    },
    timing: {
      lateTapGraceMs: Number(source.timing?.lateTapGraceMs || protocol.lateTapGraceMs || 6000),
      acousticWindowMs: Number(source.timing?.acousticWindowMs || protocol.sessionDurationMs || 6000),
      matchSlopMs: Number(source.timing?.matchSlopMs || protocol.matchSlopMs || 4000)
    }
  };
}

function readPolicyForm() {
  const weights = Object.fromEntries($$("[data-policy-weight]").map((input) => [input.dataset.policyWeight, Number(input.value)]));
  const timing = Object.fromEntries($$("[data-policy-timing]").map((input) => [input.dataset.policyTiming, Number(input.value)]));
  return {
    scoring: {
      minimum: Number($("[data-policy-minimum]")?.value),
      weights
    },
    timing
  };
}

function policyFormStatus(policy) {
  const weights = Object.values(policy?.scoring?.weights || {}).map(Number);
  const total = weights.reduce((sum, value) => sum + Number(value || 0), 0);
  if (weights.length !== 5 || weights.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
    return { valid: false, total, message: "Each score weight must be between 0 and 100." };
  }
  if (Math.abs(total - 100) > 0.01) return { valid: false, total, message: `Weights total ${formatNumber(total, 1)}. They must equal 100.` };
  const minimum = Number(policy?.scoring?.minimum);
  if (!Number.isFinite(minimum) || minimum < 35 || minimum > 90) return { valid: false, total, message: "Minimum score must be between 35 and 90." };
  const timingBounds = {
    lateTapGraceMs: [2000, 15000, "Late-tap grace"],
    acousticWindowMs: [2400, 12000, "Acoustic window"],
    matchSlopMs: [500, 10000, "Match slop"]
  };
  for (const [key, [lower, upper, label]] of Object.entries(timingBounds)) {
    const value = Number(policy?.timing?.[key]);
    if (!Number.isFinite(value) || value < lower || value > upper) {
      return { valid: false, total, message: `${label} must be between ${lower} and ${upper} ms.` };
    }
  }
  return { valid: true, total, message: state.policyDirty ? "Unsaved changes. New sessions still use the current server revision." : "New sessions use this policy immediately; active sessions keep their snapshot." };
}

function renderTuning() {
  const form = $("[data-tuning-form]");
  if (!form) return;
  const policy = state.policyDraft || state.policy || normalizePolicySnapshot(null, state.snapshot?.signaling?.protocol);
  for (const input of $$("[data-policy-weight]")) input.value = String(policy.scoring.weights[input.dataset.policyWeight]);
  for (const input of $$("[data-policy-timing]")) input.value = String(policy.timing[input.dataset.policyTiming]);
  for (const slider of $$("[data-policy-slider]")) slider.value = String(policy.timing[slider.dataset.policySlider]);
  $("[data-policy-minimum]").value = String(Math.round(policy.scoring.minimum));
  const revisionNode = $("[data-policy-revision]");
  if (revisionNode) {
    revisionNode.textContent = state.policy
      ? `${state.policy.revision}${state.policy.updatedAt ? ` · ${formatClock(state.policy.updatedAt)}` : ""}`
      : "—";
  }
  const validation = policyFormStatus(policy);
  const total = $("[data-policy-weight-total]");
  const totalText = Number.isInteger(validation.total)
    ? `${validation.total} ${i18n.t("pointsUnit")}`
    : `${formatNumber(validation.total, 1)} ${i18n.t("pointsUnit")}`;
  total.value = totalText;
  total.textContent = totalText;
  total.dataset.valid = String(validation.valid);
  const status = $("[data-policy-status]");
  status.dataset.state = state.policySaving ? "saving" : validation.valid ? (state.policyDirty ? "dirty" : "ready") : "error";
  status.textContent = state.policySaving ? "Applying policy to the server…" : (state.policyMessage || validation.message);
  form.querySelector("button[type='submit']").disabled = state.policySaving || !validation.valid || !state.policyDirty;
  $$("[data-policy-weight], [data-policy-minimum], [data-policy-timing]").forEach((input) => {
    input.disabled = state.policySaving || !state.policy;
  });
}

async function applyPolicyUpdate(event) {
  event.preventDefault();
  const policy = readPolicyForm();
  const validation = policyFormStatus(policy);
  if (!validation.valid || state.policySaving) {
    state.policyMessage = validation.message;
    renderTuning();
    return;
  }
  state.policySaving = true;
  state.policyMessage = "";
  renderTuning();
  try {
    const response = await diagnostics.updateProximityPolicy(policy);
    state.policy = normalizePolicySnapshot(response.policy, response.policy);
    state.policyDraft = structuredClone(state.policy);
    state.policyDirty = false;
    state.policyMessage = `Applied revision ${state.policy.revision}. Refresh complete; the next proximity session will use it.`;
    addLocalEvent("admin:policy:updated", {
      revision: state.policy.revision,
      timing: state.policy.timing,
      scoring: state.policy.scoring
    });
    await refreshDiagnostics();
  } catch (error) {
    state.policyMessage = friendlyError(error);
    showError(state.policyMessage);
  } finally {
    state.policySaving = false;
    renderTuning();
  }
}

// Japanese overrides for the (English-authored) TEST_CASES catalog in
// test-runs.js. Keyed by case id; English remains the source of truth and the
// fallback for any field left untranslated.
const TEST_CASE_I18N_JA = {
  "top-edge": {
    shortTitle: "上端どうし",
    title: "上端どうしの接触",
    purpose: "最も有利と考えられるマイク同士の接触形状で基準を取ります。",
    procedure: "カメラと受話口付近の上端を合わせ、Connect をタップして一度きれいに接触させます。室内や端末ケースを変えずに繰り返します。"
  },
  "speaker-microphone": {
    shortTitle: "スピーカー↔マイク",
    title: "スピーカーからマイクへ",
    purpose: "一方のスピーカーを相手のマイクに向けたときの指向性の利点を測定します。",
    procedure: "一方の端末のスピーカー側を相手のマイク側に当てます。5回ごとに端末の役割を入れ替えます。"
  },
  "cross-angle": {
    shortTitle: "斜め接触",
    title: "斜め角度での接触",
    purpose: "正面ではなく斜めに接触したときの減衰を測定します。",
    procedure: "両端末を約45度に保ち、側縁を交差させて Connect をタップし、一度きれいに接触させます。上側にする端末を交互に変えます。"
  },
  "tap-delay": {
    shortTitle: "タップ遅延",
    title: "タップ遅延スイープ",
    purpose: "物理形状を変えずにレイトタップ猶予の実用限界を探ります。",
    procedure: "上端どうしの基準を用います。2回のConnectタップ間隔を 0・0.5・1・1.5・3・5 秒として、各2回ずつ実行します。"
  },
  "simultaneous-pairs": {
    shortTitle: "2ペア同時",
    title: "2ペア同時",
    purpose: "相互の符号化超音波により、同時進行の2ペアが混線しないことを証明します。",
    procedure: "ペアAとペアBを約5メートル離して配置します。4人全員が1秒以内に Connect をタップし、意図したペアどうしで接触します。途中で配置を入れ替えます。"
  },
  "negative-control": {
    shortTitle: "陰性対照",
    title: "陰性対照の分離",
    purpose: "より強い近傍信号や不完全な物理的証拠があるときの誤マッチを測定します。",
    procedure: "意図した1ペアを実行し、もう1ペアは参加するがバンプしない状態にして、その後入れ替えます。バンプなし・傾きなし・非相互の端末は決して接続してはいけません。"
  },
  "noisy-room": {
    shortTitle: "騒音下",
    title: "騒音下での再試験",
    purpose: "形状の失敗を、高周波の環境騒音や端末処理の違いから切り分けます。",
    procedure: "通常の会話や音楽が近くにある状態で上端どうしの基準を繰り返します。静かな基準時と距離・ケース・タップ間隔を変えないでください。"
  }
};

function localizeCase(definition) {
  if (i18n.locale !== "ja") return definition;
  const overrides = TEST_CASE_I18N_JA[definition.id];
  return overrides ? { ...definition, ...overrides } : definition;
}

// A single phone as an SVG group: rounded body, screen, camera dot, and one
// highlighted edge (top/bottom/left/right) showing which edge makes contact.
function phoneSvg({ x, y, rotate = 0, label = "", highlight = "top" }) {
  const w = 46;
  const h = 92;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const edges = {
    top: `<line x1="${x + 7}" y1="${y}" x2="${x + w - 7}" y2="${y}" class="phone-edge"/>`,
    bottom: `<line x1="${x + 7}" y1="${y + h}" x2="${x + w - 7}" y2="${y + h}" class="phone-edge"/>`,
    left: `<line x1="${x}" y1="${y + 10}" x2="${x}" y2="${y + h - 10}" class="phone-edge"/>`,
    right: `<line x1="${x + w}" y1="${y + 10}" x2="${x + w}" y2="${y + h - 10}" class="phone-edge"/>`
  };
  const camera = highlight === "bottom"
    ? `<circle cx="${cx}" cy="${y + h - 7}" r="2.4" class="phone-cam"/>`
    : `<circle cx="${cx}" cy="${y + 7}" r="2.4" class="phone-cam"/>`;
  return `
    <g transform="rotate(${rotate} ${cx} ${cy})">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="11" class="phone-body"/>
      <rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" rx="7" class="phone-screen"/>
      ${camera}
      ${edges[highlight] || edges.top}
      ${label ? `<text x="${cx}" y="${cy + 4}" class="phone-label">${escapeHtml(label)}</text>` : ""}
    </g>`;
}

function illustrationCaptionKey(id) {
  const keys = {
    "top-edge": "holdTopEdge",
    "tap-delay": "holdTopEdge",
    "noisy-room": "holdTopEdge",
    "speaker-microphone": "holdSpeakerMic",
    "cross-angle": "holdCrossAngle",
    "simultaneous-pairs": "holdTwoPairs",
    "negative-control": "holdTwoPairs"
  };
  return keys[id] || "holdTopEdge";
}

// Diagram of how to physically hold the phones for a given case.
function testCaseIllustration(definition) {
  const id = definition.id;
  const contact = `<circle cx="130" cy="80" r="9" class="phone-contact"/>`;
  if (id === "speaker-microphone") {
    // Stacked: bottom (speaker) edge of top phone meets top (mic) edge of lower.
    return `<svg class="hold-diagram" viewBox="0 0 260 172" role="img" aria-label="${escapeHtml(definition.title)}">
      ${phoneSvg({ x: 107, y: 6, highlight: "bottom", label: "1" })}
      <circle cx="130" cy="86" r="8" class="phone-contact"/>
      ${phoneSvg({ x: 107, y: 96, highlight: "top", label: "2" })}
    </svg>`;
  }
  if (id === "cross-angle") {
    return `<svg class="hold-diagram" viewBox="0 0 260 172" role="img" aria-label="${escapeHtml(definition.title)}">
      ${phoneSvg({ x: 70, y: 40, rotate: 45, highlight: "right", label: "A" })}
      ${phoneSvg({ x: 144, y: 40, rotate: -45, highlight: "left", label: "B" })}
      ${contact}
    </svg>`;
  }
  if (id === "simultaneous-pairs" || id === "negative-control") {
    const dashed = id === "negative-control";
    return `<svg class="hold-diagram" viewBox="0 0 300 172" role="img" aria-label="${escapeHtml(definition.title)}">
      ${phoneSvg({ x: 34, y: 40, rotate: 14, highlight: "top", label: "A" })}
      ${phoneSvg({ x: 88, y: 40, rotate: -14, highlight: "top", label: "A" })}
      <circle cx="86" cy="34" r="7" class="phone-contact"/>
      ${phoneSvg({ x: 176, y: 40, rotate: 14, highlight: "top", label: "B" })}
      ${phoneSvg({ x: 230, y: 40, rotate: -14, highlight: "top", label: "B" })}
      <circle cx="228" cy="34" r="7" class="phone-contact"/>
      ${dashed ? `<line x1="150" y1="20" x2="150" y2="152" class="phone-isolate"/>` : ""}
    </svg>`;
  }
  // Default: top edge to top edge (tent).
  return `<svg class="hold-diagram" viewBox="0 0 260 172" role="img" aria-label="${escapeHtml(definition.title)}">
    ${phoneSvg({ x: 76, y: 46, rotate: 15, highlight: "top", label: "A" })}
    ${phoneSvg({ x: 138, y: 46, rotate: -15, highlight: "top", label: "B" })}
    <circle cx="130" cy="44" r="9" class="phone-contact"/>
  </svg>`;
}

function renderTestCases() {
  const tabs = $("[data-test-case-tabs]");
  if (!tabs) return;
  const definition = localizeCase(TEST_CASES.find((entry) => entry.id === state.selectedTestCaseId) || TEST_CASES[0]);
  state.selectedTestCaseId = definition.id;
  tabs.innerHTML = TEST_CASES.map((entry) => localizeCase(entry)).map((entry) => `
    <button type="button" data-test-case-id="${escapeHtml(entry.id)}" class="${entry.id === definition.id ? "is-active" : ""}" ${state.activeTestRun ? "disabled" : ""}>${escapeHtml(entry.shortTitle)}</button>
  `).join("");
  tabs.querySelectorAll("[data-test-case-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTestCaseId = button.dataset.testCaseId;
      const selected = TEST_CASES.find((entry) => entry.id === state.selectedTestCaseId);
      const target = $("[data-test-target]");
      if (target && selected) target.value = String(selected.targetAttempts);
      state.testAssignments = {};
      persistTestState();
      renderTestCases();
    });
  });
  const pairBadge = definition.pairCount === 2 ? i18n.t("twoPairsBadge") : i18n.t("onePairBadge");
  $("[data-test-case-detail]").innerHTML = `
    <div class="test-case-head">
      <h3>${escapeHtml(definition.title)}</h3>
      <div class="test-case-badges">
        <span class="test-badge" data-badge="${definition.pairCount === 2 ? "two" : "one"}">${escapeHtml(pairBadge)}</span>
        <span class="test-badge test-badge--muted">${escapeHtml(i18n.t("attemptsBadge", { count: definition.targetAttempts }))}</span>
      </div>
    </div>
    <p class="test-case-purpose">${escapeHtml(definition.purpose)}</p>
    <figure class="test-case-figure">
      ${testCaseIllustration(definition)}
      <figcaption>${escapeHtml(i18n.t(illustrationCaptionKey(definition.id)))}</figcaption>
    </figure>
    <ol class="test-case-steps">
      <li>${escapeHtml(definition.procedure)}</li>
      <li>${escapeHtml(definition.pairCount === 2 ? i18n.t("assignPairsTwo") : i18n.t("assignPairsOne"))}</li>
      <li>${escapeHtml(i18n.t("keepConditionsNote"))}</li>
    </ol>
  `;
  renderTestDeviceAssignments(definition);
  renderActiveTestRun(definition);
  renderRunHistory();
}

function renderTestDeviceAssignments(definition) {
  const devices = physicalDevices();
  if (!state.activeTestRun) {
    const liveIds = new Set(devices.map((device) => device.id));
    for (const clientId of Object.keys(state.testAssignments)) {
      if (!liveIds.has(clientId)) delete state.testAssignments[clientId];
    }
  }
  const list = $("[data-test-device-list]");
  if (!devices.length) {
    list.innerHTML = `<p class="empty-row">${escapeHtml(i18n.t("noDevices"))}</p>`;
  } else {
    list.innerHTML = devices.map((device) => {
      const assignment = state.testAssignments[device.id] || "";
      return `
        <label class="test-device-row">
          <span class="device-avatar">${escapeHtml(deviceInitials(device))}</span>
          <span><strong>${escapeHtml(friendlyDeviceName(device))}</strong><small>${escapeHtml(friendlyPlatform(device))}</small></span>
          <select data-test-device-assignment="${escapeHtml(device.id)}" ${state.activeTestRun ? "disabled" : ""} aria-label="Pair assignment for ${escapeHtml(friendlyDeviceName(device))}">
            <option value=""${assignment ? "" : " selected"}>Not included</option>
            <option value="A"${assignment === "A" ? " selected" : ""}>Pair A</option>
            <option value="B"${assignment === "B" ? " selected" : ""}${definition.pairCount === 1 ? " disabled" : ""}>Pair B</option>
          </select>
        </label>`;
    }).join("");
  }
  list.querySelectorAll("[data-test-device-assignment]").forEach((select) => {
    select.addEventListener("change", () => {
      const clientId = select.dataset.testDeviceAssignment;
      if (select.value) state.testAssignments[clientId] = select.value;
      else delete state.testAssignments[clientId];
      persistTestState();
      renderTestCases();
    });
  });
  const assignmentValidation = validateAssignments(definition.id, state.testAssignments);
  const assignmentStatus = $("[data-assignment-status]");
  assignmentStatus.textContent = state.activeTestRun
    ? `Recording ${Object.keys(state.activeTestRun.assignments || {}).length} assigned devices.`
    : assignmentValidation.valid ? "Assignments ready." : assignmentValidation.message;
  assignmentStatus.dataset.valid = String(assignmentValidation.valid);
}

function renderActiveTestRun(definition) {
  const run = state.activeTestRun;
  const validation = validateAssignments(definition.id, state.testAssignments);
  const status = $("[data-run-status]");
  status.dataset.runStatus = run ? "active" : "idle";
  $("[data-run-status-copy]").textContent = run ? "Recording" : i18n.t("idle");
  const target = $("[data-test-target]");
  const notes = $("[data-test-notes]");
  target.disabled = Boolean(run);
  notes.disabled = Boolean(run);
  $("[data-action='test-start']").disabled = Boolean(run) || !validation.valid || !state.policy;
  $("[data-action='test-stop']").disabled = !run;
  if (!run && !target.value) target.value = String(definition.targetAttempts);
  const summary = summarizeTestRun(run);
  $("[data-active-run-summary]").innerHTML = run ? `
    <span><small>Elapsed</small><strong>${escapeHtml(formatElapsed(Date.now() - run.startedAt))}</strong></span>
    <span><small>Case</small><strong>${escapeHtml(run.caseTitle)}</strong></span>
    <span><small>Policy</small><strong>Revision ${escapeHtml(run.policy?.revision || "—")}</strong></span>
    <span><small>Sessions</small><strong>${summary.sessions} / ${run.targetAttempts}</strong></span>
    <span><small>Pairs</small><strong>${escapeHtml(formatAssignedPairs(run.assignments))}</strong></span>
  ` : `<p class="empty-row">Choose a case, assign the connected phones, then start recording.</p>`;
  renderRunResults(run);
}

function renderRunResults(run) {
  const summary = summarizeTestRun(run);
  const cells = [
    ["Sessions", summary.sessions],
    ["Correct pairs", summary.correctPairs],
    ["Wrong pairs", summary.wrongPairs],
    ["Failed", summary.failed],
    ["Acoustic pass", formatRate(summary.acousticPass)],
    ["Bump pass", formatRate(summary.bumpPass)],
    ["Tilt pass", formatRate(summary.tiltPass)],
    ["Median score", summary.medianScore == null ? "—" : formatNumber(summary.medianScore, 1)],
    ["Bump delta", summary.medianBumpDeltaMs == null ? "—" : `${formatNumber(summary.medianBumpDeltaMs, 0)} ms`]
  ];
  $("[data-run-results]").innerHTML = cells.map(([label, value], index) => `
    <span data-tone="${index === 2 && Number(value) > 0 ? "bad" : index === 1 && Number(value) > 0 ? "good" : "neutral"}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></span>
  `).join("");
}

function renderRunHistory() {
  const node = $("[data-run-history]");
  const history = state.testRunHistory || [];
  if (!history.length) {
    node.innerHTML = `<p class="empty-row">No saved runs yet. Completed recordings will appear here for comparison.</p>`;
    return;
  }
  node.innerHTML = `
    <div class="run-history-row run-history-head" aria-hidden="true">
      <span>Date</span><span>Test case</span><span>Policy</span><span>Sessions</span><span>Correct</span><span>Wrong</span><span>Failed</span><span>Audio</span><span>Bump</span><span>Tilt</span><span>Score</span><span>Δ bump</span>
    </div>
    ${history.slice(0, 30).map((run) => {
      const summary = summarizeTestRun(run);
      return `<article class="run-history-row">
        <span>${escapeHtml(new Date(run.stoppedAt || run.startedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }))}</span>
        <strong>${escapeHtml(run.caseTitle)}</strong>
        <span>r${escapeHtml(run.policy?.revision || "—")}</span>
        <span>${summary.sessions}</span><span data-tone="good">${summary.correctPairs}</span><span data-tone="${summary.wrongPairs ? "bad" : "neutral"}">${summary.wrongPairs}</span><span>${summary.failed}</span>
        <span>${escapeHtml(formatRate(summary.acousticPass))}</span><span>${escapeHtml(formatRate(summary.bumpPass))}</span><span>${escapeHtml(formatRate(summary.tiltPass))}</span>
        <span>${summary.medianScore == null ? "—" : escapeHtml(formatNumber(summary.medianScore, 1))}</span><span>${summary.medianBumpDeltaMs == null ? "—" : `${escapeHtml(formatNumber(summary.medianBumpDeltaMs, 0))}ms`}</span>
      </article>`;
    }).join("")}`;
}

function startTestRecording() {
  if (state.activeTestRun) return;
  const validation = validateAssignments(state.selectedTestCaseId, state.testAssignments);
  if (!validation.valid) {
    showError(validation.message);
    return;
  }
  state.activeTestRun = createTestRun({
    caseId: state.selectedTestCaseId,
    assignments: state.testAssignments,
    policy: state.policy,
    targetAttempts: $("[data-test-target]")?.value,
    notes: $("[data-test-notes]")?.value,
    devices: physicalDevices()
  });
  addLocalEvent("admin:test-run:started", { runId: state.activeTestRun.id, caseId: state.activeTestRun.caseId });
  persistTestState();
  renderTestCases();
}

function stopTestRecording() {
  if (!state.activeTestRun) return;
  const completed = stopTestRun(state.activeTestRun);
  state.testRunHistory.unshift(completed);
  state.testRunHistory = state.testRunHistory.slice(0, 50);
  addLocalEvent("admin:test-run:stopped", { runId: completed.id, summary: summarizeTestRun(completed) });
  state.activeTestRun = null;
  persistTestState();
  renderTestCases();
}

function loadStoredTestState() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(TEST_RUN_STORAGE_KEY) || "{}");
    return {
      selectedTestCaseId: typeof parsed.selectedTestCaseId === "string" ? parsed.selectedTestCaseId : TEST_CASES[0].id,
      assignments: isPlainObject(parsed.assignments) ? parsed.assignments : {},
      activeRun: parsed.activeRun?.status === "active" ? parsed.activeRun : null,
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, 50) : []
    };
  } catch {
    return { selectedTestCaseId: TEST_CASES[0].id, assignments: {}, activeRun: null, history: [] };
  }
}

function persistTestState() {
  try {
    globalThis.localStorage?.setItem(TEST_RUN_STORAGE_KEY, JSON.stringify({
      selectedTestCaseId: state.selectedTestCaseId,
      assignments: state.testAssignments,
      activeRun: state.activeTestRun,
      history: state.testRunHistory
    }));
  } catch {
    /* local persistence is best-effort; the active page still retains results */
  }
}

function formatAssignedPairs(assignments = {}) {
  return ["A", "B"].filter((pair) => Object.values(assignments).includes(pair)).join(" + ") || "—";
}

function formatRate(value) {
  return value == null ? "—" : `${formatNumber(value, 1)}%`;
}

function formatElapsed(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function setSocketState(nextState) {
  state.socketState = nextState;
  // renderSummary owns the [data-server-connection] chip (connected/offline/
  // checking); just refresh it here.
  renderSummary();
}

function setMonitorExplainer(text) {
  const node = $("[data-monitor-explainer]");
  if (node) node.textContent = text;
}

function updateMonitorExplainerFromTelemetry(telemetry) {
  if (telemetry.status === "active") setMonitorExplainer(i18n.t("monitorRunning"));
  if (telemetry.status === "waiting") {
    if (telemetry.reason === "device-tap-required") setMonitorExplainer(i18n.t("monitorWaitingForTap"));
    else if (telemetry.reason === "proximity-ceremony-active") setMonitorExplainer(i18n.t("monitorWaitingForCeremony"));
  }
  if (telemetry.status === "blocked") {
    if (telemetry.reason === "audio-not-ready") setMonitorExplainer(i18n.t("audioNotReady"));
    else if (telemetry.reason === "proximity-ceremony-active") setMonitorExplainer(i18n.t("ceremonyActive"));
    else setMonitorExplainer(`${i18n.t("monitorBlocked")} ${telemetry.reason || ""}`.trim());
  }
  if (telemetry.status === "error") setMonitorExplainer(`${i18n.t("monitorError")} ${telemetry.reason || ""}`.trim());
}

function addLocalEvent(type, detail = {}) {
  state.localEvents.unshift({
    type,
    detail,
    timestamp: Date.now()
  });
  state.localEvents = state.localEvents.slice(0, 80);
  renderTimeline();
}

function physicalDevices() {
  return (state.snapshot?.signaling?.clients || [])
    .filter((client) => !client.capabilities?.admin && client.deviceFamily !== "admin")
    .map((client) => ({
      ...client,
      deviceFamily: normalizedDeviceFamily(client),
      deviceName: client.deviceName || fallbackDeviceName(client)
    }));
}

function selectedDevice() {
  return physicalDevices().find((device) => device.id === state.selectedDeviceId) || null;
}

function pruneDisconnectedDevices(devices) {
  if (!state.snapshot) return;
  const liveIds = new Set(devices.map((device) => device.id));
  for (const id of [...state.monitorTelemetryByDevice.keys()]) {
    if (!liveIds.has(id) && !state.activeMonitors.has(id)) {
      state.monitorTelemetryByDevice.delete(id);
    }
  }
}

function normalizedDeviceFamily(device) {
  const family = String(device.deviceFamily || device.capabilities?.platform?.family || "").toLowerCase();
  if (family.includes("android")) return "android";
  if (family.includes("iphone") || family === "ios") return "ios";
  if (family.includes("ipad")) return "ipad";
  if (family.includes("mac")) return "macos";
  if (family.includes("win")) return "windows";
  return family || inferFamilyFromName(device.deviceName);
}

function inferFamilyFromName(name = "") {
  const lower = String(name).toLowerCase();
  if (lower.includes("android") || lower.includes("pixel") || lower.includes("galaxy")) return "android";
  if (lower.includes("iphone")) return "ios";
  if (lower.includes("ipad")) return "ipad";
  if (lower.includes("mac")) return "macos";
  return "device";
}

function fallbackDeviceName(device) {
  const family = normalizedDeviceFamily(device);
  if (family === "android") return "Android phone";
  if (family === "ios") return "iPhone";
  if (family === "ipad") return "iPad";
  if (family === "macos") return "Mac";
  return "WebDrop device";
}

function friendlyDeviceName(device = {}) {
  return device.deviceName || device.name || fallbackDeviceName(device);
}

function friendlyPlatform(device = {}) {
  const family = normalizedDeviceFamily(device);
  const labels = {
    android: "Android",
    ios: "iPhone / iOS",
    ipad: "iPadOS",
    macos: "macOS",
    windows: "Windows",
    device: "Web device"
  };
  return device.deviceLabel || labels[family] || labels.device;
}

function deviceInitials(device) {
  const name = friendlyDeviceName(device).trim();
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase() || "WD";
}

function latestSessionEvidence(deviceIdArg) {
  const deviceId = deviceIdArg || state.selectedDeviceId;
  const participants = (state.snapshot?.signaling?.proximitySessions || [])
    .flatMap((session) => session.participants || [])
    .filter((participant) => participant.clientId === deviceId && participant.telemetry)
    .sort((a, b) => new Date(b.telemetry.receivedAt).getTime() - new Date(a.telemetry.receivedAt).getTime());
  return participants[0]?.telemetry || null;
}

function latestEventEvidence(deviceIdArg) {
  const deviceId = deviceIdArg || state.selectedDeviceId;
  const events = state.snapshot?.metrics?.recentEvents || [];
  for (const event of events) {
    const detail = event.detail || {};
    if (deviceId && detail.clientId && detail.clientId !== deviceId) continue;
    if (event.type !== "proximity:session:telemetry" && event.type !== "proximity:session:diagnostic") continue;
    return {
      ...detail,
      tiltDegrees: detail.motion?.maxTiltDeg,
      acousticCorrelation: detail.acousticCorrelation ?? detail.acoustic?.correlation,
      acousticMarginDb: detail.acousticMarginDb ?? detail.acoustic?.marginDb
    };
  }
  return null;
}

function latestMonitorTelemetry() {
  const deviceId = state.selectedDeviceId || state.activeMonitor?.targetId || "";
  if (!deviceId) return null;
  const events = state.snapshot?.metrics?.recentEvents || [];
  for (const event of events) {
    if (event.type !== "admin:monitor:telemetry") continue;
    const detail = event.detail || {};
    if (deviceId && detail.clientId && detail.clientId !== deviceId) continue;
    if (detail.monitorId && state.ignoredMonitorIds.has(detail.monitorId)) continue;
    return {
      monitorId: detail.monitorId,
      deviceId: detail.clientId,
      deviceName: detail.deviceName,
      status: detail.status || "active",
      reason: detail.reason || null,
      sequence: detail.sequence,
      sampledAt: event.at,
      sampleRate: detail.sampleRate,
      emitted: detail.emitted,
      detected: detail.detected,
      startFrequencyHz: detail.startFrequencyHz,
      endFrequencyHz: detail.endFrequencyHz,
      marginDb: detail.marginDb,
      confidence: detail.confidence,
      bands: detail.bands,
      bumpDetected: detail.bumpDetected,
      bumpPoints: detail.bumpPoints,
      tiltDetected: detail.tiltDetected,
      tiltDegrees: detail.tiltDegrees,
      motionSamples: detail.motionSamples,
      maxAcceleration: detail.maxAcceleration
    };
  }
  return null;
}

function isSocketLive() {
  return state.socket?.readyState === WebSocket.OPEN;
}

function isServerHealthy() {
  // A live WebSocket is itself proof the server is reachable, so a transient
  // HTTP diagnostics hiccup can never show a false "Offline" while live data
  // is flowing.
  if (isSocketLive()) return true;
  return Boolean(state.serverReachable && (state.readyz?.ok || state.snapshot?.generatedAt));
}

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return NaN;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function telemetryTone(telemetry) {
  if (!telemetry) return "idle";
  if (telemetry.status === "blocked" || telemetry.status === "error") return "bad";
  if (telemetry.detected && Number(telemetry.confidence) >= 0.35) return "good";
  if (Number(telemetry.confidence) >= 0.15) return "warn";
  return "bad";
}

function scoreTone(value, good, warn) {
  if (!Number.isFinite(value)) return "idle";
  if (value >= good) return "good";
  if (value >= warn) return "warn";
  return "bad";
}

function sampleRateTone(value) {
  const sampleRate = Number(value);
  if (!Number.isFinite(sampleRate)) return "idle";
  if (sampleRate >= 44100) return "good";
  if (sampleRate >= 32000) return "warn";
  return "bad";
}

function toneLabel(tone) {
  if (tone === "good") return i18n.t("good");
  if (tone === "warn") return i18n.t("marginal");
  if (tone === "bad") return i18n.t("poor");
  return i18n.t("waiting");
}

function statusLabel(status) {
  if (status === "active" || status === "waiting" || status === "stopping" || status === "blocked" || status === "error") {
    return i18n.t(status);
  }
  if (status === "starting") return i18n.t("active");
  return i18n.t("idle");
}

function eventTone(event) {
  const detail = event.detail || {};
  if (event.type === "route:error" || /failed|error|blocked/i.test(event.type) || ["error", "blocked"].includes(detail.status)) return "bad";
  if (event.type === "admin:monitor:telemetry") {
    return detail.status === "active" && detail.detected ? "good" : "warn";
  }
  if (/diagnostic|stopped|stop|left/.test(event.type)) return "warn";
  return "good";
}

function isEmptyTelemetryEvent(event) {
  return !event.detail && (
    event.type === "admin:monitor:telemetry"
    || event.type === "proximity:session:telemetry"
    || event.type === "proximity:session:diagnostic"
  );
}

function friendlyEventType(type = "") {
  return String(type)
    .replace(/^proximity:session:/, "session ")
    .replace(/^admin:monitor:/, "monitor ")
    .replace(/^client:/, "client ")
    .replace(/:/g, " · ");
}

function friendlyEventDetail(type, detail = {}) {
  if (type === "admin:monitor:started") {
    return `${detail.deviceName || "Selected device"} · continuous monitoring started`;
  }
  if (type === "admin:monitor:start") {
    return "Admin requested continuous ultrasonic monitoring.";
  }
  if (type === "admin:monitor:stopped") {
    return `${detail.deviceName || "Selected device"} · monitoring stopped`;
  }
  if (type === "admin:monitor:stop") {
    return "Admin requested the monitor to stop.";
  }
  if (type === "admin:monitor:telemetry") {
    if (detail.status === "waiting") {
      return `${detail.deviceName || detail.clientId || "device"} · waiting · ${detail.reason || "device action required"}`;
    }
    const bump = Number.isFinite(Number(detail.bumpPoints)) ? formatNumber(detail.bumpPoints, 0) : "--";
    const tilt = Number.isFinite(Number(detail.tiltDegrees)) ? formatNumber(detail.tiltDegrees, 0) : "--";
    return `${detail.deviceName || detail.clientId || "device"} · ${detail.status || "active"} · ${detail.emitted ? "emitted" : "silent"} · ${detail.detected ? "heard" : "missed"} · ${formatNumber(detail.marginDb, 1)} dB · bump ${bump} · tilt ${tilt}°`;
  }
  if (type === "proximity:session:matched") {
    const peers = Array.isArray(detail.clientIds) ? detail.clientIds.join(" + ") : i18n.t("verified");
    return `${peers} · ${i18n.t("scoreLabel")} ${Math.round(Number(detail.score || 0) * 100)}`;
  }
  if (type === "proximity:session:failed") {
    return `${detail.deviceName || detail.clientId || "device"} · ${detail.reason || i18n.t("failed")}`;
  }
  if (type === "proximity:session:telemetry") {
    return `${detail.deviceName || detail.clientId || "device"} · ${i18n.t("scoreLabel")} ${Math.round(Number(detail.score || 0) * 100)} · ${formatFrequency(detail.acousticStartFrequencyHz, detail.acousticEndFrequencyHz)}`;
  }
  if (type === "proximity:session:diagnostic") {
    return `${detail.deviceName || detail.clientId || "device"} · ${detail.phase || "diagnostic"} · ${detail.reason || detail.message || "reported"}`;
  }
  if (type === "client:joined" || type === "client:left") {
    return `${detail.deviceName || detail.clientId || "device"} · ${detail.deviceFamily || ""}`;
  }
  if (detail.reason) return `${detail.reason}`;
  if (detail.code) return `${detail.code}`;
  return JSON.stringify(detail).slice(0, 220);
}

function friendlyError(error) {
  const message = error?.message || String(error);
  if (message === "unauthorized") return i18n.t("diagnosticsProtected");
  if (message === "not_found") return i18n.t("diagnosticsMissing");
  if (message === "Failed to fetch") return i18n.t("diagnosticsUnreachable");
  return message;
}

function showError(message) {
  const node = $("[data-admin-error]");
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  globalThis.clearTimeout(state.errorTimer);
  state.errorTimer = globalThis.setTimeout(() => {
    node.hidden = true;
  }, 5000);
}
