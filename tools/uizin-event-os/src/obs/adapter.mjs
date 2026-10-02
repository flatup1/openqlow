// OBS Adapter。Event OS の「あるべき姿」に OBS を合わせ（reconcile）、OBS の様子を報告する。
// 守ること（ARCHITECTURE.md §4・§5）:
//  - 失敗を外に投げない。時間を区切る。確かめていないのに ok と言わない。
//  - 人が OBS を直接さわったら「手動モード」にして、自動で上書きしない。
//  - 送ってよい命令は Phase ごとの許可リストだけ。配信キーを読む命令は使わない。

import { EventEmitter } from "node:events";
import { statfs as statfsAsync } from "node:fs/promises";
import { ObsClient, BASE_SUBSCRIPTIONS, EVENT_SUB, CLOSE, STATUS, ObsRequestError } from "./protocol.mjs";
import { allowedRequests, guardRequestData, LATEST_PHASE } from "./allowlist.mjs";
import { initialTrack, nextTrack } from "./frame_check.mjs";
import { sceneNames, cameraNames, textNames } from "../core/desired.mjs";

const OUT = {
  STARTED: "OBS_WEBSOCKET_OUTPUT_STARTED",
  STOPPED: "OBS_WEBSOCKET_OUTPUT_STOPPED",
  PAUSED: "OBS_WEBSOCKET_OUTPUT_PAUSED",
  RESUMED: "OBS_WEBSOCKET_OUTPUT_RESUMED",
  RECONNECTING: "OBS_WEBSOCKET_OUTPUT_RECONNECTING",
  RECONNECTED: "OBS_WEBSOCKET_OUTPUT_RECONNECTED",
};

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export class ObsAdapter extends EventEmitter {
  constructor({ config, password, WebSocketImpl, now = Date.now, statfs = statfsAsync, timings = {} }) {
    super();
    this.config = config;
    this.password = password ?? "";
    this.now = now;
    this.statfs = statfs;
    this.url = config?.obs?.url ?? "ws://127.0.0.1:4455";
    this.timings = {
      pollMs: 2000,
      reconnectBaseMs: 1000,
      reconnectMaxMs: 10_000,
      requestTimeoutMs: 3000,
      connectTimeoutMs: 5000,
      pendingMs: 5000,
      diskEveryTicks: 10,
      ...timings,
    };
    this.phase = config?.obs?.phase ?? LATEST_PHASE;
    this.allowed = allowedRequests(this.phase);
    this.client = new ObsClient({
      WebSocketImpl,
      allowed: this.allowed,
      timeoutMs: this.timings.requestTimeoutMs,
      connectTimeoutMs: this.timings.connectTimeoutMs,
    });
    this.client.on("event", (type, data) => this.onEvent(type, data));
    this.client.on("close", info => this.onClose(info));

    const scenes = sceneNames(config);
    this.names = { scenes, cams: cameraNames(config), texts: textNames(config) };
    this.guardCtx = {
      textInputs: new Set(Object.values(this.names.texts)),
      muteInputs: new Set(config?.audio?.muteDuringEntrance ?? []),
      camScene: scenes.CAM,
    };

    this.state = {
      connection: { status: "unknown", checkedAt: null, message: "まだつないでいません", reason: null },
      version: null,
      imageFormats: [],
      scenes: null,
      inputs: null,
      camItems: null,
      subItemId: null,
      program: null,
      sceneMissing: null,
      cameras: { main: initialTrack(), sub: initialTrack() },
      record: { active: null, paused: false, checkedAt: null, startedAt: null },
      stream: { active: null, checkedAt: null, reconnectingSince: null, wanted: false, startedAt: null },
      recordDirectory: null,
      disk: null,
      recFormat: null,
      audio: null,
      manual: false,
      chaptersSupported: null,
      lastError: null,
    };
    this.desired = null;
    this.eventPhase = "setup";
    this.applied = { texts: {}, mute: {}, subVisible: null };
    this.pendingScenes = new Map();
    this.pendingSub = null;
    this.connectedOnce = false;
    this.attempt = 0;
    this.stopped = true;
    this.halted = false;
    this.blockedUntil = 0;
    this.reconnectTimer = null;
    this.pollTimer = null;
    this.ticks = 0;
    this.polling = false;
    this.reconciling = false;
    this.dirty = false;
    this.simulate = { mainDead: false, subDead: false };
    this.meters = null;
    this.connectId = 0;
    this.syncing = false;
    this.lastAnswerAt = null;
  }

  // ---- 起動と停止 ----

  start() {
    this.stopped = false;
    this.connectNow();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.stopPolling();
    this.client.close();
  }

  reconnect() {
    this.halted = false;
    this.attempt = 0;
    this.blockedUntil = 0;
    clearTimeout(this.reconnectTimer);
    this.connectNow();
  }

  async connectNow() {
    if (this.stopped || this.halted) return;
    const wait = this.blockedUntil - this.now();
    if (wait > 0) {
      this.scheduleReconnect(wait);
      return;
    }
    // 古い接続の試みが後から失敗しても、新しい接続を壊さない。
    const id = ++this.connectId;
    try {
      await this.client.connect(this.url, this.password, BASE_SUBSCRIPTIONS);
    } catch (error) {
      if (id === this.connectId) this.onConnectFailure(error);
      return;
    }
    if (id !== this.connectId) return;
    clearTimeout(this.reconnectTimer);
    this.attempt = 0;
    try {
      await this.onIdentified();
    } catch (error) {
      this.state.lastError = error.message;
    }
  }

  scheduleReconnect(delayMs) {
    if (this.stopped || this.halted) return;
    clearTimeout(this.reconnectTimer);
    const delay = delayMs ?? Math.min(this.timings.reconnectMaxMs, this.timings.reconnectBaseMs * 2 ** this.attempt);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => this.connectNow().catch(error => this.noteError(error)), delay);
  }

  setConnection(status, reason, message) {
    this.state.connection = { status, reason, message, checkedAt: this.now() };
    this.emitChange();
  }

  onConnectFailure(error) {
    if (error.code === CLOSE.AUTH_FAILED) {
      this.halted = true;
      this.setConnection("error", "auth", "OBSのパスワードが違います");
      return;
    }
    if (error.code === CLOSE.SESSION_INVALIDATED) {
      this.halted = true;
      this.setConnection("error", "kicked", "OBS側から接続を切られました");
      return;
    }
    this.setConnection("error", "refused", "OBSにつながりません（OBSが閉じているか、リモート操作がOFF）");
    this.scheduleReconnect();
  }

  // 接続が切れたら、録画・配信の状態は「未確認」にする。録画中だったなら、切れた時刻で区切りを記録する
  // （OBS が落ちたなら録画ファイルはそこで終わっている。続いていたなら、つながり直した時に開き直す）。
  markDisconnected() {
    const at = new Date(this.now()).toISOString();
    for (const [key, type] of [["record", "OBS_RECORD"], ["stream", "OBS_STREAM"]]) {
      const output = this.state[key];
      if (output.active === true) this.safeEmit("observation", { type, active: false, path: null, at, reason: "disconnect" });
      this.state[key] = { ...output, active: null, paused: false, checkedAt: null, reconnectingSince: null };
    }
  }

  onClose(info) {
    if (!info.wasIdentified) return;
    this.stopPolling();
    this.markDisconnected();
    if (info.code === CLOSE.SESSION_INVALIDATED) {
      this.halted = true;
      this.setConnection("error", "kicked", "OBS側から接続を切られました");
      return;
    }
    if (this.state.connection.reason !== "exiting") {
      this.setConnection("error", "lost", "OBSとの接続が切れました（自動でつなぎ直しています）");
    } else {
      this.state.connection.checkedAt = this.now();
    }
    this.scheduleReconnect();
  }

  async onIdentified() {
    const first = !this.connectedOnce;
    this.connectedOnce = true;
    this.applied = { texts: {}, mute: {}, subVisible: null };
    this.pendingScenes.clear();
    this.lastAnswerAt = this.now();
    this.setConnection("ok", null, "");
    // 様子を読み終わるまでは、姿を合わせない（読んでいる途中の合わせ込みで、人の操作を上書きしないため）。
    this.syncing = true;
    try {
      await this.refreshAll();
    } finally {
      this.syncing = false;
    }
    // Event OS を大会の途中で起動し直したとき、OBS が予定と違う場面・カメラなら、人が触った可能性がある。
    // 勝手に変えず、手動モードで知らせる（ARCHITECTURE.md §5.2・AT-P6 C6）。
    const d = this.desired;
    const sceneDiffers = Boolean(d && this.state.program && this.state.program !== d.programScene);
    const subDiffers = Boolean(d && this.applied.subVisible != null && this.applied.subVisible !== d.subVisible);
    if (first && this.eventPhase === "running" && (sceneDiffers || subDiffers)) {
      this.state.manual = true;
      this.safeEmit("manual", { scene: this.state.program, reason: "start_mismatch" });
    }
    await this.reconcile(true);
    this.startPolling();
    this.emitChange();
  }

  // ---- 命令（許可リストと中身の確認を通してから送る） ----

  // OBS から返事が来たら（成功でも失敗の返事でも）、その時刻を「確かめた時刻」として覚える。
  req(type, data) {
    const problem = guardRequestData(type, data, this.guardCtx);
    if (problem) return Promise.reject(new ObsRequestError(problem, "guard"));
    return this.client.request(type, data).then(
      result => {
        this.lastAnswerAt = this.now();
        return result;
      },
      error => {
        if (typeof error.code === "number") this.lastAnswerAt = this.now();
        throw error;
      },
    );
  }

  async tryReq(type, data) {
    try {
      return await this.req(type, data);
    } catch (error) {
      this.state.lastError = error.message;
      return null;
    }
  }

  // ---- 様子を読む ----

  async refreshAll() {
    await this.refreshOutputs();
    const version = await this.tryReq("GetVersion");
    if (version) {
      this.state.version = { obsVersion: version.obsVersion, obsWebSocketVersion: version.obsWebSocketVersion };
      this.state.imageFormats = version.supportedImageFormats ?? [];
    }
    await this.refreshScenes();
    await this.refreshInputs();
    await this.refreshCamItems();
    await this.refreshRecordSettings();
    await this.refreshDisk();
  }

  async refreshScenes() {
    const list = await this.tryReq("GetSceneList");
    if (!list) return;
    this.state.scenes = (list.scenes ?? []).map(scene => scene.sceneName);
    if (list.currentProgramSceneName) this.state.program = list.currentProgramSceneName;
  }

  async refreshInputs() {
    if (!this.allowed.has("GetInputList")) return;
    const list = await this.tryReq("GetInputList");
    if (list) this.state.inputs = (list.inputs ?? []).map(input => input.inputName);
  }

  async refreshCamItems() {
    if (!this.allowed.has("GetSceneItemList")) return;
    const cam = this.names.scenes.CAM;
    if (this.state.scenes && !this.state.scenes.includes(cam)) {
      this.state.camItems = { main: false, sub: false };
      this.state.subItemId = null;
      return;
    }
    const list = await this.tryReq("GetSceneItemList", { sceneName: cam });
    if (!list) return;
    const items = list.sceneItems ?? [];
    const main = items.find(item => item.sourceName === this.names.cams.main);
    const sub = items.find(item => item.sourceName === this.names.cams.sub);
    this.state.camItems = { main: Boolean(main), sub: Boolean(sub) };
    this.state.subItemId = sub ? sub.sceneItemId : null;
    if (sub) this.applied.subVisible = Boolean(sub.sceneItemEnabled);
  }

  async refreshRecordSettings() {
    if (!this.allowed.has("GetProfileParameter")) return;
    const mode = await this.tryReq("GetProfileParameter", { parameterCategory: "Output", parameterName: "Mode" });
    const category = mode?.parameterValue === "Advanced" ? "AdvOut" : "SimpleOutput";
    const format = await this.tryReq("GetProfileParameter", { parameterCategory: category, parameterName: "RecFormat2" });
    if (format?.parameterValue) this.state.recFormat = String(format.parameterValue);
  }

  async refreshOutputs() {
    const record = await this.tryReq("GetRecordStatus");
    if (record) {
      this.updateRecord(Boolean(record.outputActive), { durationMs: record.outputDuration });
      this.state.record.paused = Boolean(record.outputActive && record.outputPaused);
    }
    const stream = await this.tryReq("GetStreamStatus");
    if (stream) {
      this.updateStream(Boolean(stream.outputActive), { durationMs: stream.outputDuration });
      if (stream.outputReconnecting && this.state.stream.reconnectingSince == null) this.state.stream.reconnectingSince = this.now();
      if (!stream.outputReconnecting) this.state.stream.reconnectingSince = null;
    }
  }

  async refreshDisk() {
    const dir = await this.tryReq("GetRecordDirectory");
    if (dir?.recordDirectory) this.state.recordDirectory = dir.recordDirectory;
    let host = "";
    try {
      host = new URL(this.url).hostname;
    } catch {
      host = "";
    }
    if (!LOCAL_HOSTS.has(host)) {
      this.state.disk = { message: "OBSが別のパソコンのため、空き容量はそのパソコンで確かめてください" };
      return;
    }
    if (!this.state.recordDirectory) return;
    try {
      const info = await this.statfs(this.state.recordDirectory);
      this.state.disk = { freeBytes: Number(info.bavail) * Number(info.bsize), checkedAt: this.now() };
    } catch {
      this.state.disk = { message: "録画フォルダが見つかりません" };
    }
  }

  updateRecord(active, { durationMs, path } = {}) {
    const previous = this.state.record.active;
    this.state.record = { ...this.state.record, active, checkedAt: this.now() };
    if (!active) this.state.record.paused = false;
    if (previous === active || (previous === null && !active)) return;
    const at = new Date(active && durationMs > 0 ? this.now() - durationMs : this.now()).toISOString();
    this.state.record.startedAt = active ? at : null;
    this.safeEmit("observation", { type: "OBS_RECORD", active, path: path ?? null, at });
  }

  updateStream(active, { durationMs } = {}) {
    const previous = this.state.stream.active;
    this.state.stream = { ...this.state.stream, active, checkedAt: this.now() };
    if (!active) this.state.stream.reconnectingSince = null;
    if (previous === active || (previous === null && !active)) return;
    const at = new Date(active && durationMs > 0 ? this.now() - durationMs : this.now()).toISOString();
    this.state.stream.startedAt = active ? at : null;
    this.safeEmit("observation", { type: "OBS_STREAM", active, at });
  }

  // ---- 定期の見回り ----

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.tick().catch(error => this.noteError(error)), this.timings.pollMs);
  }

  stopPolling() {
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  async tick() {
    if (!this.client.identified || this.polling) return;
    this.polling = true;
    try {
      this.ticks += 1;
      await this.refreshOutputs();
      await this.checkCameras();
      if (this.ticks % this.timings.diskEveryTicks === 0) {
        await this.refreshDisk();
        await this.refreshScenes();
        await this.refreshInputs();
        await this.refreshCamItems();
      }
      // 返事があったときだけ「確かめた」とする（OBS が固まっていたら、ランプは自然に「未確認」になる）。
      if (this.lastAnswerAt != null && this.state.connection.status === "ok") {
        this.state.connection.checkedAt = Math.max(this.state.connection.checkedAt ?? 0, this.lastAnswerAt);
      }
      // 命令が届かなかった場合に備え、ずれていれば合わせ直す（違うところだけ送る）。
      if (this.drifted()) await this.reconcile(false);
      this.emitChange();
    } finally {
      this.polling = false;
    }
  }

  drifted() {
    const d = this.desired;
    if (!d) return false;
    if (!this.state.manual) {
      if (this.state.program !== d.programScene && !this.pendingScenes.has(d.programScene) && !this.state.sceneMissing) return true;
      if (this.state.subItemId != null && this.applied.subVisible !== d.subVisible) return true;
    }
    const inputs = Array.isArray(this.state.inputs) ? this.state.inputs : [];
    for (const [name, value] of Object.entries(d.texts ?? {})) {
      if (inputs.includes(name) && this.applied.texts[name] !== value) return true;
    }
    for (const [name, muted] of Object.entries(d.mute ?? {})) {
      if (inputs.includes(name) && this.applied.mute[name] !== muted) return true;
    }
    return false;
  }

  async checkCameras() {
    if (!this.allowed.has("GetSourceScreenshot")) return;
    if (!this.state.imageFormats.includes("bmp")) {
      for (const key of ["main", "sub"]) {
        this.state.cameras[key] = { ...initialTrack(), message: "このOBSでは映像の確認ができません（bmp非対応）" };
      }
      return;
    }
    for (const key of ["main", "sub"]) {
      const name = this.names.cams[key];
      if (Array.isArray(this.state.inputs) && !this.state.inputs.includes(name)) {
        this.state.cameras[key] = { ...initialTrack(), status: "error", checkedAt: this.now(), message: `OBSに「${name}」がありません` };
        continue;
      }
      let sample;
      if (this.simulate[`${key}Dead`]) {
        sample = { ok: false, error: "練習：故障中" };
      } else {
        try {
          // 幅と高さを両方指定する（片方だけだと、映像が無いときの結果が不定になる。REFERENCES.md）
          const shot = await this.req("GetSourceScreenshot", { sourceName: name, imageFormat: "bmp", imageWidth: 32, imageHeight: 18 });
          sample = { ok: true, data: shot.imageData };
        } catch (error) {
          if (error.code === "closed" || error.code === "not_connected") return;
          sample = { ok: false, error: error.message };
        }
      }
      this.state.cameras[key] = nextTrack(this.state.cameras[key], sample, this.now());
    }
  }

  // ---- あるべき姿に合わせる ----

  setDesired(desired, eventPhase) {
    this.desired = desired;
    this.eventPhase = eventPhase ?? this.eventPhase;
    this.reconcile(false).catch(error => this.noteError(error));
  }

  async reconcile(force) {
    if (!this.client.identified || !this.desired) return;
    if (this.syncing) return;
    if (this.reconciling) {
      this.dirty = true;
      return;
    }
    this.reconciling = true;
    try {
      const d = this.desired;
      const missing = Boolean(d.programScene) && Array.isArray(this.state.scenes) && !this.state.scenes.includes(d.programScene);
      this.state.sceneMissing = missing ? d.programScene : null;
      if (!this.state.manual && d.programScene && !missing && (force || this.state.program !== d.programScene)) {
        this.pendingScenes.set(d.programScene, this.now());
        const done = await this.tryReq("SetCurrentProgramScene", { sceneName: d.programScene });
        if (done) this.state.program = d.programScene;
        else this.pendingScenes.delete(d.programScene);
      }
      if (!this.state.manual && this.allowed.has("SetSceneItemEnabled") && this.state.subItemId != null) {
        if (force || this.applied.subVisible !== d.subVisible) {
          this.pendingSub = { enabled: d.subVisible, at: this.now() };
          const done = await this.tryReq("SetSceneItemEnabled", {
            sceneName: this.names.scenes.CAM,
            sceneItemId: this.state.subItemId,
            sceneItemEnabled: d.subVisible,
          });
          if (done) this.applied.subVisible = d.subVisible;
        }
      }
      await this.reconcileContent(force);
    } finally {
      this.reconciling = false;
      this.emitChange();
      if (this.dirty) {
        this.dirty = false;
        setImmediate(() => this.reconcile(false).catch(error => this.noteError(error)));
      }
    }
  }

  // テロップの中身と、入場中の音声ミュート。手動モードでも続ける（場面の切り替えとは別のため）。
  async reconcileContent(force = true) {
    const d = this.desired;
    if (!d) return;
    if (this.allowed.has("SetInputSettings") && Array.isArray(this.state.inputs)) {
      for (const [name, value] of Object.entries(d.texts ?? {})) {
        if (!this.state.inputs.includes(name)) continue;
        if (!force && this.applied.texts[name] === value) continue;
        const done = await this.tryReq("SetInputSettings", { inputName: name, inputSettings: { text: value } });
        if (done) this.applied.texts[name] = value;
      }
    }
    if (this.allowed.has("SetInputMute") && Array.isArray(this.state.inputs)) {
      for (const [name, muted] of Object.entries(d.mute ?? {})) {
        if (!this.state.inputs.includes(name)) continue;
        if (!force && this.applied.mute[name] === muted) continue;
        const done = await this.tryReq("SetInputMute", { inputName: name, inputMuted: muted });
        if (done) this.applied.mute[name] = muted;
      }
    }
  }

  resumeAuto() {
    this.state.manual = false;
    this.pendingScenes.clear();
    this.emitChange();
    return this.reconcile(true);
  }

  // ---- OBS からの知らせ ----

  onEvent(type, data) {
    const now = this.now();
    for (const [scene, at] of this.pendingScenes) {
      if (now - at > this.timings.pendingMs) this.pendingScenes.delete(scene);
    }
    switch (type) {
      case "CurrentProgramSceneChanged": {
        const name = data.sceneName;
        this.state.program = name;
        if (this.pendingScenes.has(name)) {
          this.pendingScenes.delete(name);
        } else if (this.desired && name !== this.desired.programScene && !this.state.manual) {
          this.state.manual = true;
          this.safeEmit("manual", { scene: name, reason: "human" });
        }
        break;
      }
      case "SceneItemEnableStateChanged": {
        if (data.sceneName !== this.names.scenes.CAM || data.sceneItemId !== this.state.subItemId) break;
        const pending = this.pendingSub;
        const ours = pending && pending.enabled === data.sceneItemEnabled && now - pending.at <= this.timings.pendingMs;
        this.applied.subVisible = Boolean(data.sceneItemEnabled);
        if (ours) {
          this.pendingSub = null;
        } else if (this.desired && Boolean(data.sceneItemEnabled) !== this.desired.subVisible && !this.state.manual) {
          this.state.manual = true;
          this.safeEmit("manual", { scene: this.state.program, reason: "human_camera" });
        }
        break;
      }
      case "RecordStateChanged":
        if (data.outputState === OUT.STARTED) this.updateRecord(true, { durationMs: 0 });
        if (data.outputState === OUT.STOPPED) this.updateRecord(false, { path: data.outputPath ?? null });
        if (data.outputState === OUT.PAUSED) this.state.record.paused = true;
        if (data.outputState === OUT.RESUMED) this.state.record.paused = false;
        break;
      case "RecordFileChanged": {
        const at = new Date(now).toISOString();
        this.safeEmit("observation", { type: "OBS_RECORD", active: false, path: null, at });
        this.safeEmit("observation", { type: "OBS_RECORD", active: true, path: data.newOutputPath ?? null, at });
        break;
      }
      case "StreamStateChanged":
        if (data.outputState === OUT.STARTED) this.updateStream(true, { durationMs: 0 });
        if (data.outputState === OUT.STOPPED) this.updateStream(false);
        if (data.outputState === OUT.RECONNECTING && this.state.stream.reconnectingSince == null) this.state.stream.reconnectingSince = now;
        if (data.outputState === OUT.RECONNECTED) this.state.stream.reconnectingSince = null;
        break;
      case "ExitStarted":
        this.state.connection = { status: "error", reason: "exiting", message: "OBSが終了しています", checkedAt: now };
        this.markDisconnected();
        break;
      case "InputVolumeMeters":
        if (this.meters) {
          for (const input of data.inputs ?? []) {
            const peak = Math.max(0, ...(input.inputLevelsMul ?? []).map(levels => Number(levels?.[1] ?? 0)));
            const previous = this.meters.get(input.inputName) ?? 0;
            this.meters.set(input.inputName, Math.max(previous, peak));
          }
        }
        break;
      default:
        break;
    }
    this.emitChange();
  }

  // ---- 人が押す操作（運営モード） ----

  async startRecord() {
    // 手元の記憶ではなく、OBS に今の状態を聞いてから始める。
    const status = await this.tryReq("GetRecordStatus");
    if (status) {
      this.updateRecord(Boolean(status.outputActive), { durationMs: status.outputDuration });
      this.state.record.paused = Boolean(status.outputActive && status.outputPaused);
      if (status.outputActive && status.outputPaused) return this.resumeRecord();
      if (status.outputActive) return { ok: true, message: "すでに録画しています" };
    }
    try {
      await this.req("StartRecord");
      return { ok: true, message: "録画を始めました" };
    } catch (error) {
      return { ok: false, message: `録画を始められません：${error.message}` };
    }
  }

  async resumeRecord() {
    try {
      await this.req("ResumeRecord");
      this.state.record.paused = false;
      this.emitChange();
      return { ok: true, message: "録画を再開しました" };
    } catch (error) {
      return { ok: false, message: `録画を再開できません：${error.message}` };
    }
  }

  async stopRecord() {
    try {
      await this.req("StopRecord");
      return { ok: true, message: "録画を止めました" };
    } catch (error) {
      return { ok: false, message: `録画を止められません：${error.message}` };
    }
  }

  async startStream() {
    // 録画を先に始める。配信が落ちても映像は Mac に残す（EVENT_OS_SPEC.md §11.3）。
    const record = await this.startRecord();
    if (!record.ok) return { ok: false, message: `配信の前に録画を始められませんでした：${record.message}` };
    try {
      await this.req("StartStream");
      this.state.stream.wanted = true;
      return { ok: true, message: "配信を始めました" };
    } catch (error) {
      return { ok: false, message: `配信を始められません：${error.message}` };
    }
  }

  async stopStream() {
    this.state.stream.wanted = false;
    try {
      await this.req("StopStream");
    } catch (error) {
      return { ok: false, message: `配信を止められません：${error.message}` };
    }
    return this.afterStreamStop("配信を止めました");
  }

  async restartStream() {
    // 手元の記憶ではなく、OBS に今の状態を聞いてから止める。
    const current = await this.tryReq("GetStreamStatus");
    if (current?.outputActive ?? this.state.stream.active) {
      try {
        await this.req("StopStream");
      } catch (error) {
        if (error.code !== STATUS.OUTPUT_NOT_RUNNING) return { ok: false, message: `配信を止められません：${error.message}` };
      }
      for (let index = 0; index < 20; index += 1) {
        const status = await this.tryReq("GetStreamStatus");
        if (status && !status.outputActive) break;
        await sleep(500);
      }
    }
    const checked = await this.afterStreamStop("");
    try {
      await this.req("StartStream");
      this.state.stream.wanted = true;
    } catch (error) {
      return { ok: false, message: `配信をやり直せません：${error.message}` };
    }
    return { ok: true, message: checked.ok ? "配信をやり直しました" : `配信をやり直しました。${checked.message}` };
  }

  // 配信を止めると録画まで止まる設定がある（REFERENCES.md）。止めた後は録画を必ず確かめる。
  async afterStreamStop(message) {
    const record = await this.tryReq("GetRecordStatus");
    if (record) this.updateRecord(Boolean(record.outputActive), { durationMs: record.outputDuration });
    this.emitChange();
    if (record && !record.outputActive) {
      return { ok: false, message: `${message}${message ? "。" : ""}録画も止まっています。すぐに「録画を始める」を押してください` };
    }
    return { ok: true, message };
  }

  async chapter(name) {
    if (!this.allowed.has("CreateRecordChapter") || this.state.chaptersSupported === false) return;
    try {
      await this.req("CreateRecordChapter", { chapterName: name });
      this.state.chaptersSupported = true;
    } catch (error) {
      if (error.code === STATUS.PROCESSING_FAILED) this.state.chaptersSupported = false;
    }
  }

  async audioCheck(durationMs = 3000, thresholdDb = -50) {
    if (!this.client.identified) return { ok: false, message: "OBSにつながっていません" };
    this.meters = new Map();
    this.client.reidentify(BASE_SUBSCRIPTIONS | EVENT_SUB.InputVolumeMeters);
    await sleep(durationMs);
    this.client.reidentify(BASE_SUBSCRIPTIONS);
    const levels = [...this.meters.entries()].map(([name, peak]) => ({ name, db: peak > 0 ? 20 * Math.log10(peak) : -Infinity }));
    this.meters = null;
    const loudest = levels.sort((a, b) => b.db - a.db)[0];
    const ok = Boolean(loudest) && loudest.db > thresholdDb;
    this.state.audio = {
      ok,
      checkedAt: this.now(),
      message: ok ? `音が来ています（いちばん大きい入力：${loudest.name} ${loudest.db.toFixed(0)}dB）` : "どの入力からも音が来ていません",
    };
    this.emitChange();
    return { ok, message: this.state.audio.message };
  }

  // ---- 練習用の擬似故障（管理モードかつ練習モードだけ） ----

  simulateObsDown(seconds) {
    this.blockedUntil = this.now() + seconds * 1000;
    this.stopPolling();
    this.client.close();
    this.markDisconnected();
    this.setConnection("error", "lost", "練習：OBSとの接続を切っています");
    this.scheduleReconnect(seconds * 1000);
  }

  setSimulate(flags) {
    this.simulate = { ...this.simulate, ...flags };
    this.emitChange();
  }

  // ---- 外へ渡す様子 ----

  snapshot() {
    const camera = track => ({ status: track.status, checkedAt: track.checkedAt, message: track.message });
    const s = this.state;
    return {
      connection: { ...s.connection },
      version: s.version,
      scenes: s.scenes,
      inputs: s.inputs,
      camItems: s.camItems,
      program: s.program,
      sceneMissing: s.sceneMissing,
      cameras: { main: camera(s.cameras.main), sub: camera(s.cameras.sub) },
      record: { ...s.record },
      stream: { ...s.stream },
      disk: s.disk,
      recFormat: s.recFormat,
      audio: s.audio,
      manual: s.manual,
      chaptersSupported: s.chaptersSupported,
      lastError: s.lastError,
      simulate: { ...this.simulate },
    };
  }

  // 受け取る側の失敗で、OBS とのやり取りや見回りを止めない。
  safeEmit(name, payload) {
    try {
      this.emit(name, payload);
    } catch (error) {
      this.noteError(error);
    }
  }

  noteError(error) {
    this.state.lastError = error?.message ?? String(error);
  }

  emitChange() {
    this.safeEmit("change");
  }
}
