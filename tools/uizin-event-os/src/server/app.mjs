// Event OS 本体。状態エンジン・操作記録・OBS Adapter をつなぐ司令塔。
//  - 押された操作を受け付け（版番号で二重操作を防ぐ）、記録し、あるべき姿を Adapter に渡す。
//  - Adapter の様子を見て、サブカメラが映らなければメインへ自動で戻す（逆向きは人が戻す）。
//  - 危険な操作は運営モード＋確認つき、練習モードでは配信の操作をそもそも受け付けない。
// 仕様: docs/uizin-event-os/ARCHITECTURE.md、EVENT_OS_SPEC.md

import { EventEmitter } from "node:events";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decide, reduce, roleAtLeast, isEngineCommand, currentBout } from "../core/engine.mjs";
import { desiredOutputs } from "../core/desired.mjs";
import { evaluatePreflight } from "../core/preflight.mjs";
import { buildView } from "../core/view.mjs";
import { parseCard } from "../core/card.mjs";
import { lamp } from "../core/health.mjs";
import { youtubeChapters, clipperManifests, truthYaml, resultsCsv } from "../core/exports.mjs";
import { EventLog, logFileFor, writeFileAtomic } from "./store.mjs";

// エンジン以外の操作と、必要なモード・確認の有無。
const ADAPTER_COMMANDS = {
  record_start: { role: "easy", confirm: false },
  record_resume: { role: "easy", confirm: false },
  resume_auto: { role: "easy", confirm: false },
  record_stop: { role: "operator", confirm: true },
  stream_start: { role: "operator", confirm: true, live: true },
  stream_stop: { role: "operator", confirm: true },
  stream_restart: { role: "operator", confirm: true, live: true },
  audio_check: { role: "operator", confirm: false },
  export: { role: "operator", confirm: false },
  obs_reconnect: { role: "admin", confirm: false },
  set_mode: { role: "admin", confirm: true },
  chaos: { role: "admin", confirm: false, rehearsal: true },
};

export class EventOsApp extends EventEmitter {
  constructor({ config, dataDir, adapter, fake = null, now = Date.now, extras = {} }) {
    super();
    this.config = config;
    this.dataDir = dataDir;
    this.adapter = adapter;
    this.fake = fake;
    this.now = now;
    this.extras = extras;
    this.power = null;
    this.broadcastTimer = null;
    this.mode = "live";
    this.storageError = null;
  }

  init() {
    mkdirSync(this.dataDir, { recursive: true });
    const modeFile = join(this.dataDir, "mode.json");
    if (existsSync(modeFile)) {
      try {
        const saved = JSON.parse(readFileSync(modeFile, "utf8"));
        if (saved.mode === "rehearsal") this.mode = "rehearsal";
      } catch {
        this.mode = "live";
      }
    }
    this.openLog(this.mode);
    this.adapter.on("change", () => this.onAdapterChange());
    this.adapter.on("observation", observation => this.recordQuietly([{ ...observation, role: "system", by: "obs" }]));
    this.adapter.on("manual", info => this.recordQuietly([{ type: "OBS_MANUAL", scene: info.scene, reason: info.reason, role: "system", by: "obs", at: this.iso() }]));
    return this;
  }

  iso() {
    return new Date(this.now()).toISOString();
  }

  openLog(mode) {
    this.mode = mode;
    this.log = new EventLog(logFileFor(this.dataDir, mode));
    this.recompute();
  }

  get rehearsal() {
    return this.mode === "rehearsal";
  }

  record(entries) {
    let written;
    try {
      written = this.log.append(entries.map(entry => ({ at: this.iso(), ...entry })));
      this.storageError = null;
    } catch (error) {
      this.storageError = error.message;
      this.scheduleBroadcast();
      throw error;
    }
    this.recompute();
    return written;
  }

  // OBS の知らせや自動の切り替えから記録するとき。保存に失敗しても、Event OS 自体は止めない
  // （画面に ❌ を出し続ける）。
  recordQuietly(entries) {
    try {
      return this.record(entries);
    } catch {
      return [];
    }
  }

