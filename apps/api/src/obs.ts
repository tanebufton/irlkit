// obs-websocket v5 client: keeps a live connection to headless OBS, bootstraps
// the canonical scene layout idempotently, and exposes the control surface the
// HTTP routes and stats poller use.
import OBSWebSocket from "obs-websocket-js";
import { EventEmitter } from "node:events";
import { config } from "./config.js";
import { getSetting, logSceneChange } from "./db.js";

// Input kinds differ slightly by platform; these are the Linux/OBS 30 values.
const KIND_MEDIA = "ffmpeg_source";
const KIND_TEXT = "text_ft2_source_v2";

export const MEDIA_SOURCE_NAME = "IRL Feed";

class ObsManager extends EventEmitter {
  private obs = new OBSWebSocket();
  private _connected = false;
  private reconnecting = false;
  // Briefly tags who's *about* to switch a scene via the API, so the
  // CurrentProgramSceneChanged listener below — the single source of truth
  // for the audit log, since it catches every switch regardless of source —
  // can attribute it correctly. Anything not claimed within the window
  // (NOALBS auto-switching, or OBS itself) logs as "auto".
  private pendingActor: { actor: string; expiresAt: number } | null = null;

  get connected() {
    return this._connected;
  }

  markPendingActor(actor: string) {
    this.pendingActor = { actor, expiresAt: Date.now() + 3000 };
  }

  private consumePendingActor(): string {
    const pending = this.pendingActor;
    this.pendingActor = null;
    if (pending && pending.expiresAt > Date.now()) return pending.actor;
    return "auto";
  }

  async start() {
    this.obs.on("ConnectionClosed", () => {
      this._connected = false;
      this.emit("status", { connected: false });
      this.scheduleReconnect();
    });
    // Registered once here (not per-reconnect in connect()) since this.obs is
    // one long-lived instance across reconnects — re-registering per-connect
    // would stack duplicate listeners and log every change multiple times.
    this.obs.on("CurrentProgramSceneChanged", (data: { sceneName: string }) => {
      logSceneChange(data.sceneName, this.consumePendingActor());
    });
    await this.connect();
  }

  private async connect() {
    try {
      await this.obs.connect(config.obs.url, config.obs.password, {
        rpcVersion: 1,
      });
      this._connected = true;
      this.reconnecting = false;
      console.log("[obs] connected");
      await this.bootstrap();
      this.emit("status", { connected: true });
    } catch (err) {
      console.warn("[obs] connect failed:", (err as Error).message);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnecting) return;
    this.reconnecting = true;
    setTimeout(() => {
      this.reconnecting = false;
      if (!this._connected) void this.connect();
    }, 3000);
  }

