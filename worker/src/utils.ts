// src/utils.ts
import { patp } from "urbit-ob";

/* =========================
   shared types
   ========================= */

export type Credentials = {
  username: string;
  password: string;
};

export type Env = {
  ROOM: DurableObjectNamespace;
  DIRECTORY: DurableObjectNamespace;
  AUTH: DurableObjectNamespace;
};

/* =========================
   cors + responses
   ========================= */

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const buildHeaders = (extra?: Record<string, string>): Headers => {
  const headers = new Headers(corsHeaders);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      headers.set(k, v);
    }
  }
  return headers;
};

export const emptyResponse = (status = 204) =>
  new Response(null, { status, headers: buildHeaders() });

export const jsonResponse = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: buildHeaders({
      "content-type": "application/json",
      "cache-control": "no-store",
    }),
  });

export const badRequest = (message: string) =>
  jsonResponse({ error: message }, 400);

export const unauthorized = () =>
  new Response("unauthorized", { status: 401, headers: buildHeaders() });

export const notFound = () =>
  new Response("not found", { status: 404, headers: buildHeaders() });

/* =========================
   json helpers
   ========================= */

export async function parseJson<T>(
  request: Request
): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/* =========================
   auth helpers
   ========================= */

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyCredentials(
  env: Env,
  creds?: Credentials
): Promise<boolean> {
  if (!creds?.username || !creds?.password) return false;

  const stub = env.AUTH.get(env.AUTH.idFromName("auth"));
  const res = await stub.fetch("https://auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(creds),
  });

  if (!res.ok) return false;
  const { valid } = (await res.json()) as { valid: boolean };
  return valid;
}

/* =========================
   request helpers
   ========================= */

export function cloneRequestWithHeaders(
  request: Request,
  headers: HeadersInit
) {
  const next = new Headers(request.headers);
  new Headers(headers).forEach((v, k) => next.set(k, v));
  return new Request(request, { headers: next });
}

/* =========================
   room / naming helpers
   ========================= */

export const RESERVED_NAMES = new Set(["~zod"]);

export const sanitizeRoomName = (
  room?: string | null
): string | null => {
  if (!room) return null;
  let trimmed = room.trim();
  if (!trimmed.startsWith("~")) trimmed = `~${trimmed}`;
  if (!/^~[a-z0-9-]+$/i.test(trimmed)) return null;
  return trimmed.toLowerCase();
};

export function randomComet(): string {
  while (true) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const name = patp(`0x${hex}`);
    if (!RESERVED_NAMES.has(name)) return name;
  }
}

