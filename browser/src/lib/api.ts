import { SERVER } from './config';
import { i18n, t } from './i18n.svelte';

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

/** Whether there's a session (for modules that can't import account.svelte.ts without a cycle). */
export const hasSession = () => token !== null;

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
        // The server answers in this language where it can.
        'Accept-Language': i18n.lang,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'offline', t("Can't reach the Bigglenet. Check your connection."));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onSignedOut?.();
    throw new ApiError(res.status, data.error ?? 'http', data.message ?? t('Something went wrong (HTTP {status}).', { status: res.status }));
  }
  return data as T;
}

/** Like api(), but for raw file bodies. Returns the Response. */
export async function apiFetch(method: string, path: string, body?: BodyInit, type?: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(SERVER + path, {
      method,
      credentials: 'omit',
      cache: 'no-store',
      headers: { ...(type ? { 'Content-Type': type } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Accept-Language': i18n.lang },
      body,
    });
  } catch {
    throw new ApiError(0, 'offline', t("Can't reach the Bigglenet. Check your connection."));
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && token) onSignedOut?.();
    throw new ApiError(res.status, data.error ?? 'http', data.message ?? t('Something went wrong (HTTP {status}).', { status: res.status }));
  }
  return res;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : t('Something went wrong.'));
