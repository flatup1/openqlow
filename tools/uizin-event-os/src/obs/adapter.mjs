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
      record: { active: null, checkedAt: null },
      stream: { active: null, checkedAt: null, reconnectingSince: null, wanted: false },
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
    try {
      await this.client.connect(this.url, this.password, BASE_SUBSCRIPTIONS);
    } catch (error) {
      this.onConnectFailure(error);
      return;
    }
    this.attempt = 0;
    await this.onIdentified();
  }

  scheduleReconnect(delayMs) {
    if (this.stopped || this.halted) return;
    clearTimeout(this.reconnectTimer);
    const delay = delayMs ?? Math.min(this.timings.reconnectMaxMs, this.timings.reconnectBaseMs * 2 ** this.attempt);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => this.connectNow(), delay);
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

  onClose(info) {
    if (!info.wasIdentified) return;
    this.stopPolling();
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
    this.setConnection("ok", null, "");
    await this.refreshAll();
    // Event OS を大会の途中で起動し直したとき、OBS が予定と違う場面なら、人が触った可能性がある。
    // 勝手に場面を変えず、手動モードで知らせる（ARCHITECTURE.md §5.2・AT-P6 C6）。
    if (first && this.eventPhase === "running" && this.desired && this.state.program && this.state.program !== this.desired.programScene) {
      this.state.manual = true;
      this.emit("manual", { scene: this.state.program, reason: "start_mismatch" });
      await this.reconcile(true);
    } else {
      await this.reconcile(true);
    }
    this.startPolling();
    this.emitChange();
  }

  // ---- 命令（許可リストと中身の確認を通してから送る） ----

  req(type, data) {
    const problem = guardRequestData(type, data, this.guardCtx);
    if (problem) return Promise.reject(new ObsRequestError(problem, "guard"));
    return this.client.request(type, data);
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
    const version = await this.tryReq("GetVersion");
    if (version) {
      this.state.version = { obsVersion: version.obsVersion, obsWebSocketVersion: version.obsWebSocketVersion };
      this.state.imageFormats = version.supportedImageFormats ?? [];
    }
    await this.refreshScenes();
    await this.refreshInputs();
    await this.refreshCamItems();
    await this.refreshRecordSettings();
    await this.refreshOutputs();
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
    if (record) this.updateRecord(Boolean(record.outputActive), { durationMs: record.outputDuration });
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
    this.state.record = { active, checkedAt: this.now() };
    if (previous === active || (previous === null && !active)) return;
    const at = active && durationMs > 0 ? this.now() - durationMs : this.now();
    this.emit("observation", { type: "OBS_RECORD", active, path: path ?? null, at: new Date(at).toISOString() });
  }

  updateStream(active, { durationMs } = {}) {
    const previous = this.state.stream.active;
    this.state.stream = { ...this.state.stream, active, checkedAt: this.now() };
    if (!active) this.state.stream.reconnectingSince = null;
    if (previous === active || (previous === null && !active)) return;
    const at = active && durationMs > 0 ? this.now() - durationMs : this.now();
    this.emit("observation", { type: "OBS_STREAM", active, at: new Date(at).toISOString() });
  }

  // ---- 定期の見回り ----

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.tick(), this.timings.pollMs);
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
      this.state.connection.checkedAt = this.now();
      // 命令が届かなかった場合に備え、手動モードでなければ姿を合わせ直す。
      if (!this.state.manual && this.desired && this.state.program !== this.desired.programScene && !this.pendingScenes.has(this.desired.programScene)) {
        await this.reconcile(false);
      }
      this.emitChange();
    } finally {
      this.polling = false;
    }
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
    this.reconcile(false);
  }

  async reconcile(force) {
    if (!this.client.identified || !this.desired) return;
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
        setImmediate(() => this.reconcile(false));
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
          this.emit("manual", { scene: name, reason: "human" });
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
          this.emit("manual", { scene: this.state.program, reason: "human_camera" });
        }
        break;
      }
      case "RecordStateChanged":
        if (data.outputState === OUT.STARTED) this.updateRecord(true, { durationMs: 0 });
        if (data.outputState === OUT.STOPPED) this.updateRecord(false, { path: data.outputPath ?? null });
        break;
      case "RecordFileChanged": {
        const at = new Date(now).toISOString();
        this.emit("observation", { type: "OBS_RECORD", active: false, path: null, at });
        this.emit("observation", { type: "OBS_RECORD", active: true, path: data.newOutputPath ?? null, at });
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
    if (this.state.record.active) return { ok: true, message: "すでに録画しています" };
    try {
      await this.req("StartRecord");
      return { ok: true, message: "録画を始めました" };
    } catch (error) {
      return { ok: false, message: `録画を始められません：${error.message}` };
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

  emitChange() {
    this.emit("change");
  }
}
