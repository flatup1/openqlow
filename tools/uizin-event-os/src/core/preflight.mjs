// PRE-FLIGHT CHECK（開始前チェック）。機械で確かめたもの（✅）と人が確かめたもの（👤）を分けて並べる。
// 必須がすべてそろったら「大会を始められます」。純ロジック。
// 仕様: docs/uizin-event-os/EVENT_OS_SPEC.md §7

import { lamp } from "./health.mjs";
import { consentAcknowledged, notBroadcastCount } from "./engine.mjs";
import { musicUnknownCount, longNames } from "./card.mjs";
import { sceneNames, cameraNames, textNames } from "./desired.mjs";

export const HUMAN_ITEMS = [
  {
    id: "obs_record_settings",
    label: "OBSの「配信時に自動で録画」はOFF（またはONなら「配信停止時も録画を続ける」もON）",
    required: true,
    why: "この組み合わせだと、配信を止めたときに録画まで止まるため",
  },
  {
    id: "obs_auto_update_off",
    label: "OBSの自動更新をOFFにし、本番1週間前から更新していない",
    required: false,
    why: "更新で突然動かなくなる事故を防ぐため",
  },
  {
    id: "crash_runbook",
    label: "OBSが落ちたら再起動の画面で「通常モード」を選ぶ、と担当者が知っている",
    required: false,
    why: "セーフモードで起動するとEvent OSから操作できなくなるため",
  },
  {
    id: "youtube_tested",
    label: "このチャンネルで限定公開の配信テストをした（初回は使えるまで最大24時間かかる）",
    required: "stream",
    why: "当日に配信できないと分かる事故を防ぐため",
  },
  {
    id: "youtube_settings",
    label: "YouTubeの配信枠をJINが確認した（公開範囲・自動停止OFF・子ども向けの申告）",
    required: "stream",
    why: "公開範囲と子ども向けの申告は人が決めることだから",
  },
  {
    id: "music_policy",
    label: "市販の入場曲が配信に乗らないようにした（会場マイクも含めて）",
    required: "stream",
    why: "著作権の自動検出で配信が止まり、チャンネルが一定期間配信できなくなるおそれがあるため",
  },
];

const RISKY_FORMATS = new Set(["mp4", "mov"]);

function item(fields) {
  return { kind: "machine", required: true, detail: "", ...fields };
}

function lampItem(id, label, record, nowMs, required, okDetail) {
  const result = lamp(record, nowMs);
  return item({
    id,
    label,
    required,
    status: result.status,
    detail: result.status === "ok" ? okDetail ?? "" : result.message,
  });
}

