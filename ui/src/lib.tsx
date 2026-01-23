import ReactPlayer from "react-player";
import store from "./app/store";
import {
  setIsConnecting,
  setNavigationOpen,
  setPlayerInSync,
  setPlayerReady,
  setTunePatP,
} from "./features/ui/uiSlice";
import { resetStation } from "./features/station/stationSlice";
import { chatInputId } from "./components/ChatColumn";
import { isValidPatp } from "urbit-ob";

const badDJMessage =
  "You do not have permission to use that command on this station. Try using your station";

const STORAGE_KEY = "radio.credentials";
const DEFAULT_WORKER_BASE =
  ((import.meta.env.VITE_WORKER_BASE as string | undefined) ||
    (window.location.hostname === "localhost"
      ? "http://localhost:8787"
      : window.location.origin));

type Credentials = {
  username: string;
  password: string;
};

type PendingCommand = {
  command: string;
  payload?: unknown;
};

export type StationSummary = {
  location: string;
  description: string;
  viewers: number;
  time: number;
};

export class Radio {
  workerBase: string;
  our: string = "~";
  hub: string = "~zod";
  credentials: Credentials | null = null;
  socket: WebSocket | null = null;
  desiredStation: string | null = null;
  activeStation: string | null = null;
  pendingCommands: PendingCommand[] = [];
  handleSub: ((update: any) => void) | null = null;
  dispatch: any;
  reconnectTimer: number | null = null;
  synth: SpeechSynthesis;

  constructor(workerBase: string = DEFAULT_WORKER_BASE) {
    this.workerBase = workerBase.replace(/\/$/, "");
    this.synth = window.speechSynthesis;
  }

  static async create() {
    const radio = new Radio();
    await radio.ensureCredentials();
    radio.our = radio.credentials!.username;
    return radio;
  }

