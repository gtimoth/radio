// durables.ts
import { patp } from 'urbit-ob';
import {
  parseJson,
  jsonResponse,
  emptyResponse,
  badRequest,
  unauthorized,
  notFound,
  verifyCredentials,
  sanitizeRoomName,
  cloneRequestWithHeaders,
  hashPassword,
  randomComet,
  RESERVED_NAMES,
} from "./utils";

export type Env = {
  ROOM: DurableObjectNamespace;
  DIRECTORY: DurableObjectNamespace;
  AUTH: DurableObjectNamespace;
};

export class RoomDurable {
  private state: DurableObjectState;
  private env: Env;
  private roomName: string | null = null;
  private roomState: RoomState | null = null;
  private clients = new Map<string, RoomClient>();
  private viewerCounts = new Map<string, number>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return emptyResponse();
    }
    const upgradeHeader = request.headers.get('Upgrade');
    const providedRoom = request.headers.get('X-Room-Name');
    if (providedRoom && !this.roomName) {
      this.roomName = providedRoom;
    }

    if (upgradeHeader === 'websocket') {
      const user = request.headers.get('X-User');
      if (!user) {
        return unauthorized();
      }
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.accept();
      this.handleSession(server, user);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === 'POST') {
      const user = request.headers.get('X-User');
      if (!user) {
        return unauthorized();
      }
      const payload = await parseJson<{ command?: string; payload?: unknown }>(
        request
      );
      if (!payload?.command) {
        return badRequest('invalid command');
      }
      await this.executeCommand(user, {
        type: 'command',
        command: payload.command,
        payload: payload.payload,
      });
      return jsonResponse({ ok: true });
    }

    return notFound();
  }

  private async getState(): Promise<RoomState> {
    if (!this.roomState) {
      const stored =
        (await this.state.storage.get<RoomState>('state')) ||
        this.defaultState();
      this.roomState = stored;
    }
    return this.roomState;
  }

  private defaultState(): RoomState {
    return {
      description: '',
      spinUrl: '',
      spinTime: 0,
      permissions: 'closed',
      chatlog: [],
      promoted: [],
      banned: [],
      isPublic: true,
    };
  }

  private async persistState() {
    if (this.roomState) {
      await this.state.storage.put('state', this.roomState);
      await this.notifyDirectory();
    }
  }

  private handleSession(socket: WebSocket, user: string) {
    (async () => {
      const state = await this.getState();
      if (!this.roomName) {
        this.roomName = user;
      }
      if (state.banned.includes(user)) {
        socket.close(4403, 'banned');
        return;
      }
      const id = crypto.randomUUID();
      const client: RoomClient = { id, user, socket };
      this.clients.set(id, client);
      this.incrementViewer(user);
      socket.addEventListener('message', (event) =>
        this.onClientMessage(client, event)
      );
      socket.addEventListener('close', () => this.handleDisconnect(client));
      socket.addEventListener('error', () => this.handleDisconnect(client));
      await this.sendInitialState(socket);
      this.broadcastViewers();
    })().catch(() => {
      try {
        socket.close(1011, 'session error');
      } catch (_err) {
        // ignore
      }
    });
  }

  private async sendInitialState(socket: WebSocket) {
    const state = await this.getState();
    const payload = {
      'tower-update': {
        spin: { url: state.spinUrl, time: state.spinTime },
        viewers: Array.from(this.viewerCounts.keys()),
        permissions: state.permissions,
        chatlog: state.chatlog,
        description: state.description,
        promoted: state.promoted,
        banned: state.banned,
      },
    };
    socket.send(JSON.stringify(payload));
  }

  private handleDisconnect(client: RoomClient) {
    this.clients.delete(client.id);
    this.decrementViewer(client.user);
    this.broadcastViewers();
  }

  private incrementViewer(user: string) {
    const current = this.viewerCounts.get(user) ?? 0;
    this.viewerCounts.set(user, current + 1);
  }

  private decrementViewer(user: string) {
    const current = this.viewerCounts.get(user) ?? 0;
    if (current <= 1) {
      this.viewerCounts.delete(user);
    } else {
      this.viewerCounts.set(user, current - 1);
    }
  }

  private viewerList() {
    return Array.from(this.viewerCounts.keys());
  }

  private broadcast(update: Record<string, unknown>) {
    const data = JSON.stringify(update);
    for (const { socket } of this.clients.values()) {
      try {
        socket.send(data);
      } catch (_err) {
        // ignore broken sockets
      }
    }
  }

  private broadcastViewers() {
    this.broadcast({ viewers: this.viewerList() });
    this.notifyDirectory().catch(() => {});
  }

  private async notifyDirectory() {
    if (!this.roomName || !this.roomState) return;
    const payload: DirectoryUpdatePayload = {
      username: this.roomName,
      description: this.roomState.description,
      viewers: this.viewerList().length,
      updatedAt: Date.now(),
      isPublic: this.roomState.isPublic,
    };
    const stub = this.env.DIRECTORY.get(
      this.env.DIRECTORY.idFromName('directory')
    );
    await stub.fetch('https://directory/heartbeat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  private async onClientMessage(client: RoomClient, event: MessageEvent<any>) {
    try {
      const data = JSON.parse(event.data);
      await this.executeCommand(client.user, data);
    } catch (_err) {
      // ignore malformed input
    }
  }

  private async executeCommand(user: string, data: Record<string, any>) {
    if (data.type !== 'command') return;
    const state = await this.getState();
    switch (data.command) {
      case 'chat':
        await this.handleChat(user, state, data.payload);
        break;
      case 'spin':
        await this.handleSpin(user, state, data.payload);
        break;
      case 'talk':
        await this.handleTalk(user, state, data.payload);
        break;
      case 'permissions':
        await this.handlePermissions(user, state, data.payload);
        break;
      case 'description':
        await this.handleDescription(user, state, data.payload);
        break;
      case 'public':
        await this.handlePublicToggle(user, state, true);
        break;
      case 'private':
        await this.handlePublicToggle(user, state, false);
        break;
      case 'presence':
        // heartbeat, nothing special needed
        break;
      case 'ban':
        await this.handleBan(user, state, data.payload);
        break;
      case 'unban':
        await this.handleUnban(user, state, data.payload);
        break;
      case 'mod':
        await this.handleMod(user, state, data.payload);
        break;
      case 'unmod':
        await this.handleUnmod(user, state, data.payload);
        break;
      case 'delete-chat':
        await this.handleDeleteChat(user, state, data.payload);
        break;
      default:
        break;
    }
  }

  private async handleChat(
    user: string,
    state: RoomState,
    payload: { message?: string }
  ) {
    const message = (payload?.message ?? '').toString().trim();
    if (!message) return;
    const entry: ChatMessage = {
      from: user,
      message,
      time: Math.floor(Date.now() / 1000),
    };
    state.chatlog = [...state.chatlog, entry].slice(-200);
    await this.persistState();
    this.broadcast({ chat: entry });
  }

  private isAdmin(user: string) {
    return this.roomName === user;
  }

  private isPromoted(user: string, state: RoomState) {
    return state.promoted.includes(user);
  }

  private canUseDjCommands(user: string, state: RoomState) {
    if (this.isAdmin(user) || this.isPromoted(user, state)) return true;
    return state.permissions === 'open';
  }

  private async handleSpin(
    user: string,
    state: RoomState,
    payload: { url?: string; time?: number }
  ) {
    if (!this.canUseDjCommands(user, state)) return;
    const url = (payload?.url ?? '').toString().trim();
    const time = typeof payload?.time === 'number' ? payload.time : 0;
    if (!url || !this.isValidMediaUrl(url)) return;
    state.spinUrl = url;
    state.spinTime = time;
    await this.persistState();
    this.broadcast({ spin: { url, time } });
  }

  private async handleTalk(
    user: string,
    state: RoomState,
    payload: { message?: string }
  ) {
    if (!this.isAdmin(user) && !this.isPromoted(user, state)) return;
    const message = (payload?.message ?? '').toString().trim();
    if (!message) return;
    this.broadcast({ talk: message });
  }

  private async handlePermissions(
    user: string,
    state: RoomState,
    payload: { value?: 'open' | 'closed' }
  ) {
    if (!this.isAdmin(user)) return;
    if (payload?.value !== 'open' && payload?.value !== 'closed') return;
    state.permissions = payload.value;
    await this.persistState();
    this.broadcast({ permissions: state.permissions });
  }

  private async handleDescription(
    user: string,
    state: RoomState,
    payload: { value?: string }
  ) {
    if (!this.isAdmin(user)) return;
    const value = (payload?.value ?? '').toString().slice(0, 512).trim();
    state.description = value;
    await this.persistState();
    this.broadcast({ description: value });
  }

  private async handlePublicToggle(
    user: string,
    state: RoomState,
    isPublic: boolean
  ) {
    if (!this.isAdmin(user)) return;
    state.isPublic = isPublic;
    await this.persistState();
  }

  private async handleBan(
    user: string,
    state: RoomState,
    payload: { target?: string }
  ) {
    if (!this.isAdmin(user) && !this.isPromoted(user, state)) return;
    const target = sanitizeRoomName(payload?.target);
    if (!target) return;
    if (!state.banned.includes(target)) {
      state.banned.push(target);
    }
    await this.persistState();
    for (const client of this.clients.values()) {
      if (client.user === target) {
        client.socket.close(4403, 'banned');
        this.clients.delete(client.id);
      }
    }
    this.broadcast({ 'tower-update': await this.buildTowerState(state) });
    this.broadcastViewers();
  }

  private async handleUnban(
    user: string,
    state: RoomState,
    payload: { target?: string }
  ) {
    if (!this.isAdmin(user) && !this.isPromoted(user, state)) return;
    const target = sanitizeRoomName(payload?.target);
    if (!target) return;
    state.banned = state.banned.filter((entry) => entry !== target);
    await this.persistState();
    this.broadcast({ 'tower-update': await this.buildTowerState(state) });
  }

  private async handleMod(
    user: string,
    state: RoomState,
    payload: { target?: string }
  ) {
    if (!this.isAdmin(user)) return;
    const target = sanitizeRoomName(payload?.target);
    if (!target) return;
    if (!state.promoted.includes(target)) {
      state.promoted.push(target);
      await this.persistState();
      this.broadcast({ 'tower-update': await this.buildTowerState(state) });
    }
  }

  private async handleUnmod(
    user: string,
    state: RoomState,
    payload: { target?: string }
  ) {
    if (!this.isAdmin(user)) return;
    const target = sanitizeRoomName(payload?.target);
    if (!target) return;
    state.promoted = state.promoted.filter((entry) => entry !== target);
    await this.persistState();
    this.broadcast({ 'tower-update': await this.buildTowerState(state) });
  }

  private async handleDeleteChat(
    user: string,
    state: RoomState,
    payload: { from?: string; time?: number }
  ) {
    if (!this.isAdmin(user) && !this.isPromoted(user, state)) return;
    if (!payload?.from || typeof payload.time !== 'number') return;
    state.chatlog = state.chatlog.filter(
      (entry) => !(entry.from === payload.from && entry.time === payload.time)
    );
    await this.persistState();
    this.broadcast({ 'delete-chat': payload });
  }

  private async buildTowerState(state: RoomState) {
    return {
      spin: { url: state.spinUrl, time: state.spinTime },
      viewers: this.viewerList(),
      permissions: state.permissions,
      chatlog: state.chatlog,
      description: state.description,
      promoted: state.promoted,
      banned: state.banned,
    };
  }

  private isValidMediaUrl(value: string) {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_err) {
      return false;
    }
  }
}