  private async call<T = unknown>(type: string, data?: object): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.obs.call(type as any, data as any) as Promise<T>;
  }

  // ── Idempotent scene/source bootstrap ─────────────────────────────────────
  private async bootstrap() {
    try {
      const { scenes } = await this.call<{ scenes: { sceneName: string }[] }>(
        "GetSceneList",
      );
      const names = new Set(scenes.map((s) => s.sceneName));

      for (const name of [config.scenes.starting, config.scenes.live, config.scenes.brb]) {
        if (!names.has(name)) {
          await this.call("CreateScene", { sceneName: name });
        }
      }

      const { inputs } = await this.call<{ inputs: { inputName: string }[] }>(
        "GetInputList",
      );
      const inputNames = new Set(inputs.map((i) => i.inputName));

      // Live feed: the de-bonded SRT stream out of SLS, as a Media Source.
      if (!inputNames.has(MEDIA_SOURCE_NAME)) {
        await this.call("CreateInput", {
          sceneName: config.scenes.live,
          inputName: MEDIA_SOURCE_NAME,
          inputKind: KIND_MEDIA,
          inputSettings: {
            is_local_file: false,
            input: config.obs.ingestSrtUrl,
            reconnect_delay_sec: 2,
            restart_on_activate: false,
            close_when_inactive: false,
            buffering_mb: 4,
          },
          sceneItemEnabled: true,
        });
      }

      // Placeholder text on the standby scenes.
      await this.ensureText(config.scenes.starting, "Starting Soon Text", "Starting Soon…");
      await this.ensureText(config.scenes.brb, "BRB Text", "Be Right Back");

      // Apply the persisted (or env) stream destination.
      await this.applyDestinationFromSettings();
      console.log("[obs] bootstrap complete");
    } catch (err) {
      console.error("[obs] bootstrap error:", (err as Error).message);
    }
  }

  private async ensureText(sceneName: string, inputName: string, text: string) {
    try {
      const { inputs } = await this.call<{ inputs: { inputName: string }[] }>("GetInputList");
      if (inputs.some((i) => i.inputName === inputName)) return;
      await this.call("CreateInput", {
        sceneName,
        inputName,
        inputKind: KIND_TEXT,
        inputSettings: { text, font: { face: "DejaVu Sans", size: 96 } },
        sceneItemEnabled: true,
      });
    } catch (err) {
      console.warn(`[obs] ensureText(${inputName}) skipped:`, (err as Error).message);
    }
  }

  async applyDestinationFromSettings() {
    const server = getSetting("dest_rtmp_url") ?? process.env.DEST_RTMP_URL ?? "";
    const key = getSetting("dest_stream_key") ?? process.env.DEST_STREAM_KEY ?? "";
    if (!server) return;
    await this.call("SetStreamServiceSettings", {
      streamServiceType: "rtmp_custom",
      streamServiceSettings: { server, key, use_auth: false, bwtest: false },
    });
  }

  // ── Control surface ───────────────────────────────────────────────────────
  async getSceneList() {
    return this.call<{ currentProgramSceneName: string; scenes: { sceneName: string }[] }>(
      "GetSceneList",
    );
  }

  async setScene(sceneName: string) {
    return this.call("SetCurrentProgramScene", { sceneName });
  }

  async createScene(sceneName: string) {
    return this.call("CreateScene", { sceneName });
  }

  async removeScene(sceneName: string) {
    return this.call("RemoveScene", { sceneName });
  }

  async streamStatus() {
    return this.call<{
      outputActive: boolean;
      outputBytes: number;
      outputSkippedFrames: number;
      outputTotalFrames: number;
      outputCongestion: number;
      outputDuration: number;
    }>("GetStreamStatus");
  }

  async startStream() {
    return this.call("StartStream");
  }

  async stopStream() {
    return this.call("StopStream");
  }

  async getInputList() {
    return this.call<{ inputs: { inputName: string; inputKind: string }[] }>("GetInputList");
  }

  async getAudioInputs() {
    // Inputs that carry audio (media / capture / text-to-speech). We surface
    // these for mute controls on the remote panel.
    const { inputs } = await this.getInputList();
    const audioKinds = ["ffmpeg_source", "pulse_input_capture", "pulse_output_capture"];
    return inputs.filter((i) => audioKinds.includes(i.inputKind)).map((i) => i.inputName);
  }

  async getMute(inputName: string) {
    return this.call<{ inputMuted: boolean }>("GetInputMute", { inputName });
  }

  async setMute(inputName: string, inputMuted: boolean) {
    return this.call("SetInputMute", { inputName, inputMuted });
  }

  async createInput(sceneName: string, inputName: string, inputKind: string, inputSettings: object) {
    return this.call("CreateInput", {
      sceneName,
      inputName,
      inputKind,
      inputSettings,
      sceneItemEnabled: true,
    });
  }

  async setInputSettings(inputName: string, inputSettings: object) {
    return this.call("SetInputSettings", { inputName, inputSettings, overlay: true });
  }

  // ── Scene item management (what's placed in a scene, vs. the input/source
  // itself, which can be shared across scenes) ───────────────────────────────
  async getSceneItems(sceneName: string) {
    return this.call<{
      sceneItems: {
        sceneItemId: number;
        sceneItemIndex: number;
        sceneItemEnabled: boolean;
        sourceName: string;
        inputKind: string | null;
        sceneItemTransform: {
          positionX: number;
          positionY: number;
          scaleX: number;
          scaleY: number;
          rotation: number;
        };
      }[];
    }>("GetSceneItemList", { sceneName });
  }

  async removeSceneItem(sceneName: string, sceneItemId: number) {
    return this.call("RemoveSceneItem", { sceneName, sceneItemId });
  }

  async setSceneItemTransform(
    sceneName: string,
    sceneItemId: number,
    transform: Partial<{ positionX: number; positionY: number; scaleX: number; scaleY: number; rotation: number }>,
  ) {
    return this.call("SetSceneItemTransform", { sceneName, sceneItemId, sceneItemTransform: transform });
  }

  async setDestination(server: string, key: string) {
    return this.call("SetStreamServiceSettings", {
      streamServiceType: "rtmp_custom",
      streamServiceSettings: { server, key, use_auth: false, bwtest: false },
    });
  }

  async screenshot(sourceName: string, width = 640) {
    return this.call<{ imageData: string }>("GetSourceScreenshot", {
      sourceName,
      imageFormat: "jpg",
      imageWidth: width,
    });
  }
}

export const obs = new ObsManager();