  private async ensureCredentials(): Promise<Credentials> {
    if (this.credentials) return this.credentials;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Credentials;
        const ok = await this.login(parsed);
        if (ok) {
          this.credentials = parsed;
          return parsed;
        }
      } catch (_e) {
        // ignore corrupt storage
      }
      localStorage.removeItem(STORAGE_KEY);
    }

    const password = this.randomPassword();
    const fresh = await this.register(password);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    this.credentials = fresh;
    return fresh;
  }

  private async login(credentials: Credentials) {
    try {
      const response = await fetch(`${this.workerBase}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(credentials),
      });
      return response.ok;
    } catch (_e) {
      return false;
    }
  }

  public async loginAsZod(password: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.workerBase}/api/login-zod`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        return false;
      }
      const data = (await response.json()) as Credentials;
      this.credentials = data;
      this.our = data.username;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (_e) {
      return false;
    }
  }

  private async register(password: string): Promise<Credentials> {
    const response = await fetch(`${this.workerBase}/api/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      throw new Error("failed to register");
    }
    const payload = (await response.json()) as { username: string };
    return { username: payload.username, password };
  }

  private randomPassword() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  public watchTenna(handleSub: (update: any) => void, dispatch: any) {
    this.handleSub = handleSub;
    this.dispatch = dispatch;
    void this.ensureCredentials().then(() => {
      this.our = this.credentials!.username;
      window.addEventListener("beforeunload", () => this.tune(null));

      const initial = this.determineInitialStation();
      this.tuneAndReset(dispatch, initial);
    });
  }

  private determineInitialStation(): string {
    // Check for /s/:station path format
    const pathMatch = window.location.pathname.match(/^\/s\/(.+)$/);
    if (pathMatch) {
      const station = decodeURIComponent(pathMatch[1]);
      if (station === "hub") return this.hub;
      if (station === "our") return this.our;
      return station;
    }
    return this.hub;
  }

  private buildWsUrl(station: string) {
    const url = new URL(
      `/api/rooms/${encodeURIComponent(station)}/ws`,
      this.workerBase
    );
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("username", this.credentials!.username);
    url.searchParams.set("password", this.credentials!.password);
    return url.toString();
  }

  private openSocket(station: string) {
    if (!this.credentials) return;
    this.desiredStation = station;
    if (this.socket) {
      const existing = this.socket;
      this.socket = null;
      existing.close(1000, "reconnect");
    }
    const url = this.buildWsUrl(station);
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.activeStation = station;
      this.flushPendingCommands();
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) return;
      try {
        const data = JSON.parse(event.data);
        if (this.handleSub) {
          this.handleSub(data);
        }
      } catch (_e) {
        // ignore malformed payloads
      }
    });

    socket.addEventListener("close", (event) => {
      if (this.socket !== socket && station !== this.desiredStation) return;
      if (this.activeStation === station) {
        this.activeStation = null;
      }
      if (event.code === 4403) {
        alert("you were removed from this station");
        if (this.dispatch) {
          this.tuneAndReset(this.dispatch, this.our);
        }
        return;
      }
      if (this.desiredStation === station) {
        this.scheduleReconnect(station);
      }
    });

    socket.addEventListener("error", () => {
      socket.close();
    });
  }

  private scheduleReconnect(station: string) {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = window.setTimeout(() => {
      if (this.desiredStation === station) {
        this.openSocket(station);
      }
    }, 1500);
  }

  private flushPendingCommands() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    while (this.pendingCommands.length > 0) {
      const next = this.pendingCommands.shift();
      if (!next) break;
      this.socket.send(
        JSON.stringify({
          type: "command",
          command: next.command,
          payload: next.payload,
        })
      );
    }
  }

  private queueCommand(command: string, payload?: unknown) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({ type: "command", command, payload: payload ?? null })
      );
    } else {
      this.pendingCommands.push({ command, payload });
      if (this.pendingCommands.length > 64) {
        this.pendingCommands.shift();
      }
    }
  }

  private async sendRoomCommand(room: string, command: string, payload?: any) {
    const creds = await this.ensureCredentials();
    const response = await fetch(
      `${this.workerBase}/api/rooms/${encodeURIComponent(room)}/command`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: creds.username,
          password: creds.password,
          command,
          payload: payload ?? null,
        }),
      }
    );
    if (!response.ok) {
      throw new Error("command failed");
    }
  }

  public seekToGlobal(player: ReactPlayer | null, startedTime: number) {
    if (startedTime === 0 || !player) return;
    const currentUnixTime = Date.now() / 1000;
    const duration = player.getDuration();
    if (!duration) return;
    const globalProgress = Math.ceil(currentUnixTime - startedTime) % duration;
    player.seekTo(globalProgress, "seconds");
  }

  public resyncAll(player: ReactPlayer | null, hostPatp: string, url: string) {
    if (!player || !url) return;
    if (hostPatp !== this.our) return;
    const time = player.getCurrentTime();
    if (!time) return;
    this.setTime(url, time);
  }

  public syncLive(player: ReactPlayer | null, hostPatp: string, url: string) {
    if (hostPatp !== this.our || !player || !url) return;
    const duration = player.getDuration();
    if (!duration) return;
    this.setTime(url, duration - 5);
  }

  public isAdmin() {
    // ~zod has admin permissions on all stations
    if (this.our === "~zod") return true;
    const tunePatP = store.getState().ui.tunePatP;
    return tunePatP === this.our;
  }

  public isPromoted() {
    const promoted = store.getState().station.promoted;
    return promoted.includes(this.our);
  }

  public isAdminOrPromoted() {
    return this.isAdmin() || this.isPromoted();
  }

  public canUseDJCommands() {
    const permissions = store.getState().station.permissions;
    if (permissions === "open") {
      return true;
    }
    return this.isAdmin();
  }

  public chat(chat: string) {
    this.queueCommand("chat", { message: chat });
  }

  public setPermissions(p: "open" | "closed") {
    this.queueCommand("permissions", { value: p });
  }

  public spin(playUrl: string) {
    if (!this.isAdminOrPromoted()) {
      if (!this.canUseDJCommands()) {
        alert(badDJMessage);
        return;
      }
    }
    if (!this.isValidHttpUrl(playUrl)) return;
    const currentUnixTime = Math.ceil(Date.now() / 1000);
    this.queueCommand("spin", {
      url: playUrl,
      time: currentUnixTime,
    });
  }

  public setTime(playUrl: string, time: number) {
    const customStartTime = Math.ceil(Date.now() / 1000) - Math.floor(time);
    this.queueCommand("spin", {
      url: playUrl,
      time: customStartTime,
    });
  }

  public talk(talkMsg: string) {
    if (!this.isAdminOrPromoted()) {
      if (!this.canUseDJCommands()) {
        alert(badDJMessage);
        return;
      }
    }
    this.queueCommand("talk", { message: talkMsg });
  }

  public tune(tuneTo: string | null) {
    this.desiredStation = tuneTo;
    if (!tuneTo) {
      if (this.socket) {
        const existing = this.socket;
        this.socket = null;
        existing.close(1000, "logout");
      }
      return;
    }
    this.openSocket(tuneTo);
  }

  private updateUrlWithStation(station: string) {
    const newPath = `/s/${encodeURIComponent(station)}`;
    window.history.replaceState(null, "", newPath);
  }

  public ping() {
    this.queueCommand("presence");
  }

  public ban(her: string) {
    this.queueCommand("ban", { target: her });
  }

  public unban(her: string) {
    this.queueCommand("unban", { target: her });
  }

  public mod(her: string) {
    this.queueCommand("mod", { target: her });
  }

  public unmod(her: string) {
    this.queueCommand("unmod", { target: her });
  }

  public deleteChat(from: string, time: number) {
    this.queueCommand("delete-chat", { from, time });
  }

  public setDescription(description: string) {
    this.queueCommand("description", { value: description });
  }

  public async deleteStation(station: string): Promise<boolean> {
    try {
      const creds = await this.ensureCredentials();
      const response = await fetch(`${this.workerBase}/api/rooms/${encodeURIComponent(station)}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: creds.username,
          password: creds.password,
        }),
      });
      return response.ok;
    } catch (_e) {
      return false;
    }
  }

  public async fetchStations(): Promise<StationSummary[]> {
    const response = await fetch(`${this.workerBase}/api/towers`);
    if (!response.ok) {
      return [];
    }
    const listings = (await response.json()) as Array<{
      location: string;
      description: string;
      viewers: number;
      updatedAt: number;
    }>;
    return listings.map((entry) => ({
      location: entry.location,
      description: entry.description,
      viewers: entry.viewers,
      time: entry.updatedAt,
    }));
  }

  public soundUrls = {
    fart: "https://www.myinstants.com/media/sounds/fart-with-reverb.mp3",
    click: "https://www.myinstants.com/media/sounds/minecraft_click.mp3",
    orb: "https://www.myinstants.com/media/sounds/orb.mp3",
  };

  // Image commands temporarily disabled
  // public imgUrls = {
  //   athens: "https://bwyl.nyc3.digitaloceanspaces.com/radio/chat_images/athens.gif",
  //   urbit: "https://bwyl.nyc3.digitaloceanspaces.com/radio/chat_images/urbit.png",
  //   groove: "https://bwyl.nyc3.digitaloceanspaces.com/radio/chat_images/groove.gif",
  //   cabbit: "https://bwyl.nyc3.digitaloceanspaces.com/radio/chat_images/cabbit.gif",
  // };

  public tuneAndReset(dispatch: any, patp: string) {
    this.tune(patp);
    dispatch(setTunePatP(patp));
    dispatch(setIsConnecting(true));
    dispatch(resetStation());
    dispatch(setPlayerReady(false));
    dispatch(setNavigationOpen(false));
    this.updateUrlWithStation(patp);
  }

  public async handleUserInput(dispatch: any) {
    const input = document.getElementById(chatInputId) as HTMLInputElement;
    const tunePatP = store.getState().ui.tunePatP;
    const spinTime = store.getState().station.spinTime;
    const spinUrl = store.getState().station.spinUrl;
    const player: ReactPlayer | null = !window.playerRef
      ? null
      : (window.playerRef.current as ReactPlayer | null);

    const chat = input.value;
    input.value = "";

    if (chat === "") return;

    const got = this.getCommandArg(chat);
    if (!got) {
      this.chat(chat);
      return;
    }

    const command = got.command;
    let arg = got.arg;
    switch (command) {
      case "talk":
        if (!this.isAdminOrPromoted()) {
          alert(badDJMessage);
          return;
        }
        this.chat(chat);
        this.talk(arg);
        break;
      case "qtalk":
        if (!this.isAdminOrPromoted()) return;
        this.talk(arg);
        break;
      case "play":
        if (!this.isAdminOrPromoted()) {
          alert(badDJMessage);
          return;
        }
        this.spin(arg);
        this.chat(chat);
        break;
      case "qplay":
        if (!this.isAdminOrPromoted()) return;
        this.spin(arg);
        break;
      case "tune":
        if (arg === "") arg = this.our;
        this.chat(chat);
        if (isValidPatp(arg)) {
          this.tuneAndReset(dispatch, arg);
        } else if (isValidPatp("~" + arg)) {
          this.tuneAndReset(dispatch, "~" + arg);
        }
        break;
      case "time":
        dispatch(setPlayerInSync(true));
        this.seekToGlobal(player, spinTime);
        this.chat(chat);
        break;
      case "set-time":
        this.resyncAll(player, tunePatP, spinUrl);
        this.chat(chat);
        break;
      case "public":
        if (!this.isAdmin()) {
          return;
        }
        this.setPermissions("open");
        this.chat(chat);
        break;
      case "party":
        if (!this.isAdmin()) {
          return;
        }
        const permissions = store.getState().station.permissions;
        if (permissions === "open") {
          this.setPermissions("closed");
        } else {
          this.setPermissions("open");
        }
        this.chat(chat);
        break;
      case "private":
        if (!this.isAdmin()) {
          return;
        }
        this.setPermissions("closed");
        this.chat(chat);
        break;
      case "ban":
        if (!this.isAdminOrPromoted()) {
          return;
        }
        this.ban(arg);
        this.chat(chat);
        break;
      case "unban":
        if (!this.isAdminOrPromoted()) {
          return;
        }
        this.unban(arg);
        this.chat(chat);
        break;
      case "mod":
        if (!this.isAdmin()) {
          return;
        }
        this.mod(arg);
        break;
      case "unmod":
        if (!this.isAdmin()) {
          return;
        }
        this.unmod(arg);
        break;
      case "ping":
        this.ping();
        break;
      case "logout":
        this.tune(null);
        break;
      case "live":
        this.syncLive(player, tunePatP, spinUrl);
        this.chat(chat);
        break;
      case "publish":
        if (!this.isAdmin()) {
          return;
        }
        this.setDescription(arg);
        this.chat(chat);
        break;
      case "qpublish":
        if (!this.isAdmin()) {
          return;
        }
        this.setDescription(arg);
        break;
      default:
        // Image commands temporarily disabled - just send as regular chat
        // this.chatImage(command);
        this.chat(chat);
        break;
    }
  }

  private getCommandArg(chat: string) {
    if (!(chat[0] === "!")) return;

    const splitIdx = chat.indexOf(" ");
    if (splitIdx === -1) return { command: chat.slice(1), arg: "" };
    const command = chat.slice(1, splitIdx);
    const arg = chat.slice(splitIdx + 1);
    return { command, arg };
  }

  private isValidHttpUrl(string: string) {
    try {
      const url = new URL(string);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (_e) {
      return false;
    }
  }

  // Image commands temporarily disabled
  // public chatImage(command: string) {
  //   const img = (this.imgUrls as Record<string, string | undefined>)[command];
  //   if (!img) return;
  //   this.chat(img);
  // }
}
