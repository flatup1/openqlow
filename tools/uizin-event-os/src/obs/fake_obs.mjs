// テスト・練習・CHAOS（わざと壊す練習）用の「偽物のOBS」。
// obs-websocket v5 と同じ手順（Hello → Identify → Identified、Request → RequestResponse、Event）で話すので、
// 本物と同じクライアントをそのまま試せる。故障（OBSが落ちる、固まる、カメラが止まる等）を起こせる。

import { makeBmp } from "./frame_check.mjs";
import { authString, OP, EVENT_SUB } from "./protocol.mjs";
import { randomBytes } from "node:crypto";

const OUT = {
  STARTED: "OBS_WEBSOCKET_OUTPUT_STARTED",
  STOPPED: "OBS_WEBSOCKET_OUTPUT_STOPPED",
  RECONNECTING: "OBS_WEBSOCKET_OUTPUT_RECONNECTING",
  RECONNECTED: "OBS_WEBSOCKET_OUTPUT_RECONNECTED",
};

const EVENT_CATEGORY = {
  CurrentProgramSceneChanged: EVENT_SUB.Scenes,
  SceneItemEnableStateChanged: EVENT_SUB.SceneItems,
  RecordStateChanged: EVENT_SUB.Outputs,
  StreamStateChanged: EVENT_SUB.Outputs,
  RecordFileChanged: EVENT_SUB.Outputs,
  ExitStarted: EVENT_SUB.General,
  InputMuteStateChanged: EVENT_SUB.Inputs,
  InputSettingsChanged: EVENT_SUB.Inputs,
  InputVolumeMeters: EVENT_SUB.InputVolumeMeters,
};

export class FakeObs {
  constructor({ password = "", scenes, textInputs, audioInputs = ["MC", "会場マイク"], obsVersion = "32.0.0", recFormat = "hybrid_mp4", recordDirectory = "/tmp" } = {}) {
    this.password = password;
    this.obsVersion = obsVersion;
    this.scenes = scenes ?? ["WAIT", "FIGHTER", "FIGHT", "WINNER", "SAFE", "CAM"];
    this.program = this.scenes[0];
    this.camItems = [
      { sceneItemId: 1, sourceName: "MAIN", sceneItemEnabled: true },
      { sceneItemId: 2, sourceName: "SUB", sceneItemEnabled: false },
    ];
    this.inputs = new Map();
    for (const name of textInputs ?? ["EOS_BOUT_NO", "EOS_RED_NAME", "EOS_BLUE_NAME", "EOS_WINNER_NAME", "EOS_INFO"]) {
      this.inputs.set(name, { inputKind: "text_ft2_source_v2", settings: { text: "" }, muted: false });
    }
    for (const name of ["MAIN", "SUB"]) this.inputs.set(name, { inputKind: "macos-avcapture", settings: {}, muted: false });
    for (const name of audioInputs) this.inputs.set(name, { inputKind: "coreaudio_input_capture", settings: {}, muted: false, level: 0.3 });
    this.record = { active: false, startedAt: 0, path: null, fileNo: 0 };
    this.stream = { active: false, reconnecting: false, startedAt: 0 };
    this.profile = { Output: { Mode: "Simple" }, SimpleOutput: { RecFormat2: recFormat }, AdvOut: { RecFormat2: recFormat } };
    this.recordDirectory = recordDirectory;
    this.cameras = { MAIN: "alive", SUB: "alive" };
    this.crashed = false;
    this.hung = false;
    this.sockets = new Set();
    this.requestLog = [];
    this.tick = 0;
    this.chapters = [];
  }

  // ---- 故障を起こす（CHAOS） ----

  crash() {
    this.crashed = true;
    this.record.active = false;
    this.stream.active = false;
    for (const socket of [...this.sockets]) socket._serverClose(1006, "");
  }

  restart() {
    this.crashed = false;
    this.hung = false;
  }

  hang(on = true) {
    this.hung = on;
  }

  humanSetScene(name) {
    this.program = name;
    this.broadcast("CurrentProgramSceneChanged", { sceneName: name, sceneUuid: name });
  }

  humanToggleSub(enabled) {
    const item = this.camItems.find(entry => entry.sourceName === "SUB");
    item.sceneItemEnabled = enabled;
    this.broadcast("SceneItemEnableStateChanged", { sceneName: "CAM", sceneItemId: item.sceneItemId, sceneItemEnabled: enabled });
  }

  setCamera(name, mode) {
    this.cameras[name] = mode;
  }

  externalStopRecord() {
    if (!this.record.active) return;
    this.record.active = false;
    this.broadcast("RecordStateChanged", { outputActive: false, outputState: OUT.STOPPED, outputPath: this.record.path });
  }

  setStreamReconnecting(on) {
    this.stream.reconnecting = on;
    this.broadcast("StreamStateChanged", { outputActive: true, outputState: on ? OUT.RECONNECTING : OUT.RECONNECTED });
  }

