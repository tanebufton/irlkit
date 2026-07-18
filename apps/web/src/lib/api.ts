// Thin API client. Owner auth rides on the session cookie; operator auth uses a
// bearer token pulled from the URL fragment (#token=…) so it never hits logs.
import type { Me } from "./types";

let bearer: string | null = null;

export function setBearer(token: string | null) {
  bearer = token;
}

export function getBearer() {
  return bearer;
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...init,
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText);
  }
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("application/json") ? res.json() : res.blob()) as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const api = {
  me: () => req<Me>("/auth/me"),
  login: (username: string, password: string) =>
    req<{ ok: boolean; role: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => req("/auth/logout", { method: "POST" }),

  // control (remote panel)
  scenes: () => req<{ current: string; scenes: string[] }>("/control/scenes"),
  setScene: (name: string) =>
    req("/control/scene", { method: "POST", body: JSON.stringify({ name }) }),
  startStream: () => req("/control/stream/start", { method: "POST" }),
  stopStream: () => req("/control/stream/stop", { method: "POST" }),
  audio: () => req<{ inputs: { name: string; muted: boolean }[] }>("/control/audio"),
  setMute: (name: string, muted: boolean) =>
    req("/control/audio/mute", { method: "POST", body: JSON.stringify({ name, muted }) }),

  // studio (owner)
  inputs: () => req<{ inputs: { inputName: string; inputKind: string }[] }>("/studio/inputs"),
  createScene: (name: string) =>
    req("/studio/scene", { method: "POST", body: JSON.stringify({ name }) }),
  deleteScene: (name: string) =>
    req("/studio/scene", { method: "DELETE", body: JSON.stringify({ name }) }),
  addInput: (sceneName: string, inputName: string, type: string, settings: object) =>
    req("/studio/input", {
      method: "POST",
      body: JSON.stringify({ sceneName, inputName, type, settings }),
    }),
  setDestination: (server: string, key: string) =>
    req("/studio/destination", { method: "POST", body: JSON.stringify({ server, key }) }),
  setEncoder: (preset: string, bitrateKbps?: number) =>
    req("/studio/encoder", { method: "POST", body: JSON.stringify({ preset, bitrateKbps }) }),

  // operator tokens (owner)
  tokens: () =>
    req<{ tokens: { jti: string; label: string; scopes: string[]; expiresAt: number | null; revoked: boolean }[] }>(
      "/tokens",
    ),
  createToken: (label: string, scopes: string[], ttlHours?: number) =>
    req<{ token: string; shareUrl: string }>("/tokens", {
      method: "POST",
      body: JSON.stringify({ label, scopes, ttlHours }),
    }),
  revokeToken: (jti: string) => req(`/tokens/${jti}`, { method: "DELETE" }),
};
