// OBS へ送ってよい命令の許可リスト（Phase ごと）。ここに無い命令は、通信の手前で止める。
// 命令名は obs-websocket v5 の正式名（REFERENCES.md で出典を確認済み）。
// 仕様: docs/uizin-event-os/ARCHITECTURE.md §5.3、ACCEPTANCE_TESTS.md AT-P1-08

export const PHASE_REQUESTS = {
  1: [
    "GetVersion",
    "GetSceneList",
    "GetCurrentProgramScene",
    "SetCurrentProgramScene",
    "GetRecordStatus",
    "GetStreamStatus",
    "GetRecordDirectory",
    "GetStats",
  ],
  2: ["GetSceneItemList", "SetSceneItemEnabled", "GetSourceScreenshot"],
  3: ["StartRecord", "ResumeRecord", "GetProfileParameter"],
  4: ["GetInputList", "SetInputSettings", "CreateRecordChapter"],
  5: ["StartStream", "StopStream", "StopRecord"],
  6: [],
  7: ["SetInputMute"],
};

// どの Phase でも使わない命令。配信キーを平文で返す命令や、設定を書き換える命令。
export const NEVER_REQUESTS = [
  "GetStreamServiceSettings",
  "SetStreamServiceSettings",
  "SetProfileParameter",
  "ToggleStream",
  "ToggleRecord",
  "SetCurrentProfile",
  "SetCurrentSceneCollection",
  "RemoveScene",
  "RemoveInput",
];

export const LATEST_PHASE = 7;

export function allowedRequests(phase = LATEST_PHASE) {
  const set = new Set();
  for (const [key, names] of Object.entries(PHASE_REQUESTS)) {
    if (Number(key) <= phase) names.forEach(name => set.add(name));
  }
  for (const name of NEVER_REQUESTS) set.delete(name);
  return set;
}

// 中身まで見て止める命令（どの部品を書き換えてよいか）。
// ctx: { textInputs: Set, muteInputs: Set, camScene: string }
export function guardRequestData(type, data, ctx) {
  if (type === "SetInputSettings") {
    if (!ctx.textInputs.has(data?.inputName)) return `テロップ部品以外は書き換えません（${data?.inputName}）`;
    const keys = Object.keys(data?.inputSettings ?? {});
    if (keys.length !== 1 || keys[0] !== "text") return "テロップの文字以外は書き換えません";
  }
  if (type === "SetInputMute" && !ctx.muteInputs.has(data?.inputName)) {
    return `設定にない音声入力はさわりません（${data?.inputName}）`;
  }
  if (type === "SetSceneItemEnabled" && data?.sceneName !== ctx.camScene) {
    return `カメラ切替用のシーン以外はさわりません（${data?.sceneName}）`;
  }
  return null;
}