  kick() {
    for (const socket of [...this.sockets]) socket._serverClose(4011, "kicked");
  }

  // ---- 接続 ----

  webSocketClass() {
    const fake = this;
    return class FakeWebSocket {
      constructor(url, protocol) {
        this.url = url;
        this.protocol = protocol;
        this.listeners = { open: [], message: [], close: [], error: [] };
        this.subscriptions = 0;
        this.identified = false;
        this.closed = false;
        this.salt = randomBytes(8).toString("base64");
        this.challenge = randomBytes(8).toString("base64");
        setImmediate(() => {
          if (fake.crashed) {
            this._emit("error", {});
            this._serverClose(1006, "");
            return;
          }
          fake.sockets.add(this);
          const d = { obsWebSocketVersion: "5.6.2", rpcVersion: 1 };
          if (fake.password) d.authentication = { challenge: this.challenge, salt: this.salt };
          this._deliver({ op: OP.Hello, d });
        });
      }

      addEventListener(type, listener) {
        this.listeners[type]?.push(listener);
      }

      send(text) {
        if (this.closed) throw new Error("closed");
        const packet = JSON.parse(text);
        setImmediate(() => fake._receive(this, packet));
      }

      close() {
        if (this.closed) return;
        this._serverClose(1005, "");
      }

      _deliver(packet) {
        if (this.closed) return;
        this._emit("message", { data: JSON.stringify(packet) });
      }

      _serverClose(code, reason) {
        if (this.closed) return;
        this.closed = true;
        fake.sockets.delete(this);
        setImmediate(() => this._emit("close", { code, reason }));
      }

      _emit(type, event) {
        for (const listener of this.listeners[type] ?? []) listener(event);
      }
    };
  }

  broadcast(eventType, eventData) {
    const category = EVENT_CATEGORY[eventType] ?? 0;
    for (const socket of this.sockets) {
      if (!socket.identified) continue;
      if (category && (socket.subscriptions & category) === 0) continue;
      socket._deliver({ op: OP.Event, d: { eventType, eventIntent: category, eventData } });
    }
  }

  _receive(socket, packet) {
    if (socket.closed || this.crashed) return;
    const d = packet.d ?? {};
    if (packet.op === OP.Identify) {
      if (this.password) {
        const expected = authString(this.password, socket.salt, socket.challenge);
        if (d.authentication !== expected) {
          socket._serverClose(4009, "Authentication failed.");
          return;
        }
      }
      socket.identified = true;
      socket.subscriptions = d.eventSubscriptions ?? 0;
      socket._deliver({ op: OP.Identified, d: { negotiatedRpcVersion: 1 } });
      return;
    }
    if (packet.op === OP.Reidentify) {
      socket.subscriptions = d.eventSubscriptions ?? socket.subscriptions;
      if (socket.subscriptions & EVENT_SUB.InputVolumeMeters) this._sendMeters(socket);
      return;
    }
    if (packet.op === OP.Request) {
      this.requestLog.push({ requestType: d.requestType, requestData: d.requestData });
      if (this.hung) return;
      let response;
      try {
        response = { requestStatus: { result: true, code: 100 }, responseData: this._handle(d.requestType, d.requestData ?? {}) };
      } catch (error) {
        response = { requestStatus: { result: false, code: error.code ?? 702, comment: error.message } };
      }
      socket._deliver({ op: OP.RequestResponse, d: { requestType: d.requestType, requestId: d.requestId, ...response } });
    }
  }

  _sendMeters(socket) {
    const inputs = [...this.inputs.entries()]
      .filter(([, input]) => typeof input.level === "number")
      .map(([inputName, input]) => ({ inputName, inputLevelsMul: [[input.level, input.level, input.level]] }));
    setTimeout(() => socket._deliver({ op: OP.Event, d: { eventType: "InputVolumeMeters", eventIntent: EVENT_SUB.InputVolumeMeters, eventData: { inputs } } }), 5);
  }