// ctx: { state, config, obs, nowMs, rehearsal }
export function evaluatePreflight({ state, config, obs, nowMs, rehearsal }) {
  const items = [];
  const connected = lamp(obs?.connection, nowMs).status === "ok";
  const streamPlanned = !rehearsal && config?.stream?.enabled !== false;

  items.push(lampItem("obs_connected", "OBSにつながる", obs?.connection, nowMs, true, obs?.version ? `OBS ${obs.version.obsVersion}` : ""));

  const expected = config?.obs?.expectedVersion;
  if (expected) {
    const actual = obs?.version?.obsVersion;
    items.push(item({
      id: "obs_version",
      label: `OBSのバージョンが決めた版（${expected}）`,
      required: false,
      status: !actual ? "unknown" : actual === expected ? "ok" : "error",
      detail: actual ? `今は ${actual}` : "未確認",
    }));
  }

  const scenes = sceneNames(config);
  if (connected && Array.isArray(obs?.scenes)) {
    const missing = ["WAIT", "FIGHTER", "FIGHT", "WINNER", "SAFE", "CAM"].map(key => scenes[key]).filter(name => !obs.scenes.includes(name));
    items.push(item({
      id: "scenes",
      label: "決められたシーンがそろっている",
      status: missing.length === 0 ? "ok" : "error",
      detail: missing.length === 0 ? "" : `OBSに無いシーン: ${missing.join("、")}`,
    }));
  } else {
    items.push(item({ id: "scenes", label: "決められたシーンがそろっている", status: "unknown", detail: "OBSにつながっていません" }));
  }

  const cams = cameraNames(config);
  if (connected && obs?.camItems) {
    items.push(item({
      id: "cam_scene",
      label: `${scenes.CAM} シーンにメイン（${cams.main}）がある`,
      status: obs.camItems.main ? "ok" : "error",
      detail: obs.camItems.main ? "" : `${scenes.CAM} の中に ${cams.main} がありません`,
    }));
  } else {
    items.push(item({ id: "cam_scene", label: `${scenes.CAM} シーンにメイン（${cams.main}）がある`, status: "unknown", detail: "未確認" }));
  }

  const texts = Object.values(textNames(config));
  if (connected && Array.isArray(obs?.inputs)) {
    const missing = texts.filter(name => !obs.inputs.includes(name));
    items.push(item({
      id: "texts",
      label: "テロップ部品（EOS_ で始まる文字）がそろっている",
      status: missing.length === 0 ? "ok" : "error",
      detail: missing.length === 0 ? "" : `OBSに無い部品: ${missing.join("、")}`,
    }));
  } else {
    items.push(item({ id: "texts", label: "テロップ部品（EOS_ で始まる文字）がそろっている", status: "unknown", detail: "未確認" }));
  }

  items.push(lampItem("main_camera", "メインカメラが映っている", obs?.cameras?.main, nowMs, true));
  items.push(lampItem("sub_camera", "サブカメラが映っている", obs?.cameras?.sub, nowMs, false));

  const minFreeGB = config?.recording?.minFreeGB ?? 50;
  const disk = obs?.disk;
  if (disk && typeof disk.freeBytes === "number") {
    const freeGB = disk.freeBytes / 1024 ** 3;
    items.push(item({
      id: "disk",
      label: `録画の空き容量（${minFreeGB}GB以上）`,
      status: freeGB >= minFreeGB ? "ok" : "error",
      detail: `空き ${freeGB.toFixed(1)}GB`,
    }));
  } else {
    items.push(item({ id: "disk", label: `録画の空き容量（${minFreeGB}GB以上）`, status: "unknown", detail: disk?.message ?? "未確認" }));
  }

  const format = obs?.recFormat;
  if (format) {
    const risky = RISKY_FORMATS.has(format);
    items.push(item({
      id: "rec_format",
      label: "録画形式が「落ちても壊れにくい形式」",
      status: risky ? "error" : "ok",
      detail: risky
        ? `今は ${format}。OBSが落ちると録画が全部失われます。Hybrid MP4/MOV か MKV にしてください`
        : format.startsWith("hybrid") ? `${format}（チャプターも入ります）` : `${format}（チャプターは入りません）`,
    }));
  } else {
    items.push(item({ id: "rec_format", label: "録画形式が「落ちても壊れにくい形式」", status: "unknown", detail: "未確認" }));
  }

  if (state.card) {
    items.push(item({ id: "card", label: "試合データ", status: "ok", detail: `${state.card.bouts.length}試合` }));
    const ng = notBroadcastCount(state);
    items.push(item({
      id: "consent",
      kind: "human",
      label: `配信しない試合（${ng}試合）を確認した`,
      status: consentAcknowledged(state) ? "ok" : "error",
      detail: ng === 0 ? "配信しない試合はありません" : "運営モードで「確認した」を押してください",
    }));
    const unknownMusic = musicUnknownCount(state.card.bouts);
    items.push(item({
      id: "music",
      label: "入場曲が決まっている",
      required: false,
      status: unknownMusic === 0 ? "ok" : "error",
      detail: unknownMusic === 0 ? "" : `${unknownMusic}選手の入場曲が未確認です`,
    }));
    const tooLong = longNames(state.card.bouts);
    items.push(item({
      id: "names",
      label: "表示名がテロップに収まる長さ",
      required: false,
      status: tooLong.length === 0 ? "ok" : "error",
      detail: tooLong.length === 0 ? "" : `長い表示名: ${tooLong.join("、")}`,
    }));
  } else {
    items.push(item({ id: "card", label: "試合データ", status: "error", detail: "まだ読み込んでいません" }));
  }

  const audio = obs?.audio;
  items.push(item({
    id: "audio",
    label: "配信に乗る音が出ている（音のチェック）",
    required: false,
    status: !audio ? "unknown" : audio.ok ? "ok" : "error",
    detail: !audio ? "運営モードの「音のチェック」で確かめます" : audio.message,
  }));

  if (obs?.power) {
    items.push(item({
      id: "power",
      label: "Macが電源につながっている",
      required: false,
      status: obs.power.onAC === true ? "ok" : obs.power.onAC === false ? "error" : "unknown",
      detail: obs.power.onAC === false ? "電池で動いています" : "",
    }));
  }

  for (const human of HUMAN_ITEMS) {
    const required = human.required === "stream" ? streamPlanned : human.required;
    if (human.required === "stream" && !streamPlanned) continue;
    const checked = state.humanChecks?.[human.id]?.checked === true;
    items.push(item({
      id: human.id,
      kind: "human",
      label: human.label,
      required,
      status: checked ? "ok" : "error",
      detail: checked ? "" : human.why,
    }));
  }

  const blocking = items.filter(entry => entry.required && entry.status !== "ok");
  return { items, ready: blocking.length === 0, blocking: blocking.map(entry => entry.id) };
}
