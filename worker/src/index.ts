import { AuthDurable, DirectoryDurable, RoomDurable } from './durables';
export { AuthDurable, DirectoryDurable, RoomDurable };
export type { Env } from "./durables";
import {
  parseJson,
  emptyResponse,
  badRequest,
  unauthorized,
  notFound,
  verifyCredentials,
  sanitizeRoomName,
  cloneRequestWithHeaders,
  hashPassword,
} from "./utils";

type Env = {
  ROOM: DurableObjectNamespace;
  DIRECTORY: DurableObjectNamespace;
  AUTH: DurableObjectNamespace;
  ZOD_PASSWORD?: string;
};

type Credentials = {
  username: string;
  password: string;
};

type RegisterRequest = {
  password?: string;
};

type LoginRequest = Credentials;

type CommandRequestBody = {
  username: string;
  password: string;
  command: string;
  payload?: unknown;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return emptyResponse();
    }

    if (url.pathname === '/api/register' && request.method === 'POST') {
      const body = await parseJson<RegisterRequest>(request);
      if (!body?.password) {
        return badRequest('password is required');
      }
      const stub = env.AUTH.get(env.AUTH.idFromName('auth'));
      return stub.fetch('https://auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: body.password }),
      });
    }

    if (url.pathname === '/api/login' && request.method === 'POST') {
      const credentials = await parseJson<LoginRequest>(request);
      if (!credentials?.username || !credentials?.password) {
        return badRequest('credentials required');
      }
      const stub = env.AUTH.get(env.AUTH.idFromName('auth'));
      return stub.fetch('https://auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(credentials),
      });
    }

    if (url.pathname === '/api/towers' && request.method === 'GET') {
      const stub = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
      return stub.fetch('https://directory/list');
    }

    // Login as ~zod with secret password
    if (url.pathname === '/api/login-zod' && request.method === 'POST') {
      const body = await parseJson<{ password?: string }>(request);
      if (!body?.password) {
        return badRequest('password required');
      }
      if (!env.ZOD_PASSWORD || body.password !== env.ZOD_PASSWORD) {
        return unauthorized();
      }
      // Create or get ~zod credentials
      const stub = env.AUTH.get(env.AUTH.idFromName('auth'));
      const response = await stub.fetch('https://auth/get-or-create-zod', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: body.password }),
      });
      return response;
    }

    if (url.pathname.startsWith('/api/rooms/')) {
      const parts = url.pathname.split('/');
      if (parts.length < 4) {
        return notFound();
      }
      const roomName = sanitizeRoomName(decodeURIComponent(parts[3]));
      if (!roomName) {
        return badRequest('invalid room');
      }

      if (parts[4] === 'ws') {
        const username = url.searchParams.get('username') ?? undefined;
        const password = url.searchParams.get('password') ?? undefined;

        const valid = await verifyCredentials(env, { username, password });
        if (!valid || !username) {
          return unauthorized();
        }

        const stub = env.ROOM.get(env.ROOM.idFromName(roomName));
        const roomRequest = cloneRequestWithHeaders(request, {
          'X-User': username,
          'X-Room-Name': roomName,
        });
        return stub.fetch(roomRequest);
      }

      if (parts[4] === 'command' && request.method === 'POST') {
        const body = await parseJson<CommandRequestBody>(request);
        if (!body?.username || !body.password || !body.command) {
          return badRequest('invalid command payload');
        }
        const valid = await verifyCredentials(env, body);
        if (!valid) {
          return unauthorized();
        }
        const stub = env.ROOM.get(env.ROOM.idFromName(roomName));
        return stub.fetch('https://room/command', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'X-User': body.username,
            'X-Room-Name': roomName,
          },
          body: JSON.stringify({
            command: body.command,
            payload: body.payload ?? null,
          }),
        });
      }
    }

    return notFound();
  },
};