export class DirectoryDurable {
  private state: DurableObjectState;
  private entries: Record<string, DirectoryEntry> | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return emptyResponse();
    }
    const url = new URL(request.url);
    if (url.pathname === '/list' && request.method === 'GET') {
      const entries = await this.loadEntries();
      return jsonResponse(Object.values(entries).filter((e) => e.isPublic));
    }

    if (url.pathname === '/publish' && request.method === 'POST') {
      const body = await parseJson<DirectoryPublishRequest>(request);
      if (!body?.username || !body.description) {
        return badRequest('invalid payload');
      }
      const entries = await this.loadEntries();
      const existing = entries[body.username] || {
        location: body.username,
        description: '',
        viewers: 0,
        updatedAt: Date.now(),
        isPublic: true,
      };
      entries[body.username] = {
        ...existing,
        description: body.description,
        updatedAt: Date.now(),
        isPublic: true,
      };
      await this.saveEntries(entries);
      return jsonResponse(entries[body.username]);
    }

    if (url.pathname === '/unpublish' && request.method === 'POST') {
      const body = await parseJson<Credentials>(request);
      if (!body?.username) {
        return badRequest('invalid payload');
      }
      const entries = await this.loadEntries();
      if (entries[body.username]) {
        entries[body.username].isPublic = false;
        entries[body.username].updatedAt = Date.now();
        await this.saveEntries(entries);
      }
      return jsonResponse({ ok: true });
    }

    if (url.pathname === '/heartbeat' && request.method === 'POST') {
      const payload = await parseJson<DirectoryUpdatePayload>(request);
      if (!payload?.username) {
        return badRequest('invalid payload');
      }
      const entries = await this.loadEntries();
      entries[payload.username] = {
        location: payload.username,
        description: payload.description,
        viewers: payload.viewers,
        updatedAt: payload.updatedAt,
        isPublic: payload.isPublic,
      };
      await this.saveEntries(entries);
      return jsonResponse(entries[payload.username]);
    }

    return notFound();
  }

  private async loadEntries() {
    if (!this.entries) {
      this.entries =
        (await this.state.storage.get<Record<string, DirectoryEntry>>(
          'entries'
        )) || {};
    }
    return this.entries;
  }

  private async saveEntries(entries: Record<string, DirectoryEntry>) {
    this.entries = entries;
    await this.state.storage.put('entries', entries);
  }
}