  recompute() {
    this.state = reduce(this.log.events);
    this.desired = desiredOutputs(this.state, this.config);
    this.adapter.setDesired(this.desired, this.state.phase);
    this.scheduleBroadcast();
  }

  obsSnapshot() {
    return { ...this.adapter.snapshot(), power: this.power };
  }

  preflight() {
    return evaluatePreflight({ state: this.state, config: this.config, obs: this.obsSnapshot(), nowMs: this.now(), rehearsal: this.rehearsal });
  }

  view(role) {
    const obs = this.obsSnapshot();
    return buildView({
      state: this.state,
      config: this.config,
      obs,
      preflight: evaluatePreflight({ state: this.state, config: this.config, obs, nowMs: this.now(), rehearsal: this.rehearsal }),
      nowMs: this.now(),
      role,
      rehearsal: this.rehearsal,
      storageError: this.storageError,
      findEventType: seq => this.log.find(seq)?.type,
      extras: {
        ...this.extras,
        mode: this.mode,
        demo: Boolean(this.fake),
        simulate: obs.simulate,
        obsError: obs.lastError,
        sceneMissing: obs.sceneMissing,
        program: obs.program,
      },
    });
  }

  setPower(power) {
    this.power = power;
    this.scheduleBroadcast();
  }

  scheduleBroadcast() {
    if (this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      this.emit("change");
    }, 50);
  }

  // Adapter の様子が変わったとき。カメラの自動退避もここで決める。
  onAdapterChange() {
    const state = this.state;
    if (state.phase === "running" && !state.safe) {
      const obs = this.adapter.snapshot();
      const nowMs = this.now();
      const main = lamp(obs.cameras.main, nowMs).status;
      const sub = lamp(obs.cameras.sub, nowMs).status;
      if (state.camera === "sub" && sub === "error") {
        this.recordQuietly([{ type: "CAMERA", to: "main", auto: true, reason: "サブが映らないのでメインに戻しました", role: "system", by: "eventos" }]);
      } else if (state.camera === "main" && main === "error" && sub === "ok") {
        this.recordQuietly([{ type: "CAMERA", to: "sub", auto: true, reason: "メインが映らないのでサブにしました", role: "system", by: "eventos" }]);
      }
    }
    this.scheduleBroadcast();
  }

  // cmd: { type, args, expectedRev, confirm }、auth: { role, device }
  async handle(cmd, auth) {
    const role = auth?.role ?? "easy";
    const device = auth?.device ?? "unknown";
    if (!cmd || typeof cmd.type !== "string") return { ok: false, message: "操作が分かりません" };

    if (isEngineCommand(cmd.type)) return this.handleEngine(cmd, role, device);

    const rule = ADAPTER_COMMANDS[cmd.type];
    if (!rule) return { ok: false, message: "知らない操作です" };
    if (!roleAtLeast(role, rule.role)) return { ok: false, message: "この操作は運営モードで行います" };
    if (rule.confirm && cmd.confirm !== true) return { ok: false, code: "confirm", message: "確認が必要な操作です" };
    if (rule.live && this.rehearsal) return { ok: false, message: "練習モードでは配信の操作はできません" };
    if (rule.rehearsal && !this.rehearsal) return { ok: false, message: "わざと壊す練習は、練習モードのときだけ使えます" };

    const audit = extra => this.recordQuietly([{ type: "OPERATOR_ACTION", action: cmd.type, role, by: device, ...extra }]);
    switch (cmd.type) {
      case "record_start": {
        const result = await this.adapter.startRecord();
        audit({ ok: result.ok });
        return result;
      }
      case "record_resume": {
        const result = await this.adapter.resumeRecord();
        audit({ ok: result.ok });
        return result;
      }
      case "record_stop": {
        const result = await this.adapter.stopRecord();
        audit({ ok: result.ok });
        return result;
      }
      case "stream_start": {
        const result = await this.adapter.startStream();
        audit({ ok: result.ok });
        return result;
      }
      case "stream_stop": {
        const result = await this.adapter.stopStream();
        audit({ ok: result.ok });
        return result;
      }
      case "stream_restart": {
        const result = await this.adapter.restartStream();
        audit({ ok: result.ok });
        return result;
      }
      case "resume_auto":
        await this.adapter.resumeAuto();
        audit({});
        return { ok: true, message: "自動の切り替えに戻しました" };
      case "audio_check":
        return this.adapter.audioCheck(Number(cmd.args?.ms) > 0 ? Number(cmd.args.ms) : 3000);
      case "obs_reconnect":
        this.adapter.reconnect();
        return { ok: true, message: "OBSにつなぎ直しています" };
      case "set_mode":
        return this.setMode(cmd.args?.mode === "rehearsal" ? "rehearsal" : "live");
      case "chaos":
        return this.chaos(cmd.args ?? {});
      case "export":
        return this.exportFiles();
      default:
        return { ok: false, message: "知らない操作です" };
    }
  }

  // 本番と練習の切り替え。配信中（または配信しているか分からない）ときは練習にしない。
  // 切り替えたら、今の録画・配信の状態を新しい記録にも書いておく（書き出しで録画が消えないように）。
  setMode(mode) {
    const obs = this.adapter.snapshot();
    if (mode === "rehearsal" && obs.stream.active !== false) {
      return {
        ok: false,
        message: obs.stream.active ? "配信中です。先に「配信を終える」を押してから練習モードにしてください" : "配信しているか確かめられません。OBSにつながってから切り替えてください",
      };
    }
    writeFileAtomic(join(this.dataDir, "mode.json"), JSON.stringify({ mode }));
    this.openLog(mode);
    const carry = [];
    if (obs.record.active === true) carry.push({ type: "OBS_RECORD", active: true, path: null, at: obs.record.startedAt ?? this.iso(), role: "system", by: "obs" });
    if (obs.stream.active === true) carry.push({ type: "OBS_STREAM", active: true, at: obs.stream.startedAt ?? this.iso(), role: "system", by: "obs" });
    if (carry.length > 0) this.recordQuietly(carry);
    return { ok: true, message: mode === "rehearsal" ? "練習モードにしました（配信の操作はできません）" : "本番モードにしました" };
  }

  handleEngine(cmd, role, device) {
    let command = cmd;
    let warnings;
    if (cmd.type === "load_card") {
      const parsed = parseCard(cmd.args?.csv ?? "");
      if (!parsed.ok) return { ok: false, code: "card", message: "試合データを読み込めませんでした", errors: parsed.errors };
      command = { ...cmd, args: { bouts: parsed.bouts, hash: parsed.hash, source: "csv" } };
      warnings = parsed.warnings;
    }
    const decision = decide(
      {
        state: this.state,
        role,
        now: this.iso(),
        config: this.config,
        device,
        preflightReady: cmd.type === "start_event" ? this.preflight().ready : true,
        findEventType: seq => this.log.find(seq)?.type,
      },
      command,
    );
    if (!decision.ok) return { ok: false, code: decision.code, message: decision.message, rev: this.state.rev };
    // 判定と記録の間に await を挟まない（2台同時押しでも1回分だけ進むように）。
    const written = decision.events.length > 0 ? this.record(decision.events) : [];
    this.afterEngine(written);
    const note = warnings?.length ? `（注意 ${warnings.length}件）` : "";
    return { ok: true, message: `受け付けました${note}`, rev: this.state.rev, warnings };
  }

  // 記録した操作に続けて、OBS へ行う「おまけ」の操作（失敗しても進行は止めない）。
  afterEngine(written) {
    for (const event of written) {
      const recordAllowed = !this.rehearsal || this.config?.rehearsal?.record === true;
      if (event.type === "START_EVENT" && recordAllowed) {
        this.adapter.startRecord().then(() => this.scheduleBroadcast(), () => this.scheduleBroadcast());
      }
      if (event.type === "FIGHT_START") {
        const bout = currentBout(this.state);
        if (bout && bout.broadcast === "OK") this.adapter.chapter(`第${bout.no}試合`);
      }
      if (event.type === "SAFE" && event.on) {
        // 🛟 は「考えずに押すボタン」。手動モードも解いて SAFE に切り替え、録画が止まっていれば始める
        // （練習で録画しない設定なら始めない）。配信には触らない。
        this.adapter.resumeAuto().catch(() => {});
        if (recordAllowed) this.adapter.startRecord().catch(() => {});
      }
    }
  }

  async chaos(args) {
    const kind = args.kind;
    if (kind === "obs_down") {
      this.adapter.simulateObsDown(Number(args.seconds) > 0 ? Number(args.seconds) : 15);
      return { ok: true, message: "練習：OBSとの接続を切りました" };
    }
    if (kind === "main_dead" || kind === "sub_dead") {
      const key = kind === "main_dead" ? "mainDead" : "subDead";
      this.adapter.setSimulate({ [key]: args.on !== false });
      return { ok: true, message: args.on !== false ? "練習：カメラを故障中にしました" : "練習：カメラを元に戻しました" };
    }
    if (!this.fake) return { ok: false, message: "この擬似故障は「体験モード（偽物のOBS）」でだけ使えます" };
    switch (kind) {
      case "fake_crash":
        this.fake.crash();
        return { ok: true, message: "体験：OBSが落ちました" };
      case "fake_restart":
        this.fake.restart();
        return { ok: true, message: "体験：OBSを起動し直しました（録画は止まっています）" };
      case "fake_stop_record":
        this.fake.externalStopRecord();
        return { ok: true, message: "体験：録画が止まりました" };
      case "fake_human_scene":
        this.fake.humanSetScene(args.scene || "SAFE");
        return { ok: true, message: "体験：人がOBSで場面を変えました" };
      case "fake_stream_reconnecting":
        this.fake.setStreamReconnecting(args.on !== false);
        return { ok: true, message: "体験：配信のつなぎ直しを切り替えました" };
      default:
        return { ok: false, message: "知らない擬似故障です" };
    }
  }

  exportFiles() {
    const stamp = this.iso().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
    const dir = join(this.dataDir, "exports", `${this.mode}-${stamp}`);
    mkdirSync(dir, { recursive: true });
    const eventName = this.config?.eventName ?? "UIZIN";
    const written = [];
    const chapters = youtubeChapters(this.state);
    writeFileSync(join(dir, "youtube_chapters.txt"), chapters.ok ? `${chapters.text}\n` : `（作れませんでした：${chapters.reason}）\n`);
    written.push("youtube_chapters.txt");
    writeFileSync(join(dir, "results.csv"), resultsCsv(this.state));
    written.push("results.csv");
    const truth = truthYaml(this.state);
    if (truth) {
      writeFileSync(join(dir, "truth.yml"), truth);
      written.push("truth.yml");
    }
    const manifests = clipperManifests(this.state, {
      eventName,
      preRollSec: this.config?.export?.preRollSec ?? 6,
      postRollSec: this.config?.export?.postRollSec ?? 20,
      generatedAt: this.iso(),
    });
    for (const { fileNo, manifest } of manifests) {
      const sub = join(dir, "clipper", String(fileNo).padStart(2, "0"));
      mkdirSync(sub, { recursive: true });
      writeFileSync(join(sub, "segments.json"), `${JSON.stringify(manifest, null, 2)}\n`);
      written.push(`clipper/${String(fileNo).padStart(2, "0")}/segments.json`);
    }
    writeFileSync(
      join(dir, "README.txt"),
      [
        "UIZIN Event OS の書き出し",
        "",
        "youtube_chapters.txt  YouTube の概要欄に貼るチャプター（試合番号だけ。選手名は入れていません）",
        "results.csv           結果の一覧（Google Sheets に手で戻すとき用）",
        "truth.yml             切り抜きツールの精度を確かめる正解データ（試合中の区間）",
        "clipper/NN/segments.json  切り抜きツール用の区間。録画ファイル1つにつき1フォルダ。",
        "",
        "切り抜きツールで使うとき：segments.json の source.path が空なら録画ファイルの場所を書き入れ、",
        "  python -m uizin_clipper render --manifest <このフォルダ>/segments.json --video <録画ファイル>",
        "区間は locked:true（検出し直しで上書きされない）。この書き出しには選手の表示名が入るので、共有やコミットはしないでください。",
      ].join("\n"),
    );
    this.record([{ type: "OPERATOR_ACTION", action: "export", role: "operator", by: "eventos", files: written.length }]);
    return { ok: true, message: `書き出しました（${written.length}ファイル）`, dir };
  }
}
