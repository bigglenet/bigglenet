import { SERVER } from './config';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let token: string | null = null;
let onSignedOut: (() => void) | null = null;

export function setToken(value: string | null) {
  token = value;
}

/** Called when the server says our session is no longer valid. */
export function onSessionExpired(handler: () => void) {
  onSignedOut = handler;
}

export async function api<T = Record<string, never>>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(SERVER + path, {
      method,
      credentials: 'omit',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'offline', "Can't reach the Bigglenet. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onSignedOut?.();
    throw new ApiError(res.status, data.error ?? 'http', data.message ?? `Something went wrong (HTTP ${res.status}).`);
  }
  return data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