export class AuthDurable {
  private state: DurableObjectState;
  private users: Record<string, StoredUser> | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return emptyResponse();
    }
    const url = new URL(request.url);
    if (url.pathname === '/register' && request.method === 'POST') {
      const body = await parseJson<RegisterRequest>(request);
      if (!body?.password) {
        return badRequest('password required');
      }
      const users = await this.loadUsers();
      let username = randomComet();
      while (users[username] || RESERVED_NAMES.has(username)) {
        username = randomComet();
      }
      const passwordHash = await hashPassword(body.password);
      users[username] = {
        passwordHash,
        createdAt: Date.now(),
      };
      await this.saveUsers(users);
      return jsonResponse({ username, password: body.password });
    }

    if (url.pathname === '/login' && request.method === 'POST') {
      const credentials = await parseJson<LoginRequest>(request);
      const valid = await this.validate(credentials);
      if (!valid) {
        return unauthorized();
      }
      return jsonResponse({ ok: true });
    }

    if (url.pathname === '/verify' && request.method === 'POST') {
      const credentials = await parseJson<LoginRequest>(request);
      const valid = await this.validate(credentials);
      return jsonResponse({ valid });
    }

    return notFound();
  }

  private async loadUsers() {
    if (!this.users) {
      this.users =
        (await this.state.storage.get<Record<string, StoredUser>>('users')) ||
        {};
    }
    return this.users;
  }

  private async saveUsers(users: Record<string, StoredUser>) {
    this.users = users;
    await this.state.storage.put('users', users);
  }

  private async validate(credentials?: LoginRequest | null) {
    if (!credentials?.username || !credentials?.password) {
      return false;
    }
    const users = await this.loadUsers();
    const stored = users[credentials.username];
    if (!stored) return false;
    const hashed = await hashPassword(credentials.password);
    return stored.passwordHash === hashed;
  }
}