  _handle(type, data) {
    const fail = (code, message) => Object.assign(new Error(message), { code });
    switch (type) {
      case "GetVersion":
        return {
          obsVersion: this.obsVersion,
          obsWebSocketVersion: "5.6.2",
          rpcVersion: 1,
          availableRequests: [],
          supportedImageFormats: ["bmp", "jpeg", "png"],
          platform: "fake",
          platformDescription: "Fake OBS",
        };
      case "GetSceneList":
        return {
          currentProgramSceneName: this.program,
          currentPreviewSceneName: null,
          scenes: this.scenes.map((sceneName, index) => ({ sceneName, sceneUuid: sceneName, sceneIndex: index })),
        };
      case "GetCurrentProgramScene":
        return { sceneName: this.program, currentProgramSceneName: this.program };
      case "SetCurrentProgramScene":
        if (!this.scenes.includes(data.sceneName)) throw fail(600, `No scene was found by the name of \`${data.sceneName}\`.`);
        this.program = data.sceneName;
        setImmediate(() => this.broadcast("CurrentProgramSceneChanged", { sceneName: data.sceneName, sceneUuid: data.sceneName }));
        return {};
      case "GetSceneItemList":
        if (data.sceneName !== "CAM") return { sceneItems: [] };
        return { sceneItems: this.camItems.map(item => ({ ...item })) };
      case "SetSceneItemEnabled": {
        const item = this.camItems.find(entry => entry.sceneItemId === data.sceneItemId);
        if (!item) throw fail(600, "No scene item");
        item.sceneItemEnabled = data.sceneItemEnabled;
        setImmediate(() => this.broadcast("SceneItemEnableStateChanged", { sceneName: data.sceneName, sceneItemId: item.sceneItemId, sceneItemEnabled: item.sceneItemEnabled }));
        return {};
      }
      case "GetSourceScreenshot":
        return { imageData: this._screenshot(data.sourceName, data.imageWidth ?? 32, data.imageHeight ?? 18) };
      case "GetRecordStatus":
        return {
          outputActive: this.record.active,
          outputPaused: false,
          outputTimecode: "00:00:00.000",
          outputDuration: this.record.active ? Date.now() - this.record.startedAt : 0,
          outputBytes: 0,
        };
      case "GetStreamStatus":
        return {
          outputActive: this.stream.active,
          outputReconnecting: this.stream.reconnecting,
          outputTimecode: "00:00:00.000",
          outputDuration: this.stream.active ? Date.now() - this.stream.startedAt : 0,
          outputCongestion: 0,
          outputBytes: 0,
          outputSkippedFrames: 0,
          outputTotalFrames: 0,
        };
      case "GetRecordDirectory":
        return { recordDirectory: this.recordDirectory };
      case "GetStats":
        return { cpuUsage: 10, memoryUsage: 500, availableDiskSpace: 100000, activeFps: 30, renderSkippedFrames: 0, outputSkippedFrames: 0 };
      case "GetProfileParameter": {
        const value = this.profile[data.parameterCategory]?.[data.parameterName];
        return { parameterValue: value ?? null, defaultParameterValue: null };
      }
      case "GetInputList":
        return { inputs: [...this.inputs.entries()].map(([inputName, input]) => ({ inputName, inputKind: input.inputKind })) };
      case "SetInputSettings": {
        const input = this.inputs.get(data.inputName);
        if (!input) throw fail(600, "No source was found");
        input.settings = data.overlay === false ? { ...data.inputSettings } : { ...input.settings, ...data.inputSettings };
        return {};
      }
      case "SetInputMute": {
        const input = this.inputs.get(data.inputName);
        if (!input) throw fail(600, "No source was found");
        input.muted = Boolean(data.inputMuted);
        return {};
      }
      case "StartRecord":
        if (this.record.active) throw fail(500, "Record output already active");
        this.record = { active: true, startedAt: Date.now(), path: `${this.recordDirectory}/fake-${++this.record.fileNo}.mp4`, fileNo: this.record.fileNo };
        setImmediate(() => this.broadcast("RecordStateChanged", { outputActive: true, outputState: OUT.STARTED, outputPath: null }));
        return {};
      case "StopRecord": {
        if (!this.record.active) throw fail(501, "Record output not running");
        this.record.active = false;
        const outputPath = this.record.path;
        setImmediate(() => this.broadcast("RecordStateChanged", { outputActive: false, outputState: OUT.STOPPED, outputPath }));
        return { outputPath };
      }
      case "StartStream":
        if (this.stream.active) throw fail(500, "Stream output already active");
        this.stream = { active: true, reconnecting: false, startedAt: Date.now() };
        setImmediate(() => this.broadcast("StreamStateChanged", { outputActive: true, outputState: OUT.STARTED }));
        return {};
      case "StopStream":
        if (!this.stream.active) throw fail(501, "Stream output not running");
        this.stream.active = false;
        setImmediate(() => this.broadcast("StreamStateChanged", { outputActive: false, outputState: OUT.STOPPED }));
        return {};
      case "CreateRecordChapter":
        if (!this.record.active) throw fail(501, "Record output not running");
        if (!String(this.profile.SimpleOutput.RecFormat2).startsWith("hybrid")) throw fail(702, "Verify that the output being used supports chapter markers.");
        this.chapters.push(data.chapterName ?? "");
        return {};
      default:
        throw fail(204, `Unknown request type ${type}`);
    }
  }

  _screenshot(sourceName, width, height) {
    this.tick += 1;
    const mode = this.cameras[sourceName] ?? "alive";
    if (mode === "dead") return makeBmp(width, height, () => [0, 0, 0]);
    if (mode === "frozen") return makeBmp(width, height, (x, y) => [80 + x, 90 + y, 100]);
    const seed = this.tick;
    return makeBmp(width, height, (x, y) => {
      const noise = (x * 31 + y * 17 + seed * 13) % 23;
      return [70 + noise, 80 + ((noise * 3) % 19), 90 + x];
    });
  }
}
