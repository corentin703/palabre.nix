import type { ApiError, ErrorCode, JoinRequest, JoinResponse, RoomInfo, RoomKey, RuntimeConfig } from '../shared/api';

/** Error of a server response, or 'network' if we could not talk to it. */
export class ApiFailure extends Error {
  constructor(
    readonly code: ErrorCode | 'network',
    readonly status: number,
    readonly detail?: string,
  ) {
    super(code);
  }
}

/** Calls the API; `body` is sent as JSON (POST). */
export async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiFailure('network', 0);
  }
  const json = (await response.json().catch(() => ({}))) as T & Partial<ApiError>;
  if (!response.ok) throw new ApiFailure(json.code ?? 'invalid_request', response.status, json.detail);
  return json;
}

export const getRuntimeConfig = () => request<RuntimeConfig>('/visio-api/config');
export const getRoomKey = () => request<RoomKey>('/visio-api/room-key');
export const getRoomInfo = (room: string, mod: string) =>
  request<RoomInfo>(`/visio-api/room-info?room=${encodeURIComponent(room)}&m=${encodeURIComponent(mod)}`);
export const joinRoom = (join: JoinRequest) => request<JoinResponse>('/visio-api/join', join);
